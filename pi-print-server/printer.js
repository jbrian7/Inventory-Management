const { spawn } = require("child_process");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

async function printLabel(job) {
  const driver = process.env.PRINTER_DRIVER || "command";
  if (driver === "escpos") {
    return printWithEscpos(job);
  }
  if (driver !== "command") {
    throw new Error(`Unknown PRINTER_DRIVER "${driver}". Use "command" or "escpos".`);
  }
  return printWithCommand(job);
}

async function printWithCommand({ name, sku, qrData, pngBuffer }) {
  const filePath = path.join(
    os.tmpdir(),
    `zap-label-${Date.now()}-${process.pid}.png`
  );
  await fs.writeFile(filePath, pngBuffer);

  try {
    const output = await run(
      process.execPath,
      [path.join(__dirname, "print-command.js"), filePath],
      {
        env: {
          ...process.env,
          LABEL_NAME: name,
          LABEL_SKU: sku,
          LABEL_QR_DATA: qrData,
          LABEL_FILE: filePath,
        },
      }
    );
    return {
      printed: true,
      driver: "command",
      detail: output.trim(),
    };
  } finally {
    await fs.unlink(filePath).catch(() => undefined);
  }
}

function printWithEscpos({ name, sku, pngBuffer }) {
  let escpos;
  try {
    escpos = require("escpos");
    escpos.USB = require("escpos-usb");
  } catch {
    throw new Error(
      "escpos is not installed. From pi-print-server run: npm install escpos escpos-usb"
    );
  }

  return new Promise((resolve, reject) => {
    const filePath = path.join(
      os.tmpdir(),
      `zap-label-${Date.now()}-${process.pid}.png`
    );

    fs.writeFile(filePath, pngBuffer)
      .then(() => {
        escpos.Image.load(filePath, (image) => {
          const device = new escpos.USB();
          const printer = new escpos.Printer(device);
          device.open((openError) => {
            if (openError) {
              fs.unlink(filePath).catch(() => undefined);
              reject(openError);
              return;
            }
            printer
              .align("ct")
              .text(name)
              .text(sku)
              .image(image)
              .cut()
              .close(() => {
                fs.unlink(filePath).catch(() => undefined);
                resolve({ printed: true, driver: "escpos" });
              });
          });
        });
      })
      .catch(reject);
  });
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(stdout || stderr);
        return;
      }
      reject(new Error(stderr.trim() || `Printer command exited with code ${code}.`));
    });
  });
}

module.exports = { printLabel };
