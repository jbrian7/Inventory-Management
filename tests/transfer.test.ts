import "./env";

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import { loadDashboard } from "@/lib/dashboard";
import { deleteLocationIfEmpty, locationDeleteError } from "@/lib/locations";
import { movementIsConsistent, movementQuantityLine } from "@/lib/movement";
import { pinCredential } from "@/lib/pin";
import { prisma } from "@/lib/prisma";
import { adjustStock, findItemByQr } from "@/lib/stock";
import { topMovers } from "@/lib/top-movers";
import { nextTransferRequestId } from "@/lib/transfer-request";
import { transferStock } from "@/lib/transfer";
import { migrateIntake } from "../scripts/migrate-intake";
import { migrateLocationBalances } from "../scripts/migrate-location-balances";
import { testDatabasePath } from "./env";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const staff = { id: "", role: "STAFF", active: true, canScan: true };
const blocked = { id: "", role: "STAFF", active: true, canScan: false };
const manager = { id: "", role: "MANAGER", active: true, canScan: true };

let stockroomId = "";
let counterId = "";

function legacyDatabase(file: string, quantity = 100) {
  fs.rmSync(file, { force: true });
  const db = new Database(file);
  db.exec(`
    CREATE TABLE Location (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE Category (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE Item (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sku TEXT NOT NULL,
      description TEXT,
      quantity INTEGER NOT NULL DEFAULT 0,
      threshold INTEGER NOT NULL DEFAULT 5,
      locationId TEXT NOT NULL,
      categoryId TEXT NOT NULL,
      qrCodeData TEXT NOT NULL,
      receivedAt DATETIME,
      outOfStockAt DATETIME,
      isManualOos BOOLEAN NOT NULL DEFAULT false,
      createdAt DATETIME NOT NULL,
      updatedAt DATETIME NOT NULL
    );
    CREATE UNIQUE INDEX Item_sku_key ON Item(sku);
    CREATE UNIQUE INDEX Item_qrCodeData_key ON Item(qrCodeData);
    CREATE TABLE History (
      id TEXT PRIMARY KEY,
      itemId TEXT NOT NULL,
      userId TEXT,
      action TEXT NOT NULL,
      amount INTEGER NOT NULL,
      timestamp DATETIME NOT NULL,
      quantityBefore INTEGER,
      quantityAfter INTEGER,
      reason TEXT,
      requestId TEXT,
      actorName TEXT
    );
    INSERT INTO Location (id, name) VALUES ('loc-stock', 'Stockroom');
    INSERT INTO Category (id, name) VALUES ('cat-1', 'Prizes');
    INSERT INTO Item (
      id, name, sku, description, quantity, threshold, locationId, categoryId, qrCodeData,
      receivedAt, outOfStockAt, isManualOos, createdAt, updatedAt
    ) VALUES (
      'item-balls', 'Bouncy balls', 'BB-001', 'Party favor', ${quantity}, 5, 'loc-stock', 'cat-1',
      'ZAP-ITEM-item-balls', '2026-10-19T08:23:21.000Z', NULL, 0,
      '2026-10-19T08:23:21.000Z', '2026-10-19T08:23:21.000Z'
    );
    INSERT INTO History (id, itemId, userId, action, amount, timestamp, quantityBefore, quantityAfter, actorName)
      VALUES ('hist-1', 'item-balls', NULL, 'REMOVE', 2, '2026-10-19T09:08:08.000Z', 5, 4, NULL);
  `);
  db.close();
}

before(async () => {
  execFileSync("npx", ["prisma", "db", "push"], {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });
  const stockroom = await prisma.location.create({ data: { name: "Stockroom" } });
  const counter = await prisma.location.create({ data: { name: "Redemption Counter" } });
  const category = await prisma.category.create({ data: { name: "Prizes" } });
  stockroomId = stockroom.id;
  counterId = counter.id;
  const createdStaff = await prisma.user.create({
    data: { name: "Alex", role: "STAFF", canScan: true, ...pinCredential("3003") },
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
      name: "Bouncy balls",
      sku: "BB-001",
      threshold: 5,
      qrCodeData: "ZAP-ITEM-balls",
      categoryId: category.id,
      balances: { create: { locationId: stockroom.id, quantity: 100 } },
    },
  });
  await prisma.item.create({
    data: {
      name: "Race tokens",
      sku: "RC-1",
      threshold: 1,
      qrCodeData: "ZAP-ITEM-race-transfer",
      categoryId: category.id,
      balances: { create: { locationId: stockroom.id, quantity: 5 } },
    },
  });
  await prisma.$executeRawUnsafe("PRAGMA busy_timeout = 5000");
});

