/**
 * Copy inventory between a SQLite file and a spreadsheet workbook JSON file.
 *
 *   npx tsx scripts/storage-copy.ts export --sqlite /tmp/copy.db --file /tmp/inventory.json
 *   npx tsx scripts/storage-copy.ts import --file /tmp/inventory.json --sqlite /tmp/other.db
 *
 * Import refuses to write the repository's dev.db. Export only reads.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import Database from "better-sqlite3";

import { sheetColumns, sheetNames, type SheetName } from "../lib/storage/schema";
import { Workbook, type Row } from "../lib/storage/workbook";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function liveDatabase() {
  return path.resolve(process.cwd(), "dev.db");
}

function refuseLiveWrite(file: string) {
  if (path.resolve(file) === liveDatabase()) {
    throw new Error("Refusing to write dev.db. Import into a copy, then replace the live file only after you approve it.");
  }
}

function tableExists(db: Database.Database, name: string) {
  return Boolean(db.prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

function columnsOf(db: Database.Database, table: string) {
  if (!tableExists(db, table)) {
    return new Set<string>();
  }
  return new Set((db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map((column) => column.name));
}

function readRows(db: Database.Database, table: string, columns: readonly string[]) {
  const present = columnsOf(db, table);
  if (present.size === 0) {
    return [] as Row[];
  }
  const selected = columns.filter((column) => present.has(column));
  if (selected.length === 0) {
    return [] as Row[];
  }
  return (db.prepare(`SELECT ${selected.map((column) => `"${column}"`).join(", ")} FROM "${table}"`).all() as Record<string, unknown>[]).map(
    (row) => {
      const stored: Row = {};
      for (const column of columns) {
        const value = row[column];
        stored[column] = value === null || value === undefined ? "" : String(value);
      }
      return stored;
    }
  );
}

function exportSqlite(file: string) {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  const book = Workbook.empty();
  const map: Record<SheetName, string> = {
    Users: "User",
    Categories: "Category",
    Locations: "Location",
    Items: "Item",
    Balances: "StockBalance",
    Totes: "Tote",
    History: "History",
    Receipts: "StockReceipt",
    Locks: "Locks",
    LoginThrottle: "LoginThrottle",
    PublicScans: "PublicScanLimit",
  };
  for (const name of sheetNames) {
    for (const row of readRows(db, map[name], sheetColumns[name])) {
      book.insert(name, row);
    }
  }
  const itemColumns = columnsOf(db, "Item");
  if (itemColumns.has("quantity") && itemColumns.has("locationId") && !tableExists(db, "StockBalance")) {
    const legacy = db.prepare("SELECT id, locationId, quantity FROM Item").all() as {
      id: string;
      locationId: string | null;
      quantity: number;
    }[];
    for (const item of legacy) {
      if (!item.locationId) {
        continue;
      }
      book.insert("Balances", {
        id: `legacy-${item.id}`,
        itemId: item.id,
        locationId: item.locationId,
        quantity: String(item.quantity),
      });
    }
  }
  db.close();
  return book;
}

function importSqlite(file: string, book: Workbook) {
  refuseLiveWrite(file);
  const db = new Database(file);
  db.exec("PRAGMA foreign_keys = OFF");
  for (const name of sheetNames) {
    const columns = sheetColumns[name];
    const table = {
      Users: "User",
      Categories: "Category",
      Locations: "Location",
      Items: "Item",
      Balances: "StockBalance",
      Totes: "Tote",
      History: "History",
      Receipts: "StockReceipt",
      Locks: "Locks",
      LoginThrottle: "LoginThrottle",
      PublicScans: "PublicScanLimit",
    }[name];
    if (!tableExists(db, table)) {
      continue;
    }
    const present = columnsOf(db, table);
    const usable = columns.filter((column) => present.has(column));
    if (usable.length === 0) {
      continue;
    }
    db.prepare(`DELETE FROM "${table}"`).run();
    const statement = db.prepare(
      `INSERT INTO "${table}" (${usable.map((column) => `"${column}"`).join(", ")}) VALUES (${usable.map(() => "?").join(", ")})`
    );
    for (const row of book.rows(name)) {
      statement.run(...usable.map((column) => row[column] || null));
    }
  }
  db.close();
}

function main() {
  const command = process.argv[2];
  const sqlite = argument("--sqlite");
  const file = argument("--file");
  if (command === "export") {
    if (!sqlite || !file) {
      throw new Error("export needs --sqlite and --file.");
    }
    const book = exportSqlite(sqlite);
    fs.writeFileSync(file, JSON.stringify(book.toGrids(), null, 2));
    console.log(`Exported ${sqlite} to ${file}.`);
    return;
  }
  if (command === "import") {
    if (!sqlite || !file) {
      throw new Error("import needs --file and --sqlite.");
    }
    const grids = JSON.parse(fs.readFileSync(file, "utf8")) as Parameters<typeof Workbook.fromGrids>[0];
    importSqlite(sqlite, Workbook.fromGrids(grids));
    console.log(`Imported ${file} into ${sqlite}.`);
    return;
  }
  throw new Error("Use export or import.");
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main();
}

export { exportSqlite, importSqlite, refuseLiveWrite };
