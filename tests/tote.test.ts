import "./env";

import Database from "better-sqlite3";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { csvCell } from "@/lib/csv";
import { deleteLocationIfEmpty } from "@/lib/locations";
import { pinCredential } from "@/lib/pin";
import { prisma } from "@/lib/prisma";
import { isPublicTotePath } from "@/lib/public-path";
import { renderPublicMissing, renderPublicTotePage } from "@/lib/public-tote-page";
import { consumePublicScan, publicScanLimit } from "@/lib/public-scan-limit";
import { publicBaseUrl, totePublicUrl } from "@/lib/public-url";
import { itemTotalsCsv, reportAccessError, toteContentsCsv, transferHistoryCsv } from "@/lib/reports";
import { findItemByQr } from "@/lib/stock";
import { createTote, createToteToken, deleteTote, loadPublicTote, rotateToteToken, setTotePublicEnabled } from "@/lib/tote";
import { transferStock } from "@/lib/transfer";
import { labelPageCss, toteQrOptions } from "@/lib/label-print";
import { publicClientKey, stampPeer } from "@/lib/public-client";
import { migrateLocationBalances } from "../scripts/migrate-location-balances";
import { migrateTotes } from "../scripts/migrate-totes";
import { testDatabasePath } from "./env";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const manager = { id: "", role: "MANAGER", active: true, canScan: true };
const staff = { id: "", role: "STAFF", active: true, canScan: true };
const admin = { id: "", role: "ADMIN", active: true, canScan: true };

let stockroomId = "";

before(async () => {
  execFileSync("npx", ["prisma", "db", "push"], {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });
  const stockroom = await prisma.location.create({ data: { name: "Stockroom" } });
  const category = await prisma.category.create({ data: { name: "Prizes" } });
  stockroomId = stockroom.id;
  const createdManager = await prisma.user.create({
    data: { name: "Jenny", role: "MANAGER", ...pinCredential("2002") },
  });
  const createdStaff = await prisma.user.create({
    data: { name: "Secret Staff", role: "STAFF", canScan: true, ...pinCredential("3003") },
  });
  const createdAdmin = await prisma.user.create({
    data: { name: "Ada Admin", role: "ADMIN", ...pinCredential("1001") },
  });
  manager.id = createdManager.id;
  staff.id = createdStaff.id;
  admin.id = createdAdmin.id;
  await prisma.item.create({
    data: {
      name: "=1+1",
      sku: "EQ-1",
      threshold: 1,
      qrCodeData: "ZAP-ITEM-eq",
      categoryId: category.id,
      balances: { create: { locationId: stockroom.id, quantity: 10 } },
    },
  });
});

after(async () => {
  await prisma.$disconnect();
  fs.rmSync(testDatabasePath, { force: true });
});

test("public tote paths and label addresses stay narrow", () => {
  assert.equal(isPublicTotePath("/t/abc"), true);
  assert.equal(isPublicTotePath("/totes"), false);
  assert.equal(isPublicTotePath("/totes/abc"), false);
  assert.equal(isPublicTotePath("/items"), false);
  assert.equal(isPublicTotePath("/t/abc/extra"), false);
  assert.match(fs.readFileSync(path.join(repoRoot, "middleware.ts"), "utf8"), /isPublicTotePath\(pathname\)/);
  assert.match(fs.readFileSync(path.join(repoRoot, "app/layout.tsx"), "utf8"), /publicTote/);

  assert.equal("error" in publicBaseUrl({ PUBLIC_BASE_URL: "http://inventory.example.com" }), true);
  assert.equal("error" in publicBaseUrl({ PUBLIC_BASE_URL: "https://localhost/store" }), true);
  assert.equal("error" in publicBaseUrl({ PUBLIC_BASE_URL: "https://192.168.1.20" }), true);
  assert.equal("error" in publicBaseUrl({}), true);
  const base = publicBaseUrl({ PUBLIC_BASE_URL: "https://inventory.example.com/ignored" });
  assert.equal("url" in base && base.url, "https://inventory.example.com");
  const label = totePublicUrl("a".repeat(43), { PUBLIC_BASE_URL: "https://inventory.example.com" });
  assert.equal("url" in label && label.url, `https://inventory.example.com/t/${"a".repeat(43)}`);
  assert.match(labelPageCss("label"), /size:\s*2in 2in/);
  assert.match(labelPageCss("sheet"), /size:\s*letter/);
  assert.equal(toteQrOptions.margin, 4);

  const secret = "test-auth-secret-0123456789";
  const phoneA = stampPeer("203.0.113.10", secret);
  const phoneB = stampPeer("203.0.113.20", secret);
  const list = (values: Record<string, string>) => ({
    get(name: string) {
      return values[name.toLowerCase()] ?? null;
    },
  });
  assert.equal(
    publicClientKey(list({ "x-forwarded-for": "198.51.100.9", "x-inventory-peer": phoneA ?? "" }), {
      AUTH_SECRET: secret,
    }),
    "ip:203.0.113.10"
  );
  assert.equal(publicClientKey(list({ "x-inventory-peer": phoneB ?? "" }), { AUTH_SECRET: secret }), "ip:203.0.113.20");
  assert.notEqual(
    publicClientKey(list({ "x-inventory-peer": phoneA ?? "" }), { AUTH_SECRET: secret }),
    publicClientKey(list({ "x-inventory-peer": phoneB ?? "" }), { AUTH_SECRET: secret })
  );
  assert.equal(
    publicClientKey(list({ "x-forwarded-for": "198.51.100.9", "x-inventory-peer": "203.0.113.10.forged" }), {
      AUTH_SECRET: secret,
    }),
    "local"
  );
  assert.equal(
    publicClientKey(list({ "x-forwarded-for": "203.0.113.8, 203.0.113.9" }), {
      TRUST_PROXY: "1",
      AUTH_SECRET: secret,
    }),
    "ip:203.0.113.9"
  );
});