after(async () => {
  await prisma.$disconnect();
  fs.rmSync(testDatabasePath, { force: true });
});

async function balances(sku: string) {
  const item = await prisma.item.findUniqueOrThrow({
    where: { sku },
    include: { balances: { include: { location: true } } },
  });
  const byName = new Map(item.balances.map((balance) => [balance.location.name, balance.quantity]));
  const total = item.balances.reduce((sum, balance) => sum + balance.quantity, 0);
  return { item, byName, total };
}

test("migration keeps the exact quantity at the current location only", () => {
  const file = path.join(os.tmpdir(), `zap-balances-${process.pid}.db`);
  legacyDatabase(file, 100);
  const first = migrateLocationBalances(file, () => undefined);
  assert.equal(first.alreadyMigrated, false);
  assert.equal(first.items, 1);
  const again = migrateLocationBalances(file, () => undefined);
  assert.equal(again.alreadyMigrated, true);

  const db = new Database(file);
  const columns = new Set(
    (db.prepare("PRAGMA table_info(Item)").all() as { name: string }[]).map((column) => column.name)
  );
  assert.equal(columns.has("quantity"), false);
  assert.equal(columns.has("locationId"), false);
  const rows = db
    .prepare(
      `SELECT Item.id, Item.sku, Item.qrCodeData, StockBalance.locationId, StockBalance.quantity
       FROM Item JOIN StockBalance ON StockBalance.itemId = Item.id ORDER BY StockBalance.locationId`
    )
    .all() as { id: string; sku: string; qrCodeData: string; locationId: string; quantity: number }[];
  assert.deepEqual(rows, [
    {
      id: "item-balls",
      sku: "BB-001",
      qrCodeData: "ZAP-ITEM-item-balls",
      locationId: "loc-stock",
      quantity: 100,
    },
  ]);
  const history = db.prepare("SELECT id, action, amount, userId, quantityBefore, quantityAfter FROM History").get() as {
    id: string;
    action: string;
    amount: number;
    userId: string | null;
    quantityBefore: number | null;
    quantityAfter: number | null;
  };
  assert.equal(history.id, "hist-1");
  assert.equal(history.action, "REMOVE");
  assert.equal(history.amount, 2);
  assert.equal(history.userId, null);
  assert.equal(history.quantityBefore, 5);
  assert.equal(history.quantityAfter, 4);
  assert.equal(movementQuantityLine(history), "5 → 4");
  db.close();
  fs.rmSync(file, { force: true });
});

test("a balance that disagrees with the old quantity aborts before columns are dropped", () => {
  const file = path.join(os.tmpdir(), `zap-balances-conflict-${process.pid}.db`);
  legacyDatabase(file, 100);
  const db = new Database(file);
  db.exec(`
    CREATE TABLE StockBalance (
      id TEXT PRIMARY KEY,
      itemId TEXT NOT NULL,
      locationId TEXT NOT NULL,
      quantity INTEGER NOT NULL
    );
    INSERT INTO StockBalance (id, itemId, locationId, quantity)
      VALUES ('bad', 'item-balls', 'loc-stock', 90);
  `);
  db.close();
  assert.throws(() => migrateLocationBalances(file, () => undefined), /does not match/);
  const after = new Database(file);
  const item = after.prepare("SELECT quantity FROM Item WHERE id = 'item-balls'").get() as { quantity: number };
  assert.equal(item.quantity, 100);
  after.close();
  fs.rmSync(file, { force: true });
});

