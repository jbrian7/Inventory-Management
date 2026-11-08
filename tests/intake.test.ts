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

import { archiveItems, moveStock, receiveStock, removeStock, restoreItems, suggestProducts } from "@/lib/intake";
import { queuedIntakeLines, queuedRowDetail } from "@/lib/intake-lines";
import { lifecycleOf } from "@/lib/lifecycle";
import { pinCredential } from "@/lib/pin";
import { prisma } from "@/lib/prisma";
import { findItemByQr } from "@/lib/stock";
import { migrateIntake } from "../scripts/migrate-intake";
import { testDatabasePath } from "./env";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const manager = { id: "", role: "MANAGER", active: true, canScan: true };
const staff = { id: "", role: "STAFF", active: true, canScan: true };
let locationId = "";

before(async () => {
  execFileSync("npx", ["prisma", "db", "push"], { cwd: repoRoot, env: process.env, stdio: "inherit" });
  const place = await prisma.location.create({ data: { name: "Bin 12" } });
  locationId = place.id;
  const createdManager = await prisma.user.create({ data: { name: "Jenny", role: "MANAGER", ...pinCredential("2002") } });
  const createdStaff = await prisma.user.create({ data: { name: "Haven", role: "STAFF", canScan: true, ...pinCredential("3003") } });
  manager.id = createdManager.id;
  staff.id = createdStaff.id;
});

after(async () => {
  await prisma.$disconnect();
  fs.rmSync(testDatabasePath, { force: true });
});

test("queued rows keep their own places and quantities", () => {
  const rows = [
    {
      itemId: "red",
      createNew: false,
      name: "Red ball",
      quantity: "2",
      locationId: "bin-a",
      toLocationId: "counter",
      categoryName: "",
      description: "",
      barcode: "",
    },
    {
      itemId: "blue",
      createNew: false,
      name: "Blue ball",
      quantity: "5",
      locationId: "bin-b",
      toLocationId: "stock",
      categoryName: "",
      description: "",
      barcode: "",
    },
  ];
  const lines = queuedIntakeLines(rows);
  assert.equal(lines[0]?.locationId, "bin-a");
  assert.equal(lines[0]?.toLocationId, "counter");
  assert.equal(lines[0]?.quantity, 2);
  assert.equal(lines[1]?.locationId, "bin-b");
  assert.equal(lines[1]?.toLocationId, "stock");
  assert.equal(lines[1]?.quantity, 5);
  const places = [
    { id: "bin-a", name: "Bin A" },
    { id: "bin-b", name: "Bin B" },
    { id: "counter", name: "Counter" },
    { id: "stock", name: "Stockroom" },
  ];
  assert.equal(queuedRowDetail(rows[0]!, places, "move"), "Existing · 2 · Bin A → Counter");
  assert.equal(queuedRowDetail(rows[1]!, places, "remove"), "Existing · 5 · Bin B");
});

test("suggestions do not choose a product for the operator", () => {
  const matches = suggestProducts(
    [
      { name: "Blue balls", sku: "BB-1", barcode: "111" },
      { name: "Tokens", sku: "AT-1", barcode: null },
    ],
    "ball"
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.name, "Blue balls");
  assert.equal(lifecycleOf({ archivedAt: null, quantity: 0 }), "DEPLETED");
  assert.equal(lifecycleOf({ archivedAt: null, quantity: 3 }), "ACTIVE");
  assert.equal(lifecycleOf({ archivedAt: new Date(), quantity: 0 }), "ARCHIVED");
});

