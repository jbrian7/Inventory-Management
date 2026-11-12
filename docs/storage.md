# Storage backends

Inventory Manager writes to one backend at a time.

`STORAGE_BACKEND=sqlite` is the default. It uses `DATABASE_URL` and Prisma. Leave the variable unset to keep that behavior.

`STORAGE_BACKEND=google_sheets` uses one spreadsheet for that business. It does not also write SQLite. Do not run two app processes against two backends and expect them to stay in sync.

## Spreadsheet tabs

`npx tsx scripts/sheets-init.ts` adds these tabs when `SPREADSHEET_ID` and a service account are set:

Users, Categories, Locations, Items, Balances, Totes, History, Receipts, Locks, LoginThrottle, PublicScans.

Users store the same PIN hash and lookup key as SQLite. The sheet does not store raw PINs. Do not share the spreadsheet publicly. Share it with the service account and the people who administer that business.

Items keep `sku` and `qrCodeData` (`ZAP-ITEM-...`). Receipts store the request id so a repeated save does not apply twice. Stock changes are applied in one Sheets batch after the process checks the current quantities. Google Sheets is not a SQL database: one Node process serializes its own writes. Several serverless instances can still race. Use `npm start` (one server) when the backend is Google Sheets. SQLite remains the choice when you need database locks.

A sheet holds about 300 rows per tab in this version. A later change can page larger sheets.

## Google Cloud

1. Create a Google Cloud project and enable the Google Sheets API.
2. Create a service account and a JSON key.
3. Store the key outside the repo, or in `GOOGLE_SERVICE_ACCOUNT_JSON` on the server. Both paths are gitignored when you use `secrets/` or `google-service-account.json`.
4. Create a spreadsheet for this business and share it with the service account email as an editor.
5. Set `SPREADSHEET_ID` to the id in the sheet URL.
6. Run `npx tsx scripts/sheets-init.ts`.
7. Create the admin with `ZAP_ADMIN_NAME` and `ZAP_ADMIN_PIN` on that command if you want the first account in the sheet. Use a PIN that is not one of the development PINs. This does not touch `dev.db`.

```env
STORAGE_BACKEND="google_sheets"
SPREADSHEET_ID="the-id-from-the-sheet-url"
GOOGLE_APPLICATION_CREDENTIALS="/secure/inventory-sheets.json"
```

The browser never receives the service account JSON.

## Move data

Export reads a SQLite file, including a database that still stores `Item.quantity`, and writes a JSON workbook. Import writes a different SQLite file and refuses `dev.db` in this repository.

```bash
npx tsx scripts/storage-copy.ts export --sqlite /tmp/inventory-copy.db --file /tmp/inventory.json
npx tsx scripts/storage-copy.ts import --file /tmp/inventory.json --sqlite /tmp/inventory-sheets-copy.db
```

Pushing that JSON into Google Sheets is `sheets-init` plus a later upload. Treat the JSON file like a database backup: it contains PIN hashes.

## Vercel

`npm start` runs `server.js`, which stamps each TCP connection for PIN lockouts and public tote limits. Vercel does not run that custom server. On Vercel, set `TRUST_PROXY=1` and send `X-Forwarded-Proto` and a replaced `X-Forwarded-For` from the platform proxy. Sheets mode stores those counters in the spreadsheet. SQLite mode on Vercel needs a hosted database; a local `dev.db` file is not available on the server. This project is not configured for a public Vercel deploy yet.

Public tote pages still show only the business name, tote name, shelf label, and quantities above zero.

## What is still SQLite-only

Settings, reports, the scan adjustment screen, tote editing, and the full home dashboard read Prisma directly. With `STORAGE_BACKEND=google_sheets`, home, items, intake, history, login, and the public tote page use the spreadsheet. Use SQLite until those other screens are moved in a follow-up.
