import "./env";

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import { catalogData, createStockedItem, saveItemDetails } from "@/lib/item-edit";
import {
  formatMovementTime,
  movementActorLabel,
  movementIsConsistent,
  movementQuantityLine,
} from "@/lib/movement";
import { pinCredential } from "@/lib/pin";
import { prisma } from "@/lib/prisma";
import { adjustStock, correctStock } from "@/lib/stock";
import { migrateActorName } from "../scripts/migrate-actor-name";
import { migrateStockHistory } from "../scripts/migrate-stock-history";
import { testDatabasePath } from "./env";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const staff = { id: "", role: "STAFF", active: true, canScan: true };
const blocked = { id: "", role: "STAFF", active: true, canScan: false };
const manager = { id: "", role: "MANAGER", active: true, canScan: true };

before(async () => {
  execFileSync("npx", ["prisma", "db", "push"], {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });
  const location = await prisma.location.create({ data: { name: "Stockroom" } });
  const category = await prisma.category.create({ data: { name: "Prizes" } });
  const createdStaff = await prisma.user.create({
    data: { name: "Haven", role: "STAFF", canScan: true, ...pinCredential("3003") },
  });
  const quiet = await prisma.user.create({
    data: { name: "Quiet", role: "STAFF", canScan: false, ...pinCredential("4004") },
  });
  const createdManager = await prisma.user.create({
    data: { name: "Jenny", role: "MANAGER", ...pinCredential("2002") },
  });
  staff.id = createdStaff.id;
  blocked.id = quiet.id;
  manager.id = createdManager.id;
  await prisma.item.create({
    data: {
      name: "Tokens",
      sku: "AT-1",
      quantity: 5,
      threshold: 2,
      qrCodeData: "ZAP-ITEM-race",
      locationId: location.id,
      categoryId: category.id,
    },
  });
  await prisma.$executeRawUnsafe("PRAGMA busy_timeout = 5000");
});

after(async () => {
  await prisma.$disconnect();
  fs.rmSync(testDatabasePath, { force: true });
});

test("legacy history rows survive the audit migration", () => {
  const file = path.join(os.tmpdir(), `zap-history-${process.pid}.db`);
  fs.rmSync(file, { force: true });
  const db = new Database(file);
  db.exec(`
    CREATE TABLE Item (id TEXT PRIMARY KEY, sku TEXT NOT NULL, quantity INTEGER NOT NULL);
    CREATE TABLE History (
      id TEXT PRIMARY KEY,
      itemId TEXT NOT NULL,
      userId TEXT,
      action TEXT NOT NULL,
      amount INTEGER NOT NULL,
      timestamp DATETIME NOT NULL
    );
    INSERT INTO Item (id, sku, quantity) VALUES ('item-1', 'BB-001', 4);
    INSERT INTO History (id, itemId, userId, action, amount, timestamp)
      VALUES ('hist-1', 'item-1', NULL, 'REMOVE', 2, '2026-10-19T09:08:08.000Z');
  `);
  db.close();

  const result = migrateStockHistory(file, () => undefined);
  assert.equal(result.added, true);
  const migrated = new Database(file);
  const row = migrated.prepare("SELECT action, amount, userId, quantityBefore, quantityAfter FROM History WHERE id = 'hist-1'").get() as {
    action: string;
    amount: number;
    userId: string | null;
    quantityBefore: number | null;
    quantityAfter: number | null;
  };
  const item = migrated.prepare("SELECT quantity FROM Item WHERE id = 'item-1'").get() as { quantity: number };
  assert.equal(row.action, "REMOVE");
  assert.equal(row.amount, 2);
  assert.equal(row.userId, null);
  assert.equal(row.quantityBefore, null);
  assert.equal(row.quantityAfter, null);
  assert.equal(item.quantity, 4);
  assert.equal(movementActorLabel(null), "Unknown");
  assert.equal(movementQuantityLine(row), "Recorded before counts were tracked");
  migrated.close();
  fs.rmSync(file, { force: true });
});

