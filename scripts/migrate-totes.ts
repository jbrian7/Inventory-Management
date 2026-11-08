/**
 * Adds empty Tote and PublicScanLimit tables.
 *
 * Existing items, balances, history, users, and QR values are not changed.
 * No tote is created. Running it again changes nothing.
 *
 * Stop the app and back up the SQLite file first:
 *
 *   npx tsx scripts/migrate-totes.ts
 *
 * Rollback of a database that has no totes yet is restoring the backup.
 * Requires DATABASE_URL as a sqlite file URL.
 */
import "dotenv/config";
import path from "node:path";
import { pathToFileURL } from "node:url";

import Database from "better-sqlite3";

type Log = (message: string) => void;

function tableExists(db: Database.Database, name: string) {
  return Boolean(
    db.prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)
  );
}

function stockSnapshot(db: Database.Database) {
  const parts: string[] = [];
  if (tableExists(db, "Item")) {
    const columns = new Set(
      (db.prepare("PRAGMA table_info(Item)").all() as { name: string }[]).map((column) => column.name)
    );
    if (columns.has("quantity")) {
      const row = db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(quantity), 0) AS quantity FROM Item").get() as {
        n: number;
        quantity: number;
      };
      parts.push(`item:${row.n}:${row.quantity}`);
    } else {
      const row = db.prepare("SELECT COUNT(*) AS n FROM Item").get() as { n: number };
      parts.push(`item:${row.n}`);
    }
  }
  if (tableExists(db, "StockBalance")) {
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

function ensureTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS "PublicScanLimit" (
      "key" TEXT NOT NULL PRIMARY KEY,
      "hits" INTEGER NOT NULL DEFAULT 0,
      "windowStart" DATETIME NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "Tote" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "publicToken" TEXT NOT NULL,
      "publicEnabled" BOOLEAN NOT NULL DEFAULT true,
      "storageLabel" TEXT,
      "locationId" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "Tote_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "Tote_publicToken_key" ON "Tote"("publicToken");
    CREATE UNIQUE INDEX IF NOT EXISTS "Tote_locationId_key" ON "Tote"("locationId");
  `);
}

export function migrateTotes(databasePath: string, log: Log = console.info) {
  const db = new Database(databasePath);
  try {
    const before = stockSnapshot(db);
    const hadTote = tableExists(db, "Tote");
    ensureTables(db);
    const after = stockSnapshot(db);
    if (after !== before) {
      throw new Error("Inventory or history changed while adding tote tables. Restore the backup.");
    }
    log(hadTote ? "Tote tables are already in place." : "Added empty tote tables. No inventory rows were changed.");
    return { alreadyPresent: hadTote };
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
  migrateTotes(databasePathFromEnv());
}
