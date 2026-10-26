/**
 * Moves each item's single quantity onto a StockBalance at its current location.
 *
 * The catalog item, SKU, QR payload, and history rows stay in place. No extra
 * locations are stocked. Item.quantity and Item.locationId are removed only
 * after the new balances match those values. Running it again changes nothing.
 *
 * Stop the app, back up the SQLite file, then:
 *
 *   npx tsx scripts/migrate-location-balances.ts
 *
 * Rollback is restoring that backup. This script does not seed or reset data.
 * Requires DATABASE_URL as a sqlite file URL.
 */
import "dotenv/config";
import path from "node:path";
import { pathToFileURL } from "node:url";

import Database from "better-sqlite3";
import cuid from "cuid";

type Log = (message: string) => void;

type LegacyItem = {
  id: string;
  sku: string;
  qrCodeData: string;
  locationId: string;
  quantity: number;
};

const historyColumns = [
  ["locationName", "TEXT"],
  ["fromLocationName", "TEXT"],
  ["toLocationName", "TEXT"],
  ["sourceQuantityBefore", "INTEGER"],
  ["sourceQuantityAfter", "INTEGER"],
  ["destinationQuantityBefore", "INTEGER"],
  ["destinationQuantityAfter", "INTEGER"],
] as const;

function tableExists(db: Database.Database, name: string) {
  return Boolean(
    db.prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)
  );
}