test("actor-name migration keeps history identity and item quantities", () => {
  const file = path.join(os.tmpdir(), `zap-actor-${process.pid}.db`);
  fs.rmSync(file, { force: true });
  const db = new Database(file);
  db.exec(`
    CREATE TABLE User (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE Item (id TEXT PRIMARY KEY, sku TEXT NOT NULL, quantity INTEGER NOT NULL);
    CREATE TABLE History (
      id TEXT PRIMARY KEY,
      itemId TEXT NOT NULL,
      userId TEXT,
      action TEXT NOT NULL,
      amount INTEGER NOT NULL,
      timestamp DATETIME NOT NULL
    );
    INSERT INTO User (id, name) VALUES ('user-1', 'Casey');
    INSERT INTO Item (id, sku, quantity) VALUES ('item-1', 'BB-001', 4);
    INSERT INTO History (id, itemId, userId, action, amount, timestamp)
      VALUES ('hist-1', 'item-1', 'user-1', 'REMOVE', 2, '2026-10-19T09:08:08.000Z');
    INSERT INTO History (id, itemId, userId, action, amount, timestamp)
      VALUES ('hist-2', 'item-1', NULL, 'ADD', 1, '2026-10-19T09:09:08.000Z');
  `);
  db.close();

  const first = migrateActorName(file, () => undefined);
  assert.equal(first.filled, 1);
  const again = migrateActorName(file, () => undefined);
  assert.equal(again.filled, 0);
  const migrated = new Database(file);
  const named = migrated.prepare("SELECT userId, actorName, amount FROM History WHERE id = 'hist-1'").get() as {
    userId: string | null;
    actorName: string | null;
    amount: number;
  };
  const blank = migrated.prepare("SELECT userId, actorName FROM History WHERE id = 'hist-2'").get() as {
    userId: string | null;
    actorName: string | null;
  };
  const item = migrated.prepare("SELECT quantity FROM Item WHERE id = 'item-1'").get() as { quantity: number };
  assert.equal(named.userId, "user-1");
  assert.equal(named.actorName, "Casey");
  assert.equal(named.amount, 2);
  assert.equal(blank.userId, null);
  assert.equal(blank.actorName, null);
  assert.equal(item.quantity, 4);
  migrated.close();
  fs.rmSync(file, { force: true });
});

test("permissions reject staff who cannot scan and staff stock corrections", async () => {
  const denied = await adjustStock("ZAP-ITEM-race", "REMOVE", 1, blocked, "perm-denied-01");
  assert.equal("error" in denied && denied.error, "Scanning is turned off for this account.");

  const unsigned = await adjustStock("ZAP-ITEM-race", "REMOVE", 1, null, "perm-denied-02");
  assert.equal("error" in unsigned && unsigned.error, "Sign in to scan.");

  const bogus = await adjustStock("ZAP-ITEM-race", "STEAL", 1, staff, "perm-denied-03");
  assert.equal("error" in bogus && bogus.error, "That stock action is not recognized.");

  const fraction = await adjustStock("ZAP-ITEM-race", "REMOVE", 1.5, staff, "perm-denied-04");
  assert.equal("error" in fraction && fraction.error, "Enter a whole number of 1 or more.");

  const correction = await correctStock("missing", 1, 5, "count", "perm-correct-1", staff);
  assert.match("error" in correction ? correction.error : "", /admins and managers/);

  const item = await prisma.item.findUniqueOrThrow({ where: { qrCodeData: "ZAP-ITEM-race" } });
  assert.equal(item.quantity, 5);
  assert.equal(await prisma.history.count({ where: { itemId: item.id } }), 0);
});

test("insufficient stock does not change quantity or history", async () => {
  const result = await adjustStock("ZAP-ITEM-race", "REMOVE", 6, staff, "short-stock-01");
  assert.equal("error" in result && result.error, "Only 5 in stock.");
  const item = await prisma.item.findUniqueOrThrow({ where: { qrCodeData: "ZAP-ITEM-race" } });
  assert.equal(item.quantity, 5);
  assert.equal(await prisma.history.count({ where: { itemId: item.id } }), 0);
});