test("intake creates a product in the tote, ignores a duplicate submit, and can deplete it", async () => {
  const denied = await receiveStock(
    staff,
    [{ createNew: true, name: "Party hats", quantity: 6, locationId }],
    "intake-staff-01"
  );
  assert.match("error" in denied ? denied.error : "", /admins and managers/);

  const created = await receiveStock(
    manager,
    [{ createNew: true, name: "Party hats", quantity: 6, locationId, barcode: "HAT-1" }],
    "intake-new-0001"
  );
  assert.equal("saved" in created && created.saved, true);
  const again = await receiveStock(
    manager,
    [{ createNew: true, name: "Party hats", quantity: 6, locationId, barcode: "HAT-1" }],
    "intake-new-0001"
  );
  assert.equal("saved" in again && again.saved, true);
  const conflict = await receiveStock(
    manager,
    [{ createNew: true, name: "Other hats", quantity: 1, locationId }],
    "intake-new-0001"
  );
  assert.equal("error" in conflict && conflict.error, "That request was already used for a different receipt.");

  const item = await prisma.item.findFirstOrThrow({ where: { name: "Party hats" }, include: { balances: true } });
  assert.match(item.sku, /^IN-/);
  assert.match(item.qrCodeData, /^ZAP-ITEM-/);
  assert.equal(item.balances[0]?.quantity, 6);
  assert.equal(item.threshold, 0);
  assert.equal(await prisma.item.count({ where: { name: "Party hats" } }), 1);
  const history = await prisma.history.findMany({ where: { itemId: item.id } });
  assert.equal(history.length, 1);
  assert.equal(history[0]?.action, "NEW_ITEM");
  assert.equal(history[0]?.actorName, "Jenny");

  const added = await receiveStock(staff, [{ itemId: item.id, quantity: 2, locationId }], "intake-add-0001");
  assert.equal("saved" in added && added.saved, true);
  const duplicateAdd = await receiveStock(staff, [{ itemId: item.id, quantity: 2, locationId }], "intake-add-0001");
  assert.equal("saved" in duplicateAdd && duplicateAdd.saved, true);
  const balance = await prisma.stockBalance.findFirstOrThrow({ where: { itemId: item.id, locationId } });
  assert.equal(balance.quantity, 8);

  const removed = await removeStock(staff, [{ itemId: item.id, quantity: 8, locationId }], "intake-rem-0001");
  assert.equal("saved" in removed && removed.saved, true);
  const empty = await prisma.stockBalance.findFirstOrThrow({ where: { itemId: item.id, locationId } });
  assert.equal(empty.quantity, 0);
  const stillThere = await findItemByQr(item.qrCodeData, staff);
  assert.equal("item" in stillThere && stillThere.item.qrCodeData, item.qrCodeData);

  const staffArchive = await archiveItems(staff, [item.id]);
  const staffMessage = "error" in staffArchive ? staffArchive.error : "";
  assert.match(staffMessage ?? "", /admins and managers/);
  const archived = await archiveItems(manager, [item.id]);
  assert.equal("saved" in archived && archived.saved, true);
  const stored = await prisma.item.findUniqueOrThrow({ where: { id: item.id } });
  assert.ok(stored.archivedAt);
  assert.equal(stored.sku, item.sku);
  const restored = await restoreItems(manager, [item.id]);
  assert.equal("saved" in restored && restored.saved, true);
  assert.equal((await prisma.item.findUniqueOrThrow({ where: { id: item.id } })).archivedAt, null);

  const stocked = await receiveStock(manager, [{ itemId: item.id, quantity: 1, locationId }], "intake-add-0002");
  assert.equal("saved" in stocked && stocked.saved, true);
  const blocked = await archiveItems(manager, [item.id]);
  const blockedMessage = "error" in blocked ? blocked.error : "";
  assert.match(blockedMessage ?? "", /still has stock/);
  const over = await removeStock(staff, [{ itemId: item.id, quantity: 5, locationId }], "intake-rem-0002");
  assert.match("error" in over ? over.error ?? "" : "", /Only 1/);
  const unchanged = await prisma.stockBalance.findFirstOrThrow({ where: { itemId: item.id, locationId } });
  assert.equal(unchanged.quantity, 1);
});

