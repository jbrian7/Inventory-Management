# Zap Zone print server

Small Express server for the Raspberry Pi that sits next to the thermal label printer.

The iPads talk to the Next.js app. The Next.js server, running on the same store LAN, sends the label to this process. The browser never receives the printer token and does not store a printer address.

This repository's Next.js app uses a local database and is meant to run on the store LAN (on the Pi, or on another machine next to it). A cloud-hosted Next.js process cannot open `192.168.x.x`. If the app later moves to a public host, keep a store-side gateway that holds the token and is reached through a VPN or an outbound tunnel. Do not put the token in browser JavaScript.

## Start

From this folder:

```bash
npm install
export PRINT_TOKEN="$(openssl rand -hex 32)"
npm start
```

`npm start` runs `node server.js`. The server listens on `0.0.0.0:3001` unless `PRINT_BIND` is set.

`PRINT_TOKEN` must be at least 16 characters. The same value goes in the Next.js environment as `PRINT_SERVER_TOKEN`. Every `/print` and `/health` request must send `Authorization: Bearer <token>`. Requests without it are rejected and nothing is printed. The server does not allow cross-origin browser calls.

Check it from the app server, not from an untrusted machine:

```bash
curl -s http://127.0.0.1:3001/health \
  -H "authorization: Bearer $PRINT_TOKEN"
```

Limit port 3001 to the app server. For example:

```bash
sudo ufw allow from 192.168.1.10 to any port 3001 proto tcp
```

Use `PRINT_BIND=127.0.0.1` when Next.js runs on the Pi itself and the print server should not accept other LAN connections.

## Send the label to a printer

By default `PRINTER_DRIVER=command`. The server writes the QR PNG and runs `print-command.js`.

Until `LP_DEST` names a CUPS queue, the server returns `printed: false` and `status: "preview"`. It does not report a successful print.

```bash
LP_DEST=ZapZone PRINT_TOKEN="$PRINT_TOKEN" npm start
```

`print-command.js` then runs `lp -d "$LP_DEST" <label.png>`. A successful `lp` exit means CUPS accepted the job. It does not prove the label came out of the printer. The queue name may contain letters, numbers, hyphens, and underscores. Change that file if the Pi should call a different command. The label still encodes the same `qrData` string the app stores, including values such as `ZAP-ITEM-<id>`.

If `lp` is missing, the response says CUPS is not available. If the queue does not answer, the response says the printer is offline. Neither case sets `printed: true`.

To use the optional escpos USB driver instead, install it on the Pi and start with:

```bash
npm install escpos escpos-usb
PRINTER_DRIVER=escpos PRINT_TOKEN="$PRINT_TOKEN" npm start
```

`printer.js` opens the USB printer, prints the item name, SKU, and QR image, then cuts. No new printer is required if CUPS already drives the current one.

## App server

On the Next.js machine:

```bash
PRINT_SERVER_URL="http://192.168.1.50:3001"
PRINT_SERVER_TOKEN="<same value as PRINT_TOKEN>"
```

Managers see the connection status under Settings and can print a test label. The test label uses the QR text `ZAP-TEST` and is not an inventory item. Item labels are printed from the item page by a signed-in user. The app loads the name, SKU, and QR payload from the database.

## Keep it running

```bash
npm install -g pm2
PRINT_TOKEN="$PRINT_TOKEN" LP_DEST=ZapZone pm2 start server.js --name zap-print
```
