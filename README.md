# Inventory Manager

Inventory Manager is the product. This deployment's business name is Zap Zone, set with `BUSINESS_NAME`. When that variable is missing or blank, the app shows Your business.

Run one deployment per business. Each copy has its own SQLite file, its own `AUTH_SECRET` and `PIN_PEPPER`, and its own printer URL and token. There is no business switcher and no shared tenant table. The database path for this deployment stays `file:./dev.db`. Item QR values stay `ZAP-ITEM-<id>`, and the session cookie stays `zap_session`.

Staff scan bin labels on an iPhone or iPad, and the Next.js server on the store LAN records the stock change in SQLite. Labels are sent from that server to a Raspberry Pi print process. The printer token never goes to the browser.

Repository: [jbrian7/Inventory-Management](https://github.com/jbrian7/Inventory-Management)

## Features

- Touch layout for phones, with a wider layout on iPad and desktop browsers.
- In-browser QR scanning with `html5-qrcode`.
- Stock adjustments with an audit row for each change: who, what, before, after, and when.
- Low-stock list on the home page.
- Local printing through the Next.js server. CUPS accepting a job is not the same as a label leaving the printer.

## Stack

- Next.js 14 App Router, React, and TypeScript
- Tailwind CSS and Shadcn UI
- SQLite through Prisma 7 and `better-sqlite3`
- Raspberry Pi print server in `pi-print-server/` (Node.js, Express, CUPS `lp`)

There is no PostgreSQL database. `DATABASE_URL` is a SQLite file, usually `file:./dev.db`.

## Fresh install

Requirements: Node.js 22.

```bash
git clone https://github.com/jbrian7/Inventory-Management.git
cd Inventory-Management
npm install
```

Create `.env` from `.env.example`:

```env
DATABASE_URL="file:./dev.db"
AUTH_SECRET="replace-with-a-long-random-string"
PIN_PEPPER="replace-with-a-different-long-random-string"
BUSINESS_NAME="Zap Zone"
```

`BUSINESS_NAME` is the only business setting. Leave it unset on a new copy to show Your business. Do not put another business in this database.

`PIN_PEPPER` must be at least 16 characters. Keep it with the database backups. Changing it makes existing PINs unverifiable.

```bash
npx prisma db push
```

Development accounts (PINs 1001, 2002, 3003, and 4004) are created only when you opt in, and never when `NODE_ENV` is `production`:

```bash
ZAP_ALLOW_SEED=1 npx prisma db seed
npm run dev
```

The app listens at `http://localhost:3000` during `npm run dev`.

## Signing in

`AUTH_SECRET` signs the session cookie. `PIN_PEPPER` finds the account. Both must be the values that belong with this database. A different pepper looks like a wrong PIN. A missing secret or pepper returns “Sign-in is not configured.” The database path is `DATABASE_URL`. An empty file has no accounts. Do not seed a store database to fix a sign-in problem.

The session cookie is `Secure` on a public production host, and whenever a trusted proxy says the request is HTTPS (`TRUST_PROXY=1` and `X-Forwarded-Proto: https`). Browsers drop a `Secure` cookie on plain HTTP, so the PIN can be accepted and the next page sends you back to sign-in. Local development, `localhost`, and a private LAN host such as `http://192.168.x.x:3000` omit `Secure` so the cookie is kept. `COOKIE_SECURE=1` forces `Secure`. `COOKIE_SECURE=0` turns it off. Leave `COOKIE_SECURE` unset on a public HTTPS site.

| How you open the app | What to run | Cookie |
| --- | --- | --- |
| `http://localhost:3000` on this machine | `npm run dev` | Not `Secure`. Sign-in stays on this browser. |
| `http://192.168.x.x:3000` from a phone on the store LAN | `npm start` (`server.js`) | Not `Secure`, because the host is a private address. |
| `https://inventory.example.com` | `npm start` behind your TLS proxy | `Secure`. Set `TRUST_PROXY=1` and have the proxy send `X-Forwarded-Proto: https`. |

`npm start` gives each device its own PIN lockout from the TCP address `server.js` stamps. Five failures in ten minutes lock that device. `npm run dev` does not stamp the address, so every attempt on that process shares one counter. A forwarded address is used only when `TRUST_PROXY=1` and your proxy replaces the header. A wrong PIN or a thrown sign-in error clears the pad so it does not stay on “Checking PIN…”.

For a store database, do not run the seed. Create one admin instead. This does not change inventory:

```bash
ZAP_ADMIN_NAME="Alex" ZAP_ADMIN_PIN="4821" npx tsx scripts/create-admin.ts
```

The PIN must be 4 digits and must not be one of the development PINs. If that PIN already belongs to someone, the script stops and leaves the account as it is.

## Upgrade an existing database

Stop the app first. Copy the SQLite file, then run the migrations in this order. Do not seed, and do not reset the database. The scripts are safe to run again.

```bash
cp dev.db "dev.db.bak-$(date -u +%Y%m%dT%H%M%SZ)"
npx tsx scripts/migrate-user-auth.ts
npx tsx scripts/migrate-stock-history.ts
npx tsx scripts/migrate-actor-name.ts
npx tsx scripts/migrate-location-balances.ts
npx tsx scripts/migrate-totes.ts
npx tsx scripts/migrate-intake.ts
npx prisma db push
```

1. `migrate-user-auth.ts` replaces plaintext PINs with hashes. It needs `PIN_PEPPER`.
2. `migrate-stock-history.ts` adds the before/after quantity columns. Older rows stay in place with those fields empty.
3. `migrate-actor-name.ts` stores the staff name on movements that still point at a user. Rows with no user stay blank and show as Unknown.
4. `migrate-location-balances.ts` copies each item's quantity onto one balance at its current location, then removes `Item.quantity` and `Item.locationId`. It does not add stock at any other location. Item ids, SKUs, QR values, and history rows stay the same.
5. `migrate-totes.ts` adds empty tote tables. It does not create totes or change quantities, history, or item QR values.
6. `migrate-intake.ts` adds optional barcode and archive columns, plus an empty receipt table. It does not archive products or change quantities.
7. `prisma db push` aligns the SQLite file with `prisma/schema.prisma` without deleting inventory.

Back up `dev.db` and `.env` together. The pepper is required to check PINs. A safe copy is a file copy while the app is stopped, or SQLite's online backup:

```bash
sqlite3 dev.db ".backup 'dev.db.bak'"
```

Check the copy against the backup before starting the app again. Totals come from `StockBalance`, not from the item row:

```bash
sqlite3 dev.db.bak "SELECT sku, quantity FROM Item ORDER BY sku;"
sqlite3 dev.db "SELECT Item.sku, Location.name, StockBalance.quantity
  FROM StockBalance
  JOIN Item ON Item.id = StockBalance.itemId
  JOIN Location ON Location.id = StockBalance.locationId
  ORDER BY Item.sku;"
```

Each SKU's balance must equal the backup quantity, and each SKU must have one balance. History counts should match:

```bash
sqlite3 dev.db.bak "SELECT COUNT(*) FROM History;"
sqlite3 dev.db "SELECT COUNT(*) FROM History;"
```

Rollback is restoring the backup over the database file while the app is stopped. There is no reverse script.

```bash
cp "dev.db.bak-YYYYMMDDTHHMMSSZ" dev.db
```

Low stock compares an item's total across locations with its threshold. A transfer keeps that total, so it does not by itself mark an item low or clear a low-stock warning. An empty location does not mark the catalog item low while the total is still above the threshold. Manual out of stock is still a separate flag. A total of zero stays "Low" when the threshold is zero or more, which matches the previous catalog rule. "OUT OF STOCK" is only the manual flag.

Printed QR codes still identify the catalog item. Add and deduct apply to the location you choose. When an item is stocked in more than one location, the scan screen requires that choice.

## Login attempts

Failed PINs are counted in the database. Five failures in ten minutes lock that device for ten minutes. With `npm start`, the counter is the TCP address stamped by `server.js`, so two phones on the LAN do not lock each other. With `npm run dev`, there is no stamp and every attempt shares one counter.

Set `TRUST_PROXY=1` only when a proxy you run replaces `X-Forwarded-For` with the real client, or appends it. The app uses the last address in that header, then `X-Real-IP` if the forwarded header is empty. Example for a single nginx in front of the app:

```nginx
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Real-IP $remote_addr;
```

Do not forward a client-supplied `X-Forwarded-For` unchanged.

## Totes and public QR pages

A tote is a dedicated location. Its contents are the stock balances at that location, so a transfer into or out of a tote uses the same audited transfer as any other move. Do not point a tote at the stockroom.

Each tote has an unguessable public token. The phone URL is `PUBLIC_BASE_URL` plus `/t/` and that token. Set `PUBLIC_BASE_URL` to the public https origin, with no path, before printing labels. Localhost and private LAN addresses are rejected. A phone camera opens that page with no login. The page shows the business name, tote name, shelf label, item names, and quantities. It does not show staff, history, or other locations.

Turning the public link off or rotating it makes the old QR return the same not-available page. Print a new label after rotating.

The printed label is 2 inches by 2 inches, with the tote number in large type and a QR quiet zone. Choose a 2 inch label printer, or a letter sheet when the stickers are on ordinary paper. Opening the print dialog does not mean the label printed. The Raspberry Pi print server remains optional and reports whether it accepted the job.

### Internet deployment

Only `/t/<token>` is public. Login is required for items, totes, scan, history, settings, reports, and every other page. The public response is read-only, sends `noindex`, and does not set a session cookie.

Public rate limits require `npm start`, which runs `server.js`, or `TRUST_PROXY=1` with a proxy you control. `server.js` records the TCP peer and signs it with `AUTH_SECRET`. A browser-supplied `X-Forwarded-For`, `X-Real-IP`, or `x-inventory-peer` is ignored unless `TRUST_PROXY=1`. `next start` does not do this, so it is not the production command for public tote pages.

Put TLS on a reverse proxy you control. The proxy must replace the forwarding header with the visitor it actually accepted:

```nginx
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header Host $host;
```

Then set `TRUST_PROXY=1` and `PUBLIC_BASE_URL` to that https origin. Do not append a client-supplied `X-Forwarded-For`. People who share one public IP, including phones on the same network, share the same 30-request bucket. That is the address the server or the trusted proxy can see.

SQLite and `.env` stay on the server. They are not served as web files. Google Sheets is an export only.

PIN lockout with `npm start` uses that same stamped address, one counter per device. `npm run dev` still shares one counter. That is separate from the public tote limit.

## Google Sheets

Admins can download CSV files from Reports. Import those files into Google Sheets. Editing the spreadsheet does not change SQLite, which stays the live inventory.

The CSV escapes quotes and prefixes cells that start with `=`, `+`, `-`, `@`, or a tab so a spreadsheet does not treat them as formulas. Exports omit public tokens, PINs, and staff names.

A later optional job could upload those same files with the Google Sheets API. That is not built. The app does not need Google credentials to run.

## Printing

Run Next.js on the store LAN so it can reach the Pi. A cloud host cannot open `192.168.x.x`. Setup for the Pi is in `pi-print-server/README.md`.

```env
PRINT_SERVER_URL="http://192.168.1.50:3001"
PRINT_SERVER_TOKEN="same-value-as-PRINT_TOKEN"
```

When `LP_DEST` is unset, the print server returns `printed: false` and `status: "preview"`. When CUPS accepts the job, the response says the job was accepted. That confirms submission to CUPS, not that a physical label was printed.

## Checks

```bash
npm ci
npm ci --prefix pi-print-server
npx tsc --noEmit
npm run lint
npm test
npm run build
```

The print tests load `pi-print-server/server.js`, which needs the Express install from that folder's lockfile.

Pull requests run those checks in `.github/workflows/check.yml`.