test("a batch receipt creates distinct products and a move keeps the total", async () => {
  const other = await prisma.location.create({ data: { name: "Counter" } });
  const batch = await receiveStock(
    manager,
    [
      { createNew: true, name: "Red ball", quantity: 3, locationId },
      { createNew: true, name: "Blue ball", quantity: 2, locationId },
    ],
    "intake-batch-01"
  );
  assert.equal("saved" in batch && batch.lines.length, 2);
  const red = await prisma.item.findFirstOrThrow({ where: { name: "Red ball" } });
  const blue = await prisma.item.findFirstOrThrow({ where: { name: "Blue ball" } });
  assert.notEqual(red.sku, blue.sku);
  const replay = await receiveStock(
    manager,
    [
      { createNew: true, name: "Red ball", quantity: 3, locationId },
      { createNew: true, name: "Blue ball", quantity: 2, locationId },
    ],
    "intake-batch-01"
  );
  assert.equal("saved" in replay && replay.saved, true);
  assert.equal(await prisma.item.count({ where: { name: "Red ball" } }), 1);

  const moved = await moveStock(staff, [{ itemId: red.id, quantity: 2, locationId, toLocationId: other.id }], "intake-move-01");
  assert.equal("saved" in moved && moved.saved, true);
  const source = await prisma.stockBalance.findFirstOrThrow({ where: { itemId: red.id, locationId } });
  const destination = await prisma.stockBalance.findFirstOrThrow({ where: { itemId: red.id, locationId: other.id } });
  assert.equal(source.quantity, 1);
  assert.equal(destination.quantity, 2);
  const transfer = await prisma.history.findFirstOrThrow({ where: { itemId: red.id, action: "TRANSFER" } });
  assert.equal(transfer.quantityBefore, transfer.quantityAfter);
});

test("one batch can move different quantities between different places", async () => {
  const counter = await prisma.location.create({ data: { name: "Front counter" } });
  const shelf = await prisma.location.create({ data: { name: "Back shelf" } });
  const created = await receiveStock(
    manager,
    [
      { createNew: true, name: "Red paddle", quantity: 4, locationId },
      { createNew: true, name: "Blue paddle", quantity: 6, locationId: counter.id },
    ],
    "intake-places-01"
  );
  assert.equal("saved" in created && created.lines.length, 2);
  const red = await prisma.item.findFirstOrThrow({ where: { name: "Red paddle" } });
  const blue = await prisma.item.findFirstOrThrow({ where: { name: "Blue paddle" } });
  const moved = await moveStock(
    staff,
    [
      { itemId: red.id, quantity: 3, locationId, toLocationId: shelf.id },
      { itemId: blue.id, quantity: 1, locationId: counter.id, toLocationId: locationId },
    ],
    "intake-places-02"
  );
  assert.equal("saved" in moved && moved.saved, true);
  assert.equal((await prisma.stockBalance.findFirstOrThrow({ where: { itemId: red.id, locationId } })).quantity, 1);
  assert.equal((await prisma.stockBalance.findFirstOrThrow({ where: { itemId: red.id, locationId: shelf.id } })).quantity, 3);
  assert.equal((await prisma.stockBalance.findFirstOrThrow({ where: { itemId: blue.id, locationId: counter.id } })).quantity, 5);
  assert.equal((await prisma.stockBalance.findFirstOrThrow({ where: { itemId: blue.id, locationId } })).quantity, 1);
});

test("archive and a receipt cannot leave stock on an archived product", async () => {
  const created = await receiveStock(
    manager,
    [{ createNew: true, name: "Last balloon", quantity: 1, locationId }],
    "intake-race-create"
  );
  assert.equal("saved" in created && created.saved, true);
  const item = await prisma.item.findFirstOrThrow({ where: { name: "Last balloon" } });
  const removed = await removeStock(staff, [{ itemId: item.id, quantity: 1, locationId }], "intake-race-clear");
  assert.equal("saved" in removed && removed.saved, true);

  for (let round = 0; round < 8; round += 1) {
    await prisma.item.update({ where: { id: item.id }, data: { archivedAt: null } });
    await prisma.stockBalance.update({
      where: { itemId_locationId: { itemId: item.id, locationId } },
      data: { quantity: 0 },
    });
    await Promise.all([
      archiveItems(manager, [item.id]),
      receiveStock(staff, [{ itemId: item.id, quantity: 2, locationId }], `intake-race-${round}01`),
    ]);
    const after = await prisma.item.findUniqueOrThrow({
      where: { id: item.id },
      include: { balances: true },
    });
    const quantity = after.balances.reduce((sum, balance) => sum + balance.quantity, 0);
    assert.equal(Boolean(after.archivedAt) && quantity > 0, false);
  }
});

