const crypto = require("crypto");
const express = require("express");
const QRCode = require("qrcode");

const { printLabel, readPrinterConfig } = require("./printer");

const maxName = 200;
const maxSku = 80;
const maxQr = 256;

function createApp(options = {}) {
  const token = options.token ?? process.env.PRINT_TOKEN ?? "";
  const print = options.printLabel ?? printLabel;
  const encodeQr =
    options.encodeQr ??
    ((value) =>
      QRCode.toBuffer(value, {
        type: "png",
        errorCorrectionLevel: "M",
        margin: 1,
        width: 256,
      }));
  const app = express();
  app.disable("x-powered-by");

  app.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  app.get("/health", requireToken(token), (_req, res) => {
    res.json({ ok: true, printed: false, ...readPrinterConfig() });
  });

  app.post(
    "/print",
    requireToken(token),
    (req, res, next) => {
      const type = req.headers["content-type"] || "";
      if (!type.includes("application/json")) {
        res.status(415).json({
          ok: false,
          printed: false,
          error: "Content-Type must be application/json.",
          code: "malformed",
        });
        return;
      }
      next();
    },
    express.json({ limit: "8kb" }),
    async (req, res) => {
      let label;
      try {
        label = validateLabel(req.body);
      } catch (error) {
        res.status(400).json({
          ok: false,
          printed: false,
          error: error instanceof Error ? error.message : "Label fields are not valid.",
          code: "malformed",
        });
        return;
      }

      let pngBuffer;
      try {
        pngBuffer = await encodeQr(label.qrData);
      } catch {
        res.status(400).json({
          ok: false,
          printed: false,
          error: "That QR value cannot be encoded on a label.",
          code: "malformed_qr",
        });
        return;
      }

      if (!Buffer.isBuffer(pngBuffer) || pngBuffer.length < 8 || pngBuffer[0] !== 0x89) {
        res.status(400).json({
          ok: false,
          printed: false,
          error: "That QR value cannot be encoded on a label.",
          code: "malformed_qr",
        });
        return;
      }

      try {
        const result = await print({ ...label, pngBuffer });
        const printed = result?.printed === true && result?.status === "printed";
        res.json({
          ok: true,
          printed,
          status: printed ? "printed" : "preview",
          driver: result?.driver || readPrinterConfig().driver,
          detail: typeof result?.detail === "string" ? result.detail : undefined,
        });
      } catch (error) {
        const code =
          error?.code === "cups_unavailable" || error?.code === "printer_offline" ? error.code : "print_failed";
        const status = code === "print_failed" ? 502 : 503;
        const message =
          code === "print_failed"
            ? "The label could not be printed."
            : error instanceof Error
              ? error.message
              : "The label could not be printed.";
        res.status(status).json({ ok: false, printed: false, error: message, code });
      }
    }
  );

  app.use((error, _req, res, _next) => {
    if (error?.type === "entity.too.large" || error?.status === 413 || error?.statusCode === 413) {
      res.status(413).json({
        ok: false,
        printed: false,
        error: "Print request is too large.",
        code: "malformed",
      });
      return;
    }
    if (error instanceof SyntaxError) {
      res.status(400).json({
        ok: false,
        printed: false,
        error: "Request body must be JSON.",
        code: "malformed",
      });
      return;
    }
    res.status(500).json({
      ok: false,
      printed: false,
      error: "The label could not be printed.",
      code: "print_failed",
    });
  });

  return app;
}

function requireToken(token) {
  return function checkToken(req, res, next) {
    const problem = tokenProblem(token);
    if (problem) {
      res.status(503).json({ ok: false, printed: false, error: problem, code: "unconfigured" });
      return;
    }
    const header = req.get("authorization") || "";
    const match = /^Bearer (\S+)$/.exec(header);
    if (!match || !tokensMatch(match[1], token)) {
      res.status(401).json({ ok: false, printed: false, error: "Unauthorized.", code: "unauthorized" });
      return;
    }
    next();
  };
}

function tokenProblem(token) {
  if (!token) {
    return "PRINT_TOKEN is not set on the print server.";
  }
  if (token.length < 16) {
    return "PRINT_TOKEN must be at least 16 characters.";
  }
  return null;
}

function tokensMatch(presented, expected) {
  const left = Buffer.from(presented);
  const right = Buffer.from(expected);
  if (left.length !== right.length) {
    crypto.timingSafeEqual(right, right);
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function validateLabel(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Expected JSON with name, sku, and qrData.");
  }
  return {
    name: requiredText(body.name, maxName, "Name"),
    sku: requiredText(body.sku, maxSku, "SKU"),
    qrData: requiredText(body.qrData, maxQr, "QR data"),
  };
}

function requiredText(value, max, label) {
  if (typeof value !== "string") {
    throw new Error(`${label} must be text.`);
  }
  const text = value.trim();
  if (!text) {
    throw new Error(`${label} is required.`);
  }
  if (text.length > max) {
    throw new Error(`${label} is too long.`);
  }
  if (/[\u0000-\u001F\u007F]/.test(text)) {
    throw new Error(`${label} contains characters that cannot be printed.`);
  }
  return text;
}

function bindAddress() {
  const value = process.env.PRINT_BIND?.trim() || "0.0.0.0";
  if (!/^[A-Za-z0-9.:-]{1,253}$/.test(value)) {
    throw new Error("PRINT_BIND must be a host or IP address.");
  }
  return value;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3001);
  const host = bindAddress();
  createApp().listen(port, host, () => {
    console.log(`Print server listening on ${host}:${port}`);
  });
}

module.exports = { createApp };
