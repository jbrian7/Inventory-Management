/**
 * Add Inventory Manager tabs to the spreadsheet in SPREADSHEET_ID.
 * Does not read or write dev.db.
 *
 *   npx tsx scripts/sheets-init.ts
 */
import "dotenv/config";

import { randomBytes } from "node:crypto";

import { pinCredential } from "../lib/pin";
import { ensureSheetTabs, googleWorkbookStore } from "../lib/storage/google-sheets";
import { Workbook } from "../lib/storage/workbook";

const demoPins = new Set(["1001", "2002", "3003", "4004"]);

async function main() {
  await ensureSheetTabs();
  const store = googleWorkbookStore();
  const book = await store.load();
  const empty = Workbook.empty();
  if (book.rows("Users").length === 0 && book.rows("Items").length === 0) {
    const pin = process.env.ZAP_ADMIN_PIN?.trim() ?? "";
    const name = process.env.ZAP_ADMIN_NAME?.trim() ?? "";
    if (name && /^\d{4}$/.test(pin) && !demoPins.has(pin)) {
      empty.insert("Users", {
        id: `user_${randomBytes(6).toString("hex")}`,
        name,
        role: "ADMIN",
        canScan: "1",
        active: "1",
        sessionVersion: "0",
        ...pinCredential(pin),
      });
      empty.insert("Locations", { id: "loc_stockroom", name: "Stockroom" });
    }
    await store.save(empty.rows("Users").length > 0 ? empty : book);
  }
  console.log("Spreadsheet tabs are ready. dev.db was not changed.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Sheets setup failed.";
  console.error(message);
  process.exit(1);
});
