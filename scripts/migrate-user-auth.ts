/**
 * In-place auth migration for an existing Zap Zone SQLite file.
 *
 * Replaces each User.pin with a salted scrypt hash (pinHash) and an HMAC-SHA256
 * lookup key (pinLookup) derived with PIN_PEPPER. Adds active and sessionVersion.
 * Creates LoginThrottle when that table is missing. Drops the plaintext pin column.
 *
 * Development accounts are not created here. prisma/seed.ts is the only seed,
 * and it is for local development. Do not run the seed against production.
 *
 * This script does not modify Item, History, Location, or Category rows.
 * If any user is missing a 4-digit PIN, it leaves the database unchanged.
 * It never prints PINs, hashes, or lookup keys.
 *
 *   npx tsx scripts/migrate-user-auth.ts
 *
 * Requires DATABASE_URL (file:) and PIN_PEPPER (at least 16 characters).
 * Keep PIN_PEPPER with the database backups. Replacing it makes existing PINs
 * unverifiable. It does not reveal them.
 */
import "dotenv/config";
import path from "node:path";
import { pathToFileURL } from "node:url";

import Database from "better-sqlite3";

import { pinCredential } from "../lib/pin";

type Log = (message: string) => void;

const inventoryTables = ["Item", "History", "Location", "Category"] as const;

function tableExists(db: Database.Database, name: string) {
  return Boolean(
    db.prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)
  );
}

function columns(db: Database.Database, table: string) {
  return db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[];
}

function snapshot(db: Database.Database) {
  const parts: string[] = [];
  for (const table of inventoryTables) {
    if (!tableExists(db, table)) {
      parts.push(`${table}:missing`);
      continue;
    }
    const count = db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number };
    parts.push(`${table}:${count.n}`);
    if (table === "Item") {
      const rows = db.prepare("SELECT id, sku, quantity FROM Item ORDER BY id").all() as {
        id: string;
        sku: string;
        quantity: number;
      }[];
      parts.push(rows.map((row) => `${row.id}:${row.sku}:${row.quantity}`).join("|"));
    }
  }
  return parts.join("\n");
}

function ensureThrottle(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS "LoginThrottle" (
      "key" TEXT NOT NULL PRIMARY KEY,
      "failures" INTEGER NOT NULL DEFAULT 0,
      "windowStart" DATETIME NOT NULL,
      "lockedUntil" DATETIME
    );
  `);
}

export function migrateUserAuth(databasePath: string, log: Log = console.info) {
  const db = new Database(databasePath);
  try {
    if (!tableExists(db, "User")) {
      log("No User table yet. Nothing to migrate.");
      return { usersHashed: 0, alreadyMigrated: false };
    }

    const names = new Set(columns(db, "User").map((column) => column.name));
    if (!names.has("pin") && names.has("pinHash") && names.has("pinLookup")) {
      ensureThrottle(db);
      log("User credentials are already hashed. Inventory was not modified.");
      return { usersHashed: 0, alreadyMigrated: true };
    }
    if (!names.has("pin") || names.has("pinHash")) {
      throw new Error("User table is in an unexpected shape. Refusing to migrate.");
    }

    const users = db.prepare("SELECT id, name, pin, role, canScan FROM User").all() as {
      id: string;
      name: string;
      pin: string;
      role: string;
      canScan: number;
    }[];

    const credentials = users.map((user) => {
      if (!/^\d{4}$/.test(user.pin)) {
        throw new Error(`Refusing to migrate user ${user.id}: credential is missing or not 4 digits.`);
      }
      return {
        id: user.id,
        name: user.name,
        role: user.role,
        canScan: user.canScan ? 1 : 0,
        ...pinCredential(user.pin),
      };
    });

    const lookups = new Set(credentials.map((user) => user.pinLookup));
    if (lookups.size !== credentials.length) {
      throw new Error("Refusing to migrate: two users would share a PIN lookup key.");
    }

    const before = snapshot(db);
    db.pragma("foreign_keys = OFF");
    try {
      const migrate = db.transaction(() => {
        db.exec(`
          CREATE TABLE "User_new" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "name" TEXT NOT NULL,
            "pinHash" TEXT NOT NULL,
            "pinLookup" TEXT NOT NULL,
            "role" TEXT NOT NULL DEFAULT 'STAFF',
            "canScan" BOOLEAN NOT NULL DEFAULT true,
            "active" BOOLEAN NOT NULL DEFAULT true,
            "sessionVersion" INTEGER NOT NULL DEFAULT 0
          );
        `);
        const insert = db.prepare(`
          INSERT INTO "User_new" ("id", "name", "pinHash", "pinLookup", "role", "canScan", "active", "sessionVersion")
          VALUES (@id, @name, @pinHash, @pinLookup, @role, @canScan, 1, 0)
        `);
        for (const user of credentials) {
          insert.run(user);
        }
        db.exec('DROP TABLE "User";');
        db.exec('ALTER TABLE "User_new" RENAME TO "User";');
        db.exec('CREATE UNIQUE INDEX "User_pinLookup_key" ON "User"("pinLookup");');
        ensureThrottle(db);
        if (snapshot(db) !== before) {
          throw new Error("Inventory rows changed during auth migration.");
        }
      });
      migrate();
    } finally {
      db.pragma("foreign_keys = ON");
    }
    db.exec("VACUUM");

    log(`Hashed credentials for ${credentials.length} users. Plaintext PIN column removed.`);
    return { usersHashed: credentials.length, alreadyMigrated: false };
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
  migrateUserAuth(databasePathFromEnv());
}
