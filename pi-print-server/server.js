const express = require("express");
const QRCode = require("qrcode");

const { printLabel } = require("./printer");

const app = express();
const port = Number(process.env.PORT || 3001);

app.use(express.json({ limit: "100kb" }));

app.post("/print", async (req, res) => {
  const body = req.body ?? {};
  const name = body.name;
  const sku = body.sku;
  const qrData = body.qrData;

  if (!isText(name) || !isText(sku) || !isText(qrData)) {
    res.status(400).json({
      error: "Expected JSON with name, sku, and qrData strings.",
    });
    return;
  }

  try {
    const pngBuffer = await QRCode.toBuffer(qrData, {
      type: "png",
      errorCorrectionLevel: "M",
      margin: 1,
      width: 256,
    });

    if (pngBuffer.length < 8 || pngBuffer[0] !== 0x89 || pngBuffer.toString("ascii", 1, 4) !== "PNG") {
      throw new Error("QR image was not a PNG.");
    }

    const result = await printLabel({
      name: name.trim(),
      sku: sku.trim(),
      qrData: qrData.trim(),
      pngBuffer,
    });

    res.json({
      ok: true,
      name: name.trim(),
      sku: sku.trim(),
      qrData: qrData.trim(),
      imageBytes: pngBuffer.length,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Print failed.";
    res.status(502).json({ error: message });
  }
});

app.use((error, _req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400) {
    res.status(400).json({ error: "Request body must be JSON." });
    return;
  }
  next(error);
});

function isText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

app.listen(port, "0.0.0.0", () => {
  console.log(`Print server listening on http://0.0.0.0:${port}`);
});