function columnNames(db: Database.Database, table: string) {
  return new Set(
    (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map((column) => column.name)
  );
}

function historyIdentity(db: Database.Database) {
  if (!tableExists(db, "History")) {
    return "missing";
  }
  const rows = db
    .prepare("SELECT id, itemId, action, amount, userId, timestamp FROM History ORDER BY id")
    .all() as {
    id: string;
    itemId: string;
    action: string;
    amount: number;
    userId: string | null;
    timestamp: string;
  }[];
  return rows
    .map((row) => `${row.id}:${row.itemId}:${row.action}:${row.amount}:${row.userId ?? ""}:${row.timestamp}`)
    .join("|");
}

function balanceSnapshot(db: Database.Database) {
  const rows = db
    .prepare("SELECT itemId, locationId, quantity FROM StockBalance ORDER BY itemId, locationId")
    .all() as { itemId: string; locationId: string; quantity: number }[];
  return rows.map((row) => `${row.itemId}:${row.locationId}:${row.quantity}`).join("|");
}

function ensureHistoryColumns(db: Database.Database) {
  if (!tableExists(db, "History")) {
    return;
  }
  const names = columnNames(db, "History");
  for (const [name, type] of historyColumns) {
    if (!names.has(name)) {
      db.exec(`ALTER TABLE "History" ADD COLUMN "${name}" ${type}`);
    }
  }
}

function ensureBalanceTable(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS "StockBalance" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "itemId" TEXT NOT NULL,
      "locationId" TEXT NOT NULL,
      "quantity" INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT "StockBalance_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "StockBalance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "StockBalance_itemId_locationId_key" ON "StockBalance"("itemId", "locationId");
  `);
  const names = columnNames(db, "StockBalance");
  for (const name of ["id", "itemId", "locationId", "quantity"]) {
    if (!names.has(name)) {
      throw new Error("StockBalance does not match the expected columns. Restore the backup.");
    }
  }
}

function assertNonNegative(db: Database.Database) {
  const negative = db.prepare("SELECT COUNT(*) AS n FROM StockBalance WHERE quantity < 0").get() as { n: number };
  if (negative.n > 0) {
    throw new Error("A stock balance is negative. Restore the backup.");
  }
}

function rebuildItem(db: Database.Database) {
  db.exec(`
    CREATE TABLE "Item_new" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "sku" TEXT NOT NULL,
      "description" TEXT,
      "threshold" INTEGER NOT NULL DEFAULT 5,
      "categoryId" TEXT NOT NULL,
      "qrCodeData" TEXT NOT NULL,
      "receivedAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
      "outOfStockAt" DATETIME,
      "isManualOos" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "Item_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    );
    INSERT INTO "Item_new" (
      "id", "name", "sku", "description", "threshold", "categoryId", "qrCodeData",
      "receivedAt", "outOfStockAt", "isManualOos", "createdAt", "updatedAt"
    )
    SELECT
      "id", "name", "sku", "description", "threshold", "categoryId", "qrCodeData",
      "receivedAt", "outOfStockAt", "isManualOos", "createdAt", "updatedAt"
    FROM "Item";
    DROP TABLE "Item";
    ALTER TABLE "Item_new" RENAME TO "Item";
    CREATE UNIQUE INDEX "Item_sku_key" ON "Item"("sku");
    CREATE UNIQUE INDEX "Item_qrCodeData_key" ON "Item"("qrCodeData");
  `);
}

export function migrateLocationBalances(databasePath: string, log: Log = console.info) {
  const db = new Database(databasePath);
  try {
    if (!tableExists(db, "Item")) {
      log("No Item table yet. Nothing to migrate.");
      return { alreadyMigrated: false, items: 0 };
    }

    const itemColumns = columnNames(db, "Item");
    if (!itemColumns.has("quantity") && !itemColumns.has("locationId")) {
      if (!tableExists(db, "StockBalance")) {
        throw new Error("Item no longer stores a quantity, but StockBalance is missing. Restore the backup.");
      }
      const before = balanceSnapshot(db);
      const historyBefore = historyIdentity(db);
      ensureHistoryColumns(db);
      assertNonNegative(db);
      if (balanceSnapshot(db) !== before || historyIdentity(db) !== historyBefore) {
        throw new Error("Balances or history changed while checking an already migrated database.");
      }
      const items = db.prepare("SELECT COUNT(*) AS n FROM Item").get() as { n: number };
      log("Location balances are already in place.");
      return { alreadyMigrated: true, items: items.n };
    }
    if (!itemColumns.has("quantity") || !itemColumns.has("locationId")) {
      throw new Error("Item is missing quantity or locationId. Restore the backup before migrating.");
    }

    const items = db
      .prepare("SELECT id, sku, qrCodeData, locationId, quantity FROM Item ORDER BY id")
      .all() as LegacyItem[];
    for (const item of items) {
      if (!Number.isInteger(item.quantity) || item.quantity < 0) {
        throw new Error(`Refusing to migrate a negative quantity for ${item.sku}. Restore the backup.`);
      }
      if (!item.locationId) {
        throw new Error(`Refusing to migrate ${item.sku} without a location. Restore the backup.`);
      }
    }

    db.pragma("foreign_keys = OFF");
    const apply = db.transaction(() => {
      const historyBefore = historyIdentity(db);
      const catalogBefore = db
        .prepare("SELECT id, sku, qrCodeData FROM Item ORDER BY id")
        .all() as { id: string; sku: string; qrCodeData: string }[];

      ensureBalanceTable(db);
      const existing = db.prepare("SELECT itemId, locationId, quantity FROM StockBalance").all() as {
        itemId: string;
        locationId: string;
        quantity: number;
      }[];
      const byItem = new Map<string, typeof existing>();
      for (const row of existing) {
        const rows = byItem.get(row.itemId) ?? [];
        rows.push(row);
        byItem.set(row.itemId, rows);
      }

      const insert = db.prepare(
        "INSERT INTO StockBalance (id, itemId, locationId, quantity) VALUES (?, ?, ?, ?)"
      );
      for (const item of items) {
        const place = db.prepare("SELECT id FROM Location WHERE id = ?").get(item.locationId) as
          | { id: string }
          | undefined;
        if (!place) {
          throw new Error(`Location for ${item.sku} does not exist. Restore the backup.`);
        }
        const rows = byItem.get(item.id) ?? [];
        if (rows.length === 0) {
          insert.run(cuid(), item.id, item.locationId, item.quantity);
          continue;
        }
        const same =
          rows.length === 1 && rows[0]?.locationId === item.locationId && rows[0]?.quantity === item.quantity;
        if (!same) {
          throw new Error(
            `Stock for ${item.sku} does not match its current quantity and location. Restore the backup.`
          );
        }
      }

      const moved = db
        .prepare(
          `SELECT Item.id AS id, Item.sku AS sku, Item.qrCodeData AS qrCodeData,
                  StockBalance.locationId AS locationId, StockBalance.quantity AS quantity
           FROM Item
           JOIN StockBalance ON StockBalance.itemId = Item.id
           ORDER BY Item.id`
        )
        .all() as LegacyItem[];
      if (moved.length !== items.length) {
        throw new Error("Each item must have exactly one balance before the old quantity column is removed.");
      }
      for (let index = 0; index < items.length; index += 1) {
        const before = items[index];
        const after = moved[index];
        if (
          !before ||
          !after ||
          before.id !== after.id ||
          before.sku !== after.sku ||
          before.qrCodeData !== after.qrCodeData ||
          before.locationId !== after.locationId ||
          before.quantity !== after.quantity
        ) {
          throw new Error("Migrated balances do not match the existing inventory. Restore the backup.");
        }
      }

      ensureHistoryColumns(db);
      if (historyIdentity(db) !== historyBefore) {
        throw new Error("History rows changed during the location balance migration.");
      }

      rebuildItem(db);
      const names = columnNames(db, "Item");
      if (names.has("quantity") || names.has("locationId")) {
        throw new Error("The old quantity columns are still present. Restore the backup.");
      }
      const catalogAfter = db
        .prepare("SELECT id, sku, qrCodeData FROM Item ORDER BY id")
        .all() as { id: string; sku: string; qrCodeData: string }[];
      if (JSON.stringify(catalogAfter) !== JSON.stringify(catalogBefore)) {
        throw new Error("Item ids, SKUs, or QR codes changed. Restore the backup.");
      }
      if (historyIdentity(db) !== historyBefore) {
        throw new Error("History rows changed during the location balance migration.");
      }
      assertNonNegative(db);
      const broken = db.prepare("PRAGMA foreign_key_check").all() as unknown[];
      if (broken.length > 0) {
        throw new Error("Foreign keys failed after the location balance migration. Restore the backup.");
      }
    });
    apply();
    log(`Moved ${items.length} item quantities onto location balances.`);
    return { alreadyMigrated: false, items: items.length };
  } finally {
    db.close();
  }
}

function databasePathFromEnv() {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("file:")) {
    throw new Error("DATABASE_URL must be a sqlite file URL.");
  }
  const filePath = url.slice("file:".length);
  return path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  migrateLocationBalances(databasePathFromEnv());
}