test("intake migration keeps legacy quantities and already migrated balances", () => {
  const legacy = path.join(os.tmpdir(), `zap-intake-legacy-${process.pid}.db`);
  fs.rmSync(legacy, { force: true });
  const setup = new Database(legacy);
  setup.exec(`
    CREATE TABLE Item (id TEXT PRIMARY KEY, sku TEXT NOT NULL, quantity INTEGER NOT NULL, qrCodeData TEXT NOT NULL);
    INSERT INTO Item (id, sku, quantity, qrCodeData) VALUES ('item-1', 'BB-001', 4, 'ZAP-ITEM-item-1');
    CREATE TABLE History (id TEXT PRIMARY KEY);
    INSERT INTO History (id) VALUES ('hist-1');
  `);
  setup.close();
  migrateIntake(legacy, () => undefined);
  migrateIntake(legacy, () => undefined);
  const db = new Database(legacy);
  const item = db.prepare("SELECT quantity, qrCodeData FROM Item").get() as { quantity: number; qrCodeData: string };
  assert.equal(item.quantity, 4);
  assert.equal(item.qrCodeData, "ZAP-ITEM-item-1");
  const columns = new Set((db.prepare("PRAGMA table_info(Item)").all() as { name: string }[]).map((column) => column.name));
  assert.equal(columns.has("archivedAt"), true);
  assert.equal(columns.has("barcode"), true);
  db.close();

  const migrated = path.join(os.tmpdir(), `zap-intake-new-${process.pid}.db`);
  fs.rmSync(migrated, { force: true });
  const next = new Database(migrated);
  next.exec(`
    CREATE TABLE Item (id TEXT PRIMARY KEY, sku TEXT NOT NULL, qrCodeData TEXT NOT NULL);
    CREATE TABLE StockBalance (id TEXT PRIMARY KEY, itemId TEXT NOT NULL, quantity INTEGER NOT NULL);
    INSERT INTO Item (id, sku, qrCodeData) VALUES ('item-1', 'BB-001', 'ZAP-ITEM-item-1');
    INSERT INTO StockBalance (id, itemId, quantity) VALUES ('bal-1', 'item-1', 4);
    CREATE TABLE History (id TEXT PRIMARY KEY);
  `);
  next.close();
  migrateIntake(migrated, () => undefined);
  const after = new Database(migrated);
  const balance = after.prepare("SELECT quantity FROM StockBalance").get() as { quantity: number };
  assert.equal(balance.quantity, 4);
  const itemColumns = new Set((after.prepare("PRAGMA table_info(Item)").all() as { name: string }[]).map((column) => column.name));
  assert.equal(itemColumns.has("quantity"), false);
  assert.equal(itemColumns.has("archivedAt"), true);
  after.close();
  fs.rmSync(legacy, { force: true });
  fs.rmSync(migrated, { force: true });

  const live = path.join(repoRoot, "dev.db");
  if (!fs.existsSync(live)) {
    return;
  }
  const beforeHash = createHash("sha256").update(fs.readFileSync(live)).digest("hex");
  const copy = path.join(os.tmpdir(), `zap-intake-live-${process.pid}.db`);
  fs.copyFileSync(live, copy);
  migrateIntake(copy, () => undefined);
  const liveDb = new Database(copy);
  const liveColumns = new Set((liveDb.prepare("PRAGMA table_info(Item)").all() as { name: string }[]).map((column) => column.name));
  const rows = liveColumns.has("quantity")
    ? (liveDb.prepare("SELECT sku, quantity FROM Item ORDER BY sku").all() as { sku: string; quantity: number }[])
    : (liveDb
        .prepare(
          `SELECT Item.sku AS sku, COALESCE(SUM(StockBalance.quantity), 0) AS quantity
           FROM Item LEFT JOIN StockBalance ON StockBalance.itemId = Item.id
           GROUP BY Item.id ORDER BY Item.sku`
        )
        .all() as { sku: string; quantity: number }[]);
  assert.equal(rows.find((row) => row.sku === "BB-001")?.quantity, 4);
  liveDb.close();
  fs.rmSync(copy, { force: true });
  assert.equal(createHash("sha256").update(fs.readFileSync(live)).digest("hex"), beforeHash);
});