test("csv cells neutralize formulas and quotes", () => {
  assert.equal(csvCell("=1+1"), "'=1+1");
  assert.equal(csvCell("+1"), "'+1");
  assert.equal(csvCell("-1"), "'-1");
  assert.equal(csvCell("@sum"), "'@sum");
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell("plain"), "plain");
});

test("the tote migration adds tables without changing inventory", () => {
  const file = path.join(os.tmpdir(), `zap-totes-${process.pid}.db`);
  fs.rmSync(file, { force: true });
  const setup = new Database(file);
  setup.exec(`
    CREATE TABLE Item (id TEXT PRIMARY KEY, sku TEXT NOT NULL, quantity INTEGER NOT NULL, qrCodeData TEXT NOT NULL);
    CREATE TABLE History (id TEXT PRIMARY KEY, action TEXT NOT NULL);
    INSERT INTO Item (id, sku, quantity, qrCodeData) VALUES ('item-1', 'BB-001', 4, 'ZAP-ITEM-item-1');
    INSERT INTO History (id, action) VALUES ('hist-1', 'ADD');
    CREATE TABLE Location (id TEXT PRIMARY KEY, name TEXT NOT NULL);
  `);
  setup.close();
  const first = migrateTotes(file, () => undefined);
  assert.equal(first.alreadyPresent, false);
  const again = migrateTotes(file, () => undefined);
  assert.equal(again.alreadyPresent, true);
  const db = new Database(file);
  const item = db.prepare("SELECT quantity, qrCodeData FROM Item WHERE id = 'item-1'").get() as {
    quantity: number;
    qrCodeData: string;
  };
  const history = db.prepare("SELECT COUNT(*) AS n FROM History").get() as { n: number };
  const totes = db.prepare("SELECT COUNT(*) AS n FROM Tote").get() as { n: number };
  assert.equal(item.quantity, 4);
  assert.equal(item.qrCodeData, "ZAP-ITEM-item-1");
  assert.equal(history.n, 1);
  assert.equal(totes.n, 0);
  db.close();
  fs.rmSync(file, { force: true });
});

function totalsBySku(db: Database.Database) {
  const columns = new Set(
    (db.prepare("PRAGMA table_info(Item)").all() as { name: string }[]).map((column) => column.name)
  );
  if (columns.has("quantity")) {
    return db.prepare("SELECT sku, quantity FROM Item ORDER BY sku").all() as { sku: string; quantity: number }[];
  }
  return db
    .prepare(
      `SELECT Item.sku AS sku, COALESCE(SUM(StockBalance.quantity), 0) AS quantity
       FROM Item
       LEFT JOIN StockBalance ON StockBalance.itemId = Item.id
       GROUP BY Item.id, Item.sku
       ORDER BY Item.sku`
    )
    .all() as { sku: string; quantity: number }[];
}