test("a disposable copy of the populated database keeps item totals and QR codes", () => {
  const live = path.join(repoRoot, "dev.db");
  if (!fs.existsSync(live)) {
    return;
  }
  const beforeHash = createHash("sha256").update(fs.readFileSync(live)).digest("hex");
  const copy = path.join(os.tmpdir(), `zap-live-copy-${process.pid}.db`);
  fs.copyFileSync(live, copy);
  const migrated = migrateLocationBalances(copy, () => undefined);
  assert.equal(migrated.items > 0, true);
  migrateLocationBalances(copy, () => undefined);
  migrateIntake(copy, () => undefined);
  execFileSync("npx", ["prisma", "db", "push"], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: `file:${copy}` },
    stdio: "pipe",
  });
  const db = new Database(copy);
  const rows = db
    .prepare(
      `SELECT Item.sku AS sku, Item.qrCodeData AS qrCodeData, Location.name AS location, StockBalance.quantity AS quantity
       FROM StockBalance
       JOIN Item ON Item.id = StockBalance.itemId
       JOIN Location ON Location.id = StockBalance.locationId
       ORDER BY Item.sku`
    )
    .all() as { sku: string; qrCodeData: string; location: string; quantity: number }[];
  const bySku = new Map(rows.map((row) => [row.sku, row]));
  assert.equal(bySku.get("BB-001")?.quantity, 4);
  assert.equal(bySku.get("BB-001")?.location, "Redemption Counter");
  assert.equal(bySku.get("BB-001")?.qrCodeData, "ZAP-ITEM-cmvezlzbx00007hjs7yhf5ogm");
  assert.equal(bySku.get("AT-010")?.quantity, 30);
  assert.equal(bySku.get("AT-010")?.location, "Stockroom");
  assert.equal(bySku.get("SQ-001")?.quantity, 2);
  assert.equal(rows.length, 3);
  const history = db.prepare("SELECT COUNT(*) AS n FROM History").get() as { n: number };
  assert.equal(history.n, 5);
  const columns = new Set(
    (db.prepare("PRAGMA table_info(Item)").all() as { name: string }[]).map((column) => column.name)
  );
  assert.equal(columns.has("quantity"), false);
  db.close();
  fs.rmSync(copy, { force: true });
  const afterHash = createHash("sha256").update(fs.readFileSync(live)).digest("hex");
  assert.equal(afterHash, beforeHash);
});

test("unauthorized transfers and invalid quantities change nothing", async () => {
  const denied = await transferStock("missing", stockroomId, counterId, 1, blocked, "xfer-denied-01");
  assert.match("error" in denied ? denied.error : "", /Scanning is turned off/);
  const signedOut = await transferStock("missing", stockroomId, counterId, 1, null, "xfer-denied-02");
  assert.equal("error" in signedOut && signedOut.error, "Sign in to scan.");

  const item = await prisma.item.findUniqueOrThrow({ where: { sku: "BB-001" } });
  for (const amount of [0, -1, 1.5, "x"]) {
    const result = await transferStock(item.id, stockroomId, counterId, amount, staff, "xfer-bad-amount");
    assert.equal("error" in result && result.error, "Enter a whole number of 1 or more.");
  }
  const same = await transferStock(item.id, stockroomId, stockroomId, 1, staff, "xfer-same-place");
  assert.equal("error" in same && same.error, "Choose two different locations.");
  const short = await transferStock(item.id, stockroomId, counterId, 101, manager, "xfer-short-0001");
  assert.equal("error" in short && short.error, "Only 100 in stock at Stockroom.");

  const stock = await balances("BB-001");
  assert.equal(stock.total, 100);
  assert.equal(stock.byName.get("Stockroom"), 100);
  assert.equal(stock.byName.has("Redemption Counter"), false);
  assert.equal(await prisma.history.count({ where: { itemId: item.id, action: "TRANSFER" } }), 0);
});

