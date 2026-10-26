# Zap Zone QR Inventory System

Mobile-first inventory for family entertainment centers. Staff scan bin labels on an iPhone or iPad, and the Next.js server on the store LAN records the stock change in SQLite. Labels are sent from that server to a Raspberry Pi print process. The printer token never goes to the browser.

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
```

`PIN_PEPPER` must be at least 16 characters. Keep it with the database backups. Changing it makes existing PINs unverifiable.

```bash
npx prisma db push
```

Development accounts (PINs 1001, 2002, 3003, and 4004) are created only when you opt in, and never when `NODE_ENV` is `production`:

```bash
ZAP_ALLOW_SEED=1 npx prisma db seed
npm run dev
```

The app listens at `http://localhost:3000`.

For a store database, do not run the seed. Create one admin instead. This does not change inventory:

```bash
ZAP_ADMIN_NAME="Alex" ZAP_ADMIN_PIN="4821" npx tsx scripts/create-admin.ts
```

The PIN must be 4 digits and must not be one of the development PINs. If that PIN already belongs to someone, the script stops and leaves the account as it is.

## Upgrade an existing database

Stop the app first. Copy the SQLite file, then run the migrations in this order. Each script leaves item quantities alone. The auth script does not create demo users.

```bash
cp dev.db "dev.db.bak-$(date -u +%Y%m%dT%H%M%SZ)"
npx tsx scripts/migrate-user-auth.ts
npx tsx scripts/migrate-stock-history.ts
npx tsx scripts/migrate-actor-name.ts
npx prisma db push
```

1. `migrate-user-auth.ts` replaces plaintext PINs with hashes. It needs `PIN_PEPPER`.
2. `migrate-stock-history.ts` adds the before/after quantity columns. Older rows stay in place with those fields empty.
3. `migrate-actor-name.ts` stores the staff name on movements that still point at a user. Rows with no user stay blank and show as Unknown.
4. `prisma db push` aligns the SQLite file with `prisma/schema.prisma` without deleting inventory.

Back up `dev.db` and `.env` together. The pepper is required to check PINs. A safe copy is a file copy while the app is stopped, or SQLite's online backup:

```bash
sqlite3 dev.db ".backup 'dev.db.bak'"
```

## Login attempts

Failed PINs are counted in the database. Five failures in ten minutes lock that client for ten minutes. On the store LAN, with no reverse proxy, every device shares one counter. That is intentional: the browser cannot supply its own address.

Set `TRUST_PROXY=1` only when a proxy you run replaces `X-Forwarded-For` with the real client, or appends it. Zap Zone uses the last address in that header, then `X-Real-IP` if the forwarded header is empty. Example for a single nginx in front of the app:

```nginx
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Real-IP $remote_addr;
```

Do not forward a client-supplied `X-Forwarded-For` unchanged.

## Printing

Run Next.js on the store LAN so it can reach the Pi. A cloud host cannot open `192.168.x.x`. Setup for the Pi is in `pi-print-server/README.md`.

```env
PRINT_SERVER_URL="http://192.168.1.50:3001"
PRINT_SERVER_TOKEN="same-value-as-PRINT_TOKEN"
```

When `LP_DEST` is unset, the print server returns `printed: false` and `status: "preview"`. When CUPS accepts the job, the response says the job was accepted. That confirms submission to CUPS, not that a physical label was printed.

## Checks

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
```

Pull requests run those checks in `.github/workflows/check.yml`.
