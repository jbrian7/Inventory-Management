/**
 * Adds History.actorName and copies the current staff name onto rows that
 * still point at a user. Older rows with no user stay blank and display as
 * Unknown. Item quantities, actions, amounts, and user ids are not changed.
 *
 *   npx tsx scripts/migrate-actor-name.ts
 *
 * Run this after scripts/migrate-user-auth.ts so User.name is the staff name.
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

function historyIdentity(db: Database.Database) {
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

function itemQuantities(db: Database.Database) {
  if (!tableExists(db, "Item")) {
    return "missing";
  }
  const rows = db.prepare("SELECT id, sku, quantity FROM Item ORDER BY id").all() as {
    id: string;
    sku: string;
    quantity: number;
  }[];
  return rows.map((row) => `${row.id}:${row.sku}:${row.quantity}`).join("|");
}

export function migrateActorName(databasePath: string, log: Log = console.info) {
  const db = new Database(databasePath);
  try {
    if (!tableExists(db, "History")) {
      log("No History table yet. Nothing to migrate.");
      return { filled: 0 };
    }
    const beforeHistory = historyIdentity(db);
    const beforeItems = itemQuantities(db);
    if (!columnNames(db, "History").has("actorName")) {
      db.exec('ALTER TABLE "History" ADD COLUMN "actorName" TEXT');
    }
    const filled = tableExists(db, "User")
      ? db
          .prepare(
            `UPDATE "History"
             SET "actorName" = (SELECT "name" FROM "User" WHERE "User"."id" = "History"."userId")
             WHERE "actorName" IS NULL
               AND "userId" IS NOT NULL
               AND EXISTS (SELECT 1 FROM "User" WHERE "User"."id" = "History"."userId")`
          )
          .run().changes
      : 0;
    if (historyIdentity(db) !== beforeHistory || itemQuantities(db) !== beforeItems) {
      throw new Error("Inventory or history identity changed during the actor-name migration.");
    }
    log(`Actor names filled on ${filled} movement${filled === 1 ? "" : "s"}.`);
    return { filled };
  } finally {
    db.close();
  }
}

function databasePathFromEnv() {
  const url = process.env.DATABASE_URL ?? "";
  const match = /^file:(.+)$/.exec(url);
  if (!match) {
    throw new Error("DATABASE_URL must be a sqlite file URL.");
  }
  const filePath = match[1];
  return path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  migrateActorName(databasePathFromEnv());
}