test("a transfer updates both locations, keeps the total, and can be repeated safely", async () => {
  const item = await prisma.item.findUniqueOrThrow({ where: { sku: "BB-001" } });
  const moved = await transferStock(item.id, stockroomId, counterId, 20, staff, "xfer-ok-000001", "restock counter");
  assert.equal("item" in moved && moved.item.quantity, 100);
  const again = await transferStock(item.id, stockroomId, counterId, 20, staff, "xfer-ok-000001", "restock counter");
  assert.equal("item" in again && again.item.quantity, 100);

  const stock = await balances("BB-001");
  assert.equal(stock.byName.get("Stockroom"), 80);
  assert.equal(stock.byName.get("Redemption Counter"), 20);
  assert.equal(stock.total, 100);
  const rows = await prisma.history.findMany({ where: { itemId: item.id, action: "TRANSFER" } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.amount, 20);
  assert.equal(rows[0]?.userId, staff.id);
  assert.equal(rows[0]?.actorName, "Alex");
  assert.equal(rows[0]?.fromLocationName, "Stockroom");
  assert.equal(rows[0]?.toLocationName, "Redemption Counter");
  assert.equal(rows[0]?.sourceQuantityBefore, 100);
  assert.equal(rows[0]?.sourceQuantityAfter, 80);
  assert.equal(rows[0]?.destinationQuantityBefore, 0);
  assert.equal(rows[0]?.destinationQuantityAfter, 20);
  assert.equal(rows[0]?.quantityBefore, 100);
  assert.equal(rows[0]?.quantityAfter, 100);
  assert.equal(rows[0]?.reason, "restock counter");
  assert.equal(movementIsConsistent(rows[0]!), true);
  assert.equal(movementQuantityLine(rows[0]!), "Stockroom → Redemption Counter (100 → 80, 0 → 20)");
  assert.equal(await prisma.history.count({ where: { itemId: item.id, action: { in: ["ADD", "REMOVE"] } } }), 0);
});

test("add and remove change only the chosen location", async () => {
  const item = await prisma.item.findUniqueOrThrow({ where: { sku: "BB-001" } });
  const ambiguous = await adjustStock("ZAP-ITEM-balls", "REMOVE", 1, staff, "loc-missing-01");
  assert.equal("error" in ambiguous && ambiguous.error, "Choose a location.");
  let stock = await balances("BB-001");
  assert.equal(stock.byName.get("Stockroom"), 80);
  assert.equal(stock.byName.get("Redemption Counter"), 20);

  const added = await adjustStock("ZAP-ITEM-balls", "ADD", 2, staff, "loc-add-00001", undefined, prisma, counterId);
  assert.equal("item" in added && added.item.quantity, 102);
  const removed = await adjustStock(
    "ZAP-ITEM-balls",
    "REMOVE",
    2,
    manager,
    "loc-remove-001",
    undefined,
    prisma,
    counterId
  );
  assert.equal("item" in removed && removed.item.quantity, 100);
  stock = await balances("BB-001");
  assert.equal(stock.byName.get("Stockroom"), 80);
  assert.equal(stock.byName.get("Redemption Counter"), 20);

  const found = await findItemByQr("ZAP-ITEM-balls", staff);
  assert.equal("item" in found && found.item.qrCodeData, "ZAP-ITEM-balls");
  assert.equal("item" in found && found.item.quantity, 100);
  assert.equal("item" in found && found.item.locations.length, 2);
});

test("a failed transfer leaves both balances unchanged", async () => {
  const raw = new Database(testDatabasePath);
  raw.exec(`
    CREATE TRIGGER fail_transfer_history BEFORE INSERT ON History
    WHEN NEW.action = 'TRANSFER' AND NEW.reason = 'force-fail'
    BEGIN
      SELECT RAISE(ABORT, 'forced transfer failure');
    END;
  `);
  raw.close();
  const item = await prisma.item.findUniqueOrThrow({ where: { sku: "BB-001" } });
  await assert.rejects(
    () => transferStock(item.id, stockroomId, counterId, 5, manager, "xfer-fail-0001", "force-fail"),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      assert.match(message, /forced transfer failure|constraint/i);
      return true;
    }
  );
  const stock = await balances("BB-001");
  assert.equal(stock.byName.get("Stockroom"), 80);
  assert.equal(stock.byName.get("Redemption Counter"), 20);
  assert.equal(stock.total, 100);
  assert.equal(await prisma.history.count({ where: { requestId: "xfer-fail-0001" } }), 0);
  const cleanup = new Database(testDatabasePath);
  cleanup.exec("DROP TRIGGER fail_transfer_history");
  cleanup.close();
});