test("a repeated submission records one movement", async () => {
  const first = await adjustStock("ZAP-ITEM-race", "REMOVE", 1, staff, "repeat-submit-1", "floor count");
  const second = await adjustStock("ZAP-ITEM-race", "REMOVE", 1, staff, "repeat-submit-1", "floor count");
  assert.equal("item" in first && first.item.quantity, 4);
  assert.equal("item" in second && second.item.quantity, 4);
  const item = await prisma.item.findUniqueOrThrow({ where: { qrCodeData: "ZAP-ITEM-race" } });
  const rows = await prisma.history.findMany({ where: { itemId: item.id } });
  assert.equal(item.quantity, 4);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.userId, staff.id);
  assert.equal(rows[0]?.actorName, "Haven");
  assert.equal(rows[0]?.action, "REMOVE");
  assert.equal(rows[0]?.amount, 1);
  assert.equal(rows[0]?.quantityBefore, 5);
  assert.equal(rows[0]?.quantityAfter, 4);
  assert.equal(rows[0]?.reason, "floor count");
  assert.equal(movementIsConsistent(rows[0]!), true);
  assert.ok(rows[0]?.timestamp instanceof Date);
});

test("concurrent deductions cannot go negative or drop an update", async () => {
  const starting = await prisma.item.findUniqueOrThrow({ where: { qrCodeData: "ZAP-ITEM-race" } });
  const results = await Promise.all([
    adjustStock("ZAP-ITEM-race", "REMOVE", 2, staff, "race-a-00001"),
    adjustStock("ZAP-ITEM-race", "REMOVE", 2, manager, "race-b-00002"),
    adjustStock("ZAP-ITEM-race", "REMOVE", 2, staff, "race-c-00003"),
  ]);
  const successes = results.filter((result) => "item" in result);
  const failures = results.filter((result) => "error" in result);
  const item = await prisma.item.findUniqueOrThrow({ where: { qrCodeData: "ZAP-ITEM-race" } });
  const rows = await prisma.history.findMany({
    where: { itemId: item.id, action: "REMOVE", amount: 2 },
    orderBy: { quantityAfter: "desc" },
  });
  assert.equal(successes.length, 2);
  assert.equal(failures.length, 1);
  assert.match("error" in failures[0]! ? failures[0].error : "", /Only \d+ in stock/);
  assert.equal(rows.length, 2);
  assert.ok(item.quantity >= 0);
  for (const row of rows) {
    assert.equal(movementIsConsistent(row), true);
    assert.ok(row.userId === staff.id || row.userId === manager.id);
  }
  const removed = rows.reduce((sum, row) => sum + row.amount, 0);
  assert.equal(starting.quantity - removed, item.quantity);

  const raw = new Database(testDatabasePath);
  raw.prepare("UPDATE Item SET quantity = 3 WHERE qrCodeData = ?").run("ZAP-ITEM-race");
  const deduct = raw.transaction(() => {
    return raw
      .prepare("UPDATE Item SET quantity = quantity - 2 WHERE qrCodeData = ? AND quantity >= 2")
      .run("ZAP-ITEM-race").changes;
  });
  const firstChange = deduct.immediate();
  const secondChange = deduct.immediate();
  const after = raw.prepare("SELECT quantity FROM Item WHERE qrCodeData = ?").get("ZAP-ITEM-race") as {
    quantity: number;
  };
  raw.close();
  assert.equal(firstChange, 1);
  assert.equal(secondChange, 0);
  assert.equal(after.quantity, 1);
});

