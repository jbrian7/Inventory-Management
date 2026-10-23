import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { sendLabel, probePrinter } from "@/lib/print-client";
import {
  interpretPrintResponse,
  prepareItemPrint,
  prepareTestPrint,
  printAccessError,
  printerAdminError,
} from "@/lib/print-job";

const require = createRequire(import.meta.url);
const { createApp } = require("../pi-print-server/server.js") as {
  createApp: (options?: {
    token?: string;
    printLabel?: (job: { name: string; sku: string; qrData: string }) => Promise<unknown>;
    encodeQr?: (value: string) => Promise<Buffer>;
  }) => { listen: (...args: unknown[]) => http.Server };
};
const { classifyPrinterFailure } = require("../pi-print-server/printer.js") as {
  classifyPrinterFailure: (input: { code?: string; stderr?: string; message?: string }) => Error & { code?: string };
};

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const token = "test-token-0123456789";
const existingQr = "ZAP-ITEM-cmvezlzbx00007hjs7yhf5ogm";

function listen(app: { listen: (...args: unknown[]) => http.Server }) {
  const server = app.listen(0, "127.0.0.1");
  return new Promise<{ port: number; close: () => Promise<void> }>((resolve) => {
    server.on("listening", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Test server did not bind a port.");
      }
      resolve({
        port: address.port,
        close: () =>
          new Promise((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

function request(
  port: number,
  options: { method?: string; path?: string; token?: string; body?: string; headers?: Record<string, string> }
) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: options.path ?? "/print",
        method: options.method ?? "POST",
        headers: {
          ...(options.body ? { "content-type": "application/json", "content-length": Buffer.byteLength(options.body) } : {}),
          ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
          ...(options.headers ?? {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );
    req.on("error", reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

test("the print server rejects unauthorized requests and does not print", async () => {
  let calls = 0;
  const app = createApp({
    token,
    printLabel: async () => {
      calls += 1;
      return { printed: true, status: "printed", driver: "command" };
    },
  });
  const server = await listen(app);
  try {
    const missing = await request(server.port, {
      body: JSON.stringify({ name: "Balls", sku: "BB-1", qrData: existingQr }),
    });
    const wrong = await request(server.port, {
      token: "wrong-token-0123456789",
      body: JSON.stringify({ name: "Balls", sku: "BB-1", qrData: existingQr }),
    });
    const open = await request(server.port, { method: "OPTIONS" });
    assert.equal(missing.status, 401);
    assert.equal(JSON.parse(missing.body).printed, false);
    assert.equal(wrong.status, 401);
    assert.equal(open.headers["access-control-allow-origin"], undefined);
    assert.notEqual(open.status, 204);
    assert.equal(calls, 0);

    const unset = createApp({ token: "" });
    const blocked = await listen(unset);
    try {
      const response = await request(blocked.port, {
        token,
        body: JSON.stringify({ name: "Balls", sku: "BB-1", qrData: existingQr }),
      });
      assert.equal(response.status, 503);
      assert.equal(JSON.parse(response.body).printed, false);
      assert.match(JSON.parse(response.body).error, /PRINT_TOKEN/);
    } finally {
      await blocked.close();
    }
  } finally {
    await server.close();
  }
});

test("malformed labels and oversized requests are refused", async () => {
  const app = createApp({
    token,
    encodeQr: async () => {
      throw new Error("cannot encode");
    },
  });
  const server = await listen(app);
  try {
    const missingField = await request(server.port, {
      token,
      body: JSON.stringify({ name: "Balls", sku: "BB-1" }),
    });
    const newline = await request(server.port, {
      token,
      body: JSON.stringify({ name: "Balls", sku: "BB-1", qrData: "ZAP\nITEM" }),
    });
    const tooLong = await request(server.port, {
      token,
      body: JSON.stringify({ name: "B".repeat(201), sku: "BB-1", qrData: existingQr }),
    });
    const brokenJson = await request(server.port, { token, body: "{" });
    const encoded = await request(server.port, {
      token,
      body: JSON.stringify({ name: "Balls", sku: "BB-1", qrData: existingQr }),
    });
    const plain = await request(server.port, {
      token,
      body: JSON.stringify({ name: "Balls", sku: "BB-1", qrData: existingQr }),
      headers: { "content-type": "text/plain" },
    });
    const huge = await request(server.port, { token, body: JSON.stringify({ name: "n".repeat(9000) }) });
    assert.equal(missingField.status, 400);
    assert.equal(JSON.parse(missingField.body).printed, false);
    assert.equal(newline.status, 400);
    assert.match(JSON.parse(newline.body).error, /QR data/);
    assert.equal(tooLong.status, 400);
    assert.equal(brokenJson.status, 400);
    assert.equal(encoded.status, 400);
    assert.equal(JSON.parse(encoded.body).code, "malformed_qr");
    assert.equal(plain.status, 415);
    assert.equal(JSON.parse(plain.body).printed, false);
    assert.equal(huge.status, 413);
    assert.equal(JSON.parse(huge.body).printed, false);
  } finally {
    await server.close();
  }
});

test("an existing QR payload previews instead of reporting a print when no queue is configured", async () => {
  const previous = process.env.LP_DEST;
  delete process.env.LP_DEST;
  process.env.PRINTER_DRIVER = "command";
  const app = createApp({ token });
  const server = await listen(app);
  try {
    const response = await request(server.port, {
      token,
      body: JSON.stringify({ name: "Bouncy balls", sku: "BB-001", qrData: existingQr }),
    });
    const body = JSON.parse(response.body);
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.printed, false);
    assert.equal(body.status, "preview");
    assert.notEqual(body.printed, true);
  } finally {
    await server.close();
    if (previous === undefined) {
      delete process.env.LP_DEST;
    } else {
      process.env.LP_DEST = previous;
    }
  }
});

test("a configured queue reports a real print, and a missing or offline printer does not", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zap-lp-"));
  const argsFile = path.join(dir, "args");
  fs.writeFileSync(path.join(dir, "lp"), `#!/bin/sh\necho "$@" > ${JSON.stringify(argsFile)}\nexit 0\n`);
  fs.chmodSync(path.join(dir, "lp"), 0o755);
  const offlineDir = fs.mkdtempSync(path.join(os.tmpdir(), "zap-lp-off-"));
  fs.writeFileSync(
    path.join(offlineDir, "lp"),
    "#!/bin/sh\necho 'The printer is not responding.' >&2\nexit 1\n"
  );
  fs.chmodSync(path.join(offlineDir, "lp"), 0o755);
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "zap-lp-empty-"));
  const previous = { PATH: process.env.PATH, LP_DEST: process.env.LP_DEST, PRINTER_DRIVER: process.env.PRINTER_DRIVER };
  process.env.PRINTER_DRIVER = "command";
  process.env.LP_DEST = "ZapZone";
  const app = createApp({ token });
  const server = await listen(app);
  try {
    process.env.PATH = dir;
    const printed = await request(server.port, {
      token,
      body: JSON.stringify({ name: "Bouncy balls", sku: "BB-001", qrData: existingQr }),
    });
    const printedBody = JSON.parse(printed.body);
    assert.equal(printed.status, 200);
    assert.equal(printedBody.printed, true);
    assert.equal(printedBody.status, "printed");
    assert.match(fs.readFileSync(argsFile, "utf8"), /ZapZone/);

    process.env.PATH = offlineDir;
    const offline = await request(server.port, {
      token,
      body: JSON.stringify({ name: "Bouncy balls", sku: "BB-001", qrData: existingQr }),
    });
    const offlineBody = JSON.parse(offline.body);
    assert.equal(offline.status, 503);
    assert.equal(offlineBody.printed, false);
    assert.equal(offlineBody.code, "printer_offline");
    assert.match(offlineBody.error, /offline/);

    process.env.PATH = emptyDir;
    const cups = await request(server.port, {
      token,
      body: JSON.stringify({ name: "Bouncy balls", sku: "BB-001", qrData: existingQr }),
    });
    const cupsBody = JSON.parse(cups.body);
    assert.equal(cups.status, 503);
    assert.equal(cupsBody.printed, false);
    assert.equal(cupsBody.code, "cups_unavailable");
    assert.match(cupsBody.error, /CUPS/);
  } finally {
    await server.close();
    process.env.PATH = previous.PATH;
    if (previous.LP_DEST === undefined) {
      delete process.env.LP_DEST;
    } else {
      process.env.LP_DEST = previous.LP_DEST;
    }
    if (previous.PRINTER_DRIVER === undefined) {
      delete process.env.PRINTER_DRIVER;
    } else {
      process.env.PRINTER_DRIVER = previous.PRINTER_DRIVER;
    }
  }
});

test("print command exits as a preview when LP_DEST is missing", () => {
  const file = path.join(os.tmpdir(), `zap-label-preview-${process.pid}.png`);
  fs.writeFileSync(file, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const result = spawnSync(process.execPath, [path.join(repoRoot, "pi-print-server/print-command.js"), file], {
    env: { ...process.env, LP_DEST: "" },
    encoding: "utf8",
  });
  fs.rmSync(file, { force: true });
  assert.equal(result.status, 3);
  assert.match(result.stdout, /preview/);
  const offline = classifyPrinterFailure({ stderr: "The printer is not responding." });
  assert.equal(offline.code, "printer_offline");
  const cups = classifyPrinterFailure({ code: "ENOENT" });
  assert.equal(cups.code, "cups_unavailable");
});

test("signed-in staff can print an item, and only managers can test the printer", async () => {
  const staff = { role: "STAFF", active: true };
  const manager = { role: "MANAGER", active: true };
  assert.equal(printAccessError(null), "Sign in to print a label.");
  assert.equal(printAccessError({ role: "STAFF", active: false }), "Sign in to print a label.");
  assert.equal(printAccessError(staff), null);
  assert.match(printerAdminError(staff) ?? "", /admins and managers/);
  assert.equal(printerAdminError(manager), null);

  let sent: unknown = null;
  const denied = await prepareItemPrint(null, "item-1", {
    loadItem: async () => {
      throw new Error("should not load");
    },
    send: async () => {
      throw new Error("should not send");
    },
  });
  assert.equal(denied.printed, false);
  assert.match("error" in denied ? denied.error : "", /Sign in/);

  const printed = await prepareItemPrint(staff, "item-1", {
    loadItem: async () => ({ name: "Bouncy balls", sku: "BB-001", qrCodeData: existingQr }),
    send: async (label) => {
      sent = label;
      return { status: "preview", printed: false };
    },
  });
  assert.deepEqual(sent, { name: "Bouncy balls", sku: "BB-001", qrData: existingQr });
  assert.equal(printed.printed, false);
  if ("status" in printed) {
    assert.equal(printed.status, "preview");
  }

  const testDenied = await prepareTestPrint(staff, async () => {
    throw new Error("should not send");
  });
  assert.equal(testDenied.printed, false);
  const testSent = await prepareTestPrint(manager, async (label) => {
    sent = label;
    return { status: "printed", printed: true };
  });
  assert.equal(testSent.printed, true);
  assert.deepEqual(sent, { name: "Zap Zone test", sku: "TEST", qrData: "ZAP-TEST" });
});

test("client responses never treat an unconfirmed body as printed", async () => {
  assert.deepEqual(interpretPrintResponse(200, { ok: true }), {
    printed: false,
    error: "The print server did not confirm a print.",
  });
  assert.deepEqual(interpretPrintResponse(200, { printed: false, status: "preview" }), {
    status: "preview",
    printed: false,
  });
  assert.deepEqual(interpretPrintResponse(200, { printed: true, status: "printed" }), {
    status: "printed",
    printed: true,
  });
  assert.equal(interpretPrintResponse(503, { code: "printer_offline" }).printed, false);
  const cupsOutcome = interpretPrintResponse(503, { code: "cups_unavailable" });
  assert.match("error" in cupsOutcome ? cupsOutcome.error : "", /CUPS/);

  const preview = await sendLabel(
    { name: "Bouncy balls", sku: "BB-001", qrData: existingQr },
    {
      env: { PRINT_SERVER_URL: "http://127.0.0.1:9", PRINT_SERVER_TOKEN: token },
      fetchImpl: async () =>
        new Response(JSON.stringify({ ok: true, printed: false, status: "preview" }), { status: 200 }),
    }
  );
  assert.equal(preview.printed, false);
  const unreachable = await sendLabel(
    { name: "Bouncy balls", sku: "BB-001", qrData: existingQr },
    {
      env: { PRINT_SERVER_URL: "http://127.0.0.1:9", PRINT_SERVER_TOKEN: token },
      fetchImpl: async () => {
        throw new Error("connect ECONNREFUSED");
      },
    }
  );
  assert.equal(unreachable.printed, false);
  assert.match("error" in unreachable ? unreachable.error : "", /cannot reach/);

  const status = await probePrinter({ env: {} });
  assert.equal(status.mode, "unconfigured");
  assert.equal(status.configured, false);

  const button = fs.readFileSync(path.join(repoRoot, "app/items/print-label-button.tsx"), "utf8");
  const form = fs.readFileSync(path.join(repoRoot, "app/settings/printer-form.tsx"), "utf8");
  assert.equal(button.includes("localStorage"), false);
  assert.equal(button.includes("PRINT_SERVER_TOKEN"), false);
  assert.equal(form.includes("localStorage"), false);
  assert.equal(form.includes("PRINT_SERVER_TOKEN"), false);
});