test("concurrent transfers cannot overspend the source", async () => {
  const item = await prisma.item.findUniqueOrThrow({ where: { sku: "RC-1" } });
  const results = await Promise.all([
    transferStock(item.id, stockroomId, counterId, 4, staff, "xfer-race-0001"),
    transferStock(item.id, stockroomId, counterId, 4, manager, "xfer-race-0002"),
  ]);
  const successes = results.filter((result) => "item" in result);
  const failures = results.filter((result) => "error" in result);
  const stock = await balances("RC-1");
  assert.equal(successes.length, 1);
  assert.equal(failures.length, 1);
  assert.match("error" in failures[0]! ? failures[0].error : "", /Only \d+ in stock/);
  assert.equal(stock.total, 5);
  assert.equal((stock.byName.get("Stockroom") ?? 0) >= 0, true);
  assert.equal((stock.byName.get("Redemption Counter") ?? 0) >= 0, true);
  assert.equal((stock.byName.get("Stockroom") ?? 0) + (stock.byName.get("Redemption Counter") ?? 0), 5);
  const rows = await prisma.history.findMany({ where: { itemId: item.id, action: "TRANSFER" } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.amount, 4);
});

test("dashboard totals do not count a transfer twice and older rows stay readable", async () => {
  const balls = await prisma.item.findUniqueOrThrow({ where: { sku: "BB-001" } });
  await prisma.history.create({
    data: {
      itemId: balls.id,
      action: "REMOVE",
      amount: 1,
      quantityBefore: 5,
      quantityAfter: 4,
      userId: null,
      timestamp: new Date("2026-10-19T09:08:08.000Z"),
    },
  });
  const legacy = await prisma.history.findFirstOrThrow({
    where: { itemId: balls.id, action: "REMOVE", quantityBefore: 5 },
  });
  assert.equal(movementQuantityLine(legacy), "5 → 4");
  assert.equal(legacy.action, "REMOVE");

  const dashboard = await loadDashboard();
  const stock = await balances("BB-001");
  const race = await balances("RC-1");
  assert.equal(dashboard.onHand, stock.total + race.total);
  assert.equal(stock.total, 100);
  const transferRows = await prisma.history.count({ where: { action: "TRANSFER" } });
  const paired = await prisma.history.count({
    where: { action: { in: ["ADD", "REMOVE"] }, requestId: { startsWith: "xfer-" } },
  });
  assert.equal(paired, 0);
  assert.equal(transferRows >= 1, true);
  const movers = await topMovers();
  const ballsMoved = movers.find((item) => item.sku === "BB-001");
  assert.equal(ballsMoved?.removed, 3);
  assert.equal(dashboard.lowStock.some((item) => item.name === "Bouncy balls"), false);
});

test("a location with stock cannot be deleted until the quantity is gone", async () => {
  assert.equal(locationDeleteError(4), "Transfer the stock out of this location before deleting it.");
  assert.equal(locationDeleteError(0), null);
  const held = await deleteLocationIfEmpty(stockroomId);
  assert.equal("error" in held && held.error, "Transfer the stock out of this location before deleting it.");
  const empty = await prisma.location.create({ data: { name: "Cage" } });
  await prisma.stockBalance.create({
    data: { itemId: (await prisma.item.findUniqueOrThrow({ where: { sku: "BB-001" } })).id, locationId: empty.id, quantity: 0 },
  });
  const removed = await deleteLocationIfEmpty(empty.id);
  assert.equal("deleted" in removed && removed.deleted, true);
  assert.equal(await prisma.location.count({ where: { id: empty.id } }), 0);
  assert.equal(await prisma.stockBalance.count({ where: { locationId: empty.id } }), 0);
});

test("each completed transfer from the form receives a new request id", async () => {
  const created = ["form-req-0001", "form-req-0002", "form-req-0003", "form-req-0004"];
  let cursor = 0;
  const createId = () => {
    const id = created[cursor];
    cursor += 1;
    if (!id) {
      throw new Error("The form asked for another id.");
    }
    return id;
  };
  let retry: string | null = null;
  const attempts: string[] = [];
  function submit(uncertain: boolean) {
    const id = nextTransferRequestId(retry, createId);
    attempts.push(id);
    retry = uncertain ? id : null;
    return id;
  }

  submit(false);
  submit(false);
  submit(false);
  const uncertain = submit(true);
  const retried = submit(false);
  assert.deepEqual(attempts.slice(0, 3), created.slice(0, 3));
  assert.equal(retried, uncertain);
  assert.equal(new Set(attempts).size, 4);

  const form = fs.readFileSync(path.join(repoRoot, "app/items/transfer-form.tsx"), "utf8");
  assert.equal(form.includes("useEffect"), false);
  assert.equal(form.includes("crypto.randomUUID"), false);
  assert.equal(form.includes("useState(() =>"), false);
  assert.match(form, /nextTransferRequestId\(retryId\.current\)/);
  assert.match(form, /formData\.set\("requestId", requestId\)/);
  assert.equal(form.includes('name="requestId"'), false);
});

test("consecutive transfers move stock and a reused id cannot describe a different move", async () => {
  const category = await prisma.category.findFirstOrThrow();
  const floor = await prisma.location.create({ data: { name: "Floor" } });
  const item = await prisma.item.create({
    data: {
      name: "Sequence balls",
      sku: "SEQ-1",
      threshold: 1,
      qrCodeData: "ZAP-ITEM-seq",
      categoryId: category.id,
      balances: { create: { locationId: stockroomId, quantity: 10 } },
    },
  });
  const other = await prisma.item.create({
    data: {
      name: "Other balls",
      sku: "SEQ-2",
      threshold: 1,
      qrCodeData: "ZAP-ITEM-seq-2",
      categoryId: category.id,
      balances: { create: { locationId: stockroomId, quantity: 10 } },
    },
  });

  const ids = ["seq-req-00001", "seq-req-00002", "seq-req-00003"];
  for (const requestId of ids) {
    const moved = await transferStock(item.id, stockroomId, counterId, 1, staff, requestId);
    assert.equal("error" in moved, false);
  }
  let stock = await balances("SEQ-1");
  assert.equal(stock.byName.get("Stockroom"), 7);
  assert.equal(stock.byName.get("Redemption Counter"), 3);
  assert.equal(stock.total, 10);

  const duplicate = await transferStock(item.id, stockroomId, counterId, 1, staff, "seq-req-00003", "same move");
  assert.equal("item" in duplicate && duplicate.item.quantity, 10);
  stock = await balances("SEQ-1");
  assert.equal(stock.byName.get("Stockroom"), 7);
  assert.equal(stock.byName.get("Redemption Counter"), 3);
  assert.equal(await prisma.history.count({ where: { requestId: "seq-req-00003" } }), 1);

  const differentAmount = await transferStock(item.id, stockroomId, counterId, 2, staff, "seq-req-00003");
  assert.equal("error" in differentAmount && differentAmount.error, "That request was already used for a different transfer.");
  const differentDestination = await transferStock(item.id, stockroomId, floor.id, 1, staff, "seq-req-00003");
  assert.equal(
    "error" in differentDestination && differentDestination.error,
    "That request was already used for a different transfer."
  );
  const differentSource = await transferStock(item.id, counterId, stockroomId, 1, staff, "seq-req-00003");
  assert.equal(
    "error" in differentSource && differentSource.error,
    "That request was already used for a different transfer."
  );
  const differentItem = await transferStock(other.id, stockroomId, counterId, 1, staff, "seq-req-00003");
  assert.equal("error" in differentItem && differentItem.error, "That request was already used for a different transfer.");

  await prisma.history.create({
    data: {
      itemId: item.id,
      action: "ADD",
      amount: 1,
      requestId: "seq-req-add001",
    },
  });
  const reusedAdd = await transferStock(item.id, stockroomId, counterId, 1, staff, "seq-req-add001");
  assert.equal("error" in reusedAdd && reusedAdd.error, "That request was already used for a different transfer.");

  stock = await balances("SEQ-1");
  const otherStock = await balances("SEQ-2");
  assert.equal(stock.byName.get("Stockroom"), 7);
  assert.equal(stock.byName.get("Redemption Counter"), 3);
  assert.equal(stock.total, 10);
  assert.equal(otherStock.byName.get("Stockroom"), 10);
  assert.equal(otherStock.byName.has("Redemption Counter"), false);
  assert.equal(await prisma.stockBalance.count({ where: { itemId: item.id, locationId: floor.id } }), 0);
  assert.equal(await prisma.history.count({ where: { itemId: item.id, action: "TRANSFER" } }), 3);
});
