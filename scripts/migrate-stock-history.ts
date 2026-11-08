/**
 * Adds audit columns to History without rewriting existing movements.
 *
 * New columns are nullable. Older rows keep their action, amount, user, and
 * timestamp, and their new fields stay empty. Item quantities are not changed.
 *
 *   npx tsx scripts/migrate-stock-history.ts
 *
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

function columnNames(db: Database.Database, table: string) {
  return new Set(
    (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map((column) => column.name)
  );
}

function historySnapshot(db: Database.Database) {
  if (!tableExists(db, "History")) {
    return "missing";
  }
  const rows = db
    .prepare("SELECT id, itemId, action, amount, userId, timestamp FROM History ORDER BY id")
    .all() as { id: string; itemId: string; action: string; amount: number; userId: string | null; timestamp: string }[];
  return rows.map((row) => `${row.id}:${row.itemId}:${row.action}:${row.amount}:${row.userId ?? ""}:${row.timestamp}`).join("|");
}

function itemSnapshot(db: Database.Database) {
  if (!tableExists(db, "Item")) {
    return "missing";
  }
  const names = columnNames(db, "Item");
  if (names.has("quantity")) {
    const rows = db.prepare("SELECT id, sku, quantity FROM Item ORDER BY id").all() as {
      id: string;
      sku: string;
      quantity: number;
    }[];
    return rows.map((row) => `${row.id}:${row.sku}:${row.quantity}`).join("|");
  }
  if (tableExists(db, "StockBalance")) {
    const rows = db
      .prepare(
        `SELECT Item.id AS id, Item.sku AS sku, COALESCE(SUM(StockBalance.quantity), 0) AS quantity
         FROM Item LEFT JOIN StockBalance ON StockBalance.itemId = Item.id
         GROUP BY Item.id, Item.sku ORDER BY Item.id`
      )
      .all() as { id: string; sku: string; quantity: number }[];
    return rows.map((row) => `${row.id}:${row.sku}:${row.quantity}`).join("|");
  }
  const rows = db.prepare("SELECT id, sku FROM Item ORDER BY id").all() as { id: string; sku: string }[];
  return rows.map((row) => `${row.id}:${row.sku}`).join("|");
}

export function migrateStockHistory(databasePath: string, log: Log = console.info) {
  const db = new Database(databasePath);
  try {
    if (!tableExists(db, "History")) {
      log("No History table yet. Nothing to migrate.");
      return { added: false };
    }

    const beforeHistory = historySnapshot(db);
    const beforeItems = itemSnapshot(db);
    const names = columnNames(db, "History");
    const additions = [
      ["quantityBefore", "INTEGER"],
      ["quantityAfter", "INTEGER"],
      ["reason", "TEXT"],
      ["requestId", "TEXT"],
    ] as const;
    let added = false;
    for (const [name, type] of additions) {
      if (!names.has(name)) {
        db.exec(`ALTER TABLE "History" ADD COLUMN "${name}" ${type}`);
        added = true;
      }
    }
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS "History_requestId_key" ON "History"("requestId")');

    if (historySnapshot(db) !== beforeHistory || itemSnapshot(db) !== beforeItems) {
      throw new Error("Inventory or history rows changed during the audit migration.");
    }
    log(added ? "Added nullable audit columns to History." : "History audit columns are already present.");
    return { added };
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
  migrateStockHistory(databasePathFromEnv());
}
