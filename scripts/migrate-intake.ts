/**
 * Adds optional barcode and archivedAt columns, plus an empty StockReceipt table.
 *
 * Existing items, balances, history, totes, and QR values are not changed.
 * Nothing is archived. Running it again changes nothing.
 *
 *   npx tsx scripts/migrate-intake.ts
 *
 * Rollback is restoring the database backup. Requires DATABASE_URL as a sqlite file URL.
 */
import "dotenv/config";
import path from "node:path";
import { pathToFileURL } from "node:url";

import Database from "better-sqlite3";

type Log = (message: string) => void;

function tableExists(db: Database.Database, name: string) {
  return Boolean(db.prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

function columnNames(db: Database.Database, table: string) {
  return new Set((db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map((column) => column.name));
}

function stockSnapshot(db: Database.Database) {
  const parts: string[] = [];
  if (!tableExists(db, "Item")) {
    return "missing";
  }
  const columns = columnNames(db, "Item");
  if (columns.has("quantity")) {
    const row = db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(quantity), 0) AS quantity FROM Item").get() as {
      n: number;
      quantity: number;
    };
    parts.push(`item:${row.n}:${row.quantity}`);
  } else if (tableExists(db, "StockBalance")) {
    const row = db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(quantity), 0) AS quantity FROM StockBalance").get() as {
      n: number;
      quantity: number;
    };
    parts.push(`balance:${row.n}:${row.quantity}`);
  }
  if (tableExists(db, "History")) {
    const row = db.prepare("SELECT COUNT(*) AS n FROM History").get() as { n: number };
    parts.push(`history:${row.n}`);
  }
  return parts.join("|");
}

export function migrateIntake(databasePath: string, log: Log = console.info) {
  const db = new Database(databasePath);
  try {
    if (!tableExists(db, "Item")) {
      log("No Item table yet. Nothing to migrate.");
      return { alreadyPresent: false };
    }
    const before = stockSnapshot(db);
    const columns = columnNames(db, "Item");
    if (!columns.has("barcode")) {
      db.exec('ALTER TABLE "Item" ADD COLUMN "barcode" TEXT');
    }
    if (!columns.has("archivedAt")) {
      db.exec('ALTER TABLE "Item" ADD COLUMN "archivedAt" DATETIME');
    }
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS "Item_barcode_key" ON "Item"("barcode")');
    db.exec(`
      CREATE TABLE IF NOT EXISTS "StockReceipt" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "requestId" TEXT NOT NULL,
        "fingerprint" TEXT NOT NULL,
        "userId" TEXT,
        "actorName" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "StockReceipt_requestId_key" ON "StockReceipt"("requestId");
    `);
    const after = stockSnapshot(db);
    if (after !== before) {
      throw new Error("Inventory or history changed while adding intake columns. Restore the backup.");
    }
    log("Intake columns are in place. No quantities were changed.");
    return { alreadyPresent: columns.has("archivedAt") && columns.has("barcode") };
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

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  migrateIntake(databasePathFromEnv());
}