test("corrections require a reason and do not overwrite a conflicting count", async () => {
  const item = await prisma.item.findUniqueOrThrow({ where: { qrCodeData: "ZAP-ITEM-race" } });
  const missingReason = await correctStock(item.id, 3, item.quantity, "  ", "correct-blank-1", manager);
  assert.equal("error" in missingReason && missingReason.error, "A reason is required.");

  const conflict = await correctStock(item.id, 3, item.quantity + 5, "shelf count", "correct-stale-1", manager);
  assert.equal(
    "error" in conflict && conflict.error,
    "Stock changed on another device. Reload and try again."
  );

  const saved = await correctStock(item.id, 3, item.quantity, "shelf count", "correct-ok-0001", manager);
  assert.equal("item" in saved && saved.item.quantity, 3);
  const again = await correctStock(item.id, 3, item.quantity, "shelf count", "correct-ok-0001", manager);
  assert.equal("item" in again && again.item.quantity, 3);

  const updated = await prisma.item.findUniqueOrThrow({ where: { id: item.id } });
  const audit = await prisma.history.findMany({ where: { itemId: item.id, action: "AUDIT" } });
  assert.equal(updated.quantity, 3);
  assert.equal(audit.length, 1);
  assert.equal(audit[0]?.quantityBefore, item.quantity);
  assert.equal(audit[0]?.quantityAfter, 3);
  assert.equal(audit[0]?.userId, manager.id);
  assert.equal(audit[0]?.reason, "shelf count");
  assert.equal(movementIsConsistent(audit[0]!), true);
});

test("editing item details keeps quantity and the opening movement", async () => {
  const location = await prisma.location.findFirstOrThrow();
  const category = await prisma.category.findFirstOrThrow();
  const created = await createStockedItem(manager, {
    id: "item-created",
    name: "Plush",
    sku: "PL-1",
    description: null,
    quantity: 4,
    threshold: 1,
    locationId: location.id,
    categoryId: category.id,
    receivedAt: new Date("2026-10-22T12:00:00.000Z"),
    outOfStockAt: null,
    isManualOos: false,
    qrCodeData: "ZAP-ITEM-created",
    requestId: "create-item-001",
  });
  assert.equal("qrCodeData" in created && created.qrCodeData, "ZAP-ITEM-created");
  const repeated = await createStockedItem(manager, {
    id: "item-created-again",
    name: "Plush copy",
    sku: "PL-2",
    description: null,
    quantity: 9,
    threshold: 1,
    locationId: location.id,
    categoryId: category.id,
    receivedAt: new Date("2026-10-22T12:00:00.000Z"),
    outOfStockAt: null,
    isManualOos: false,
    qrCodeData: "ZAP-ITEM-created-again",
    requestId: "create-item-001",
  });
  assert.equal("qrCodeData" in repeated && repeated.qrCodeData, "ZAP-ITEM-created");
  assert.equal(await prisma.item.count({ where: { sku: "PL-2" } }), 0);

  const details = catalogData({
    name: "Plush bear",
    sku: "PL-1",
    description: "Prize",
    threshold: 2,
    locationId: location.id,
    categoryId: category.id,
    receivedAt: new Date("2026-10-22T12:00:00.000Z"),
    outOfStockAt: null,
    isManualOos: false,
  });
  assert.equal("quantity" in details, false);
  const saved = await saveItemDetails(manager, "item-created", details);
  assert.equal("saved" in saved && saved.quantity, 4);

  const item = await prisma.item.findUniqueOrThrow({ where: { id: "item-created" } });
  const history = await prisma.history.findMany({ where: { itemId: item.id } });
  assert.equal(item.quantity, 4);
  assert.equal(item.name, "Plush bear");
  assert.equal(history.length, 1);
  assert.equal(history[0]?.action, "NEW_ITEM");
  assert.equal(history[0]?.quantityBefore, 0);
  assert.equal(history[0]?.quantityAfter, 4);
  assert.equal(history[0]?.userId, manager.id);
  assert.equal(movementIsConsistent(history[0]!), true);
  assert.match(formatMovementTime(history[0]!.timestamp), /2026/);
});