function legacyInventory(file: string) {
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
      quantity INTEGER NOT NULL,
      threshold INTEGER NOT NULL DEFAULT 5,
      locationId TEXT NOT NULL,
      categoryId TEXT NOT NULL,
      qrCodeData TEXT NOT NULL,
      receivedAt DATETIME,
      outOfStockAt DATETIME,
      isManualOos BOOLEAN NOT NULL DEFAULT 0,
      createdAt DATETIME NOT NULL,
      updatedAt DATETIME NOT NULL
    );
    CREATE TABLE History (
      id TEXT PRIMARY KEY,
      itemId TEXT NOT NULL,
      userId TEXT,
      action TEXT NOT NULL,
      amount INTEGER NOT NULL,
      timestamp DATETIME NOT NULL
    );
    INSERT INTO Location (id, name) VALUES ('loc-stock', 'Stockroom');
    INSERT INTO Category (id, name) VALUES ('cat-1', 'Prizes');
    INSERT INTO Item (
      id, name, sku, description, quantity, threshold, locationId, categoryId, qrCodeData,
      receivedAt, outOfStockAt, isManualOos, createdAt, updatedAt
    ) VALUES (
      'item-1', 'Bouncy balls', 'BB-001', NULL, 4, 5, 'loc-stock', 'cat-1', 'ZAP-ITEM-item-1',
      '2026-10-19 12:00:00', NULL, 0, '2026-10-19 12:00:00', '2026-10-19 12:00:00'
    );
    INSERT INTO History (id, itemId, action, amount, timestamp)
      VALUES ('hist-1', 'item-1', 'ADD', 4, '2026-10-19 12:00:00');
  `);
  db.close();
}

test("legacy inventory migrates to balances and an already migrated database stays unchanged", () => {
  const legacy = path.join(os.tmpdir(), `zap-legacy-${process.pid}.db`);
  legacyInventory(legacy);
  const moved = migrateLocationBalances(legacy, () => undefined);
  assert.equal(moved.alreadyMigrated, false);
  migrateTotes(legacy, () => undefined);
  const migrated = new Database(legacy);
  const columns = new Set(
    (migrated.prepare("PRAGMA table_info(Item)").all() as { name: string }[]).map((column) => column.name)
  );
  assert.equal(columns.has("quantity"), false);
  assert.deepEqual(totalsBySku(migrated), [{ sku: "BB-001", quantity: 4 }]);
  const qr = migrated.prepare("SELECT qrCodeData FROM Item WHERE sku = 'BB-001'").get() as { qrCodeData: string };
  assert.equal(qr.qrCodeData, "ZAP-ITEM-item-1");
  migrated.close();

  const again = migrateLocationBalances(legacy, () => undefined);
  assert.equal(again.alreadyMigrated, true);
  const totesAgain = migrateTotes(legacy, () => undefined);
  assert.equal(totesAgain.alreadyPresent, true);
  const after = new Database(legacy);
  assert.deepEqual(totalsBySku(after), [{ sku: "BB-001", quantity: 4 }]);
  assert.equal((after.prepare("SELECT COUNT(*) AS n FROM Tote").get() as { n: number }).n, 0);
  after.close();
  fs.rmSync(legacy, { force: true });
});

test("a disposable copy of the populated database keeps its quantities", () => {
  const live = path.join(repoRoot, "dev.db");
  if (!fs.existsSync(live)) {
    return;
  }
  const beforeHash = createHash("sha256").update(fs.readFileSync(live)).digest("hex");
  const copy = path.join(os.tmpdir(), `zap-tote-live-${process.pid}.db`);
  fs.copyFileSync(live, copy);
  migrateTotes(copy, () => undefined);
  const db = new Database(copy);
  const rows = totalsBySku(db);
  assert.equal(rows.find((row) => row.sku === "BB-001")?.quantity, 4);
  assert.equal(rows.find((row) => row.sku === "AT-010")?.quantity, 30);
  assert.equal(rows.find((row) => row.sku === "SQ-001")?.quantity, 2);
  db.close();
  fs.rmSync(copy, { force: true });
  assert.equal(createHash("sha256").update(fs.readFileSync(live)).digest("hex"), beforeHash);
});

test("a tote gets its own location and public page, and transfers keep the total", async () => {
  const denied = await createTote(staff, { name: "Bin 12", storageLabel: "Aisle 2" });
  assert.match("error" in denied ? denied.error : "", /admins and managers/);

  const created = await createTote(manager, { name: "Bin 12", storageLabel: "Aisle 2" });
  assert.equal("tote" in created, true);
  if (!("tote" in created)) {
    return;
  }
  assert.equal(created.tote.locationId === stockroomId, false);
  assert.equal(created.tote.publicToken.length, 43);
  assert.notEqual(createToteToken(), created.tote.publicToken);
  const location = await prisma.location.findUniqueOrThrow({ where: { id: created.tote.locationId } });
  assert.equal(location.name, "Bin 12");

  const item = await prisma.item.findUniqueOrThrow({ where: { sku: "EQ-1" } });
  const moved = await transferStock(item.id, stockroomId, created.tote.locationId, 4, staff, "tote-move-0001");
  assert.equal("item" in moved && moved.item.quantity, 10);
  const again = await transferStock(item.id, stockroomId, created.tote.locationId, 4, staff, "tote-move-0001");
  assert.equal("item" in again && again.item.quantity, 10);
  const second = await transferStock(item.id, stockroomId, created.tote.locationId, 1, staff, "tote-move-0002");
  assert.equal("item" in second && second.item.quantity, 10);

  const balances = await prisma.stockBalance.findMany({ where: { itemId: item.id } });
  const atTote = balances.find((row) => row.locationId === created.tote.locationId)?.quantity;
  const atRoom = balances.find((row) => row.locationId === stockroomId)?.quantity;
  assert.equal(atTote, 5);
  assert.equal(atRoom, 5);
  assert.equal((atTote ?? 0) + (atRoom ?? 0), 10);

  const found = await findItemByQr("ZAP-ITEM-eq", staff);
  assert.equal("item" in found && found.item.qrCodeData, "ZAP-ITEM-eq");

  const view = await loadPublicTote(created.tote.publicToken);
  assert.equal(view?.name, "Bin 12");
  assert.equal(view?.storageLabel, "Aisle 2");
  assert.equal(view?.pieces, 5);
  assert.equal(view?.distinct, 1);
  const html = renderPublicTotePage({ ...view!, businessName: "Zap Zone" });
  assert.match(html, /Zap Zone/);
  assert.match(html, /=1\+1/);
  assert.match(html, /noindex/);
  assert.equal(html.includes(created.tote.publicToken), false);
  assert.equal(html.includes("Secret Staff"), false);
  assert.equal(html.includes("pinHash"), false);
  assert.equal(renderPublicMissing(), renderPublicMissing());
  assert.match(renderPublicMissing(), /not available/);

  const blocked = await deleteTote(manager, created.tote.id);
  assert.equal("error" in blocked && blocked.error, "Transfer the stock out of this tote before deleting it.");
  assert.equal(await prisma.stockBalance.findFirstOrThrow({
    where: { itemId: item.id, locationId: created.tote.locationId },
  }).then((row) => row.quantity), 5);
  const locationDelete = await deleteLocationIfEmpty(created.tote.locationId);
  assert.match("error" in locationDelete ? locationDelete.error : "", /belongs to a tote/);

  await setTotePublicEnabled(manager, created.tote.id, false);
  assert.equal(await loadPublicTote(created.tote.publicToken), null);
  await setTotePublicEnabled(manager, created.tote.id, true);
  const rotated = await rotateToteToken(manager, created.tote.id);
  assert.equal("publicToken" in rotated, true);
  if (!("publicToken" in rotated)) {
    return;
  }
  assert.equal(await loadPublicTote(created.tote.publicToken), null);
  const revived = await loadPublicTote(rotated.publicToken);
  assert.equal(revived?.pieces, 5);

  const totals = await itemTotalsCsv();
  assert.match(totals, /'=1\+1/);
  assert.equal(totals.includes(rotated.publicToken), false);
  const contents = await toteContentsCsv();
  assert.match(contents, /Bin 12/);
  assert.equal(contents.includes(rotated.publicToken), false);
  const history = await transferHistoryCsv();
  assert.match(history, /EQ-1/);
  assert.equal(history.includes("Secret Staff"), false);
  assert.equal(history.includes("Jenny"), false);
  assert.equal(reportAccessError(staff), "Only admins can export reports.");
  assert.equal(reportAccessError(manager), "Only admins can export reports.");
  assert.equal(reportAccessError(admin), null);
});

test("anonymous tote views are rate limited without revealing the token", async () => {
  const key = `public-test-${process.pid}`;
  for (let hit = 0; hit < publicScanLimit; hit += 1) {
    assert.equal(await consumePublicScan(key), false);
  }
  assert.equal(await consumePublicScan(key), true);
});
