# Zap Zone print server

Small Express server for the Raspberry Pi that sits next to the thermal label printer. The Next.js app will send a label job to this process on the local network.

## Start

From this folder:

```bash
npm install
npm start
```

`npm start` runs `node server.js`. The server listens on `0.0.0.0:3001`.

Check it with a sample label:

```bash
curl -s -X POST http://127.0.0.1:3001/print \
  -H "content-type: application/json" \
  -d '{"name":"Item Name","sku":"123","qrData":"ZAP-123"}'
```

A successful response includes `imageBytes` for the PNG generated from `qrData`.

The browser on an iPad calls this server directly, so `POST /print` allows cross-origin requests from the web app.

## Send the label to a printer

By default `PRINTER_DRIVER=command`. The server writes the QR PNG and runs `print-command.js`.

That script does not send anything until `LP_DEST` names a CUPS queue:

```bash
LP_DEST=ZapZone npm start
```

`print-command.js` then runs `lp -d "$LP_DEST" <label.png>`. Change that file if the Pi should call a different command.

To use the escpos USB driver instead, install the optional packages on the Pi and start with:

```bash
npm install escpos escpos-usb
PRINTER_DRIVER=escpos npm start
```

`printer.js` opens the USB printer, prints the item name, SKU, and QR image, then cuts. The printer has to be connected and visible to `escpos-usb`.

## Keep it running

```bash
npm install -g pm2
pm2 start server.js --name zap-print
```

Use the Pi's LAN address, for example `http://192.168.1.50:3001`, as the printer address in the web app.
