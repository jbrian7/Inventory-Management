const { spawn } = require("child_process");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const destinationPattern = /^[A-Za-z0-9_-]{1,64}$/;

function readPrinterConfig() {
  const driver = process.env.PRINTER_DRIVER || "command";
  if (driver === "escpos") {
    return {
      driver,
      destinationConfigured: true,
      destination: null,
      mode: "ready",
    };
  }
  const destination = process.env.LP_DEST?.trim() ?? "";
  if (!destination) {
    return {
      driver: "command",
      destinationConfigured: false,
      destination: null,
      mode: "preview",
    };
  }
  if (!destinationPattern.test(destination)) {
    return {
      driver: "command",
      destinationConfigured: false,
      destination: null,
      mode: "error",
    };
  }
  return {
    driver: "command",
    destinationConfigured: true,
    destination,
    mode: "ready",
  };
}

function classifyPrinterFailure(input) {
  const text = `${input.stderr || ""}\n${input.message || ""}`;
  if (input.code === "ENOENT" || /lp command was not found|could not be started|ENOENT/i.test(text)) {
    return failure(
      "cups_unavailable",
      "CUPS is not available. Install CUPS and confirm the lp command is on PATH."
    );
  }
  if (/not responding|offline|unable to connect|paused/i.test(text)) {
    return failure(
      "printer_offline",
      "The printer is offline. Check that it is powered on and connected to the Pi."
    );
  }
  if (/does not exist|unknown destination|was not found|LP_DEST may only/i.test(text)) {
    return failure("printer_offline", "The CUPS queue named by LP_DEST was not found.");
  }
  return failure("printer_offline", "The printer did not accept the label.");
}

function failure(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function printLabel(job) {
  const driver = process.env.PRINTER_DRIVER || "command";
  if (driver === "escpos") {
    return printWithEscpos(job);
  }
  if (driver !== "command") {
    throw failure("cups_unavailable", `Unknown PRINTER_DRIVER "${driver}". Use "command" or "escpos".`);
  }
  return printWithCommand(job);
}

async function printWithCommand({ name, sku, qrData, pngBuffer }) {
  const filePath = path.join(os.tmpdir(), `zap-label-${crypto.randomBytes(8).toString("hex")}.png`);
  await fs.writeFile(filePath, pngBuffer);

  try {
    const result = await run(process.execPath, [path.join(__dirname, "print-command.js"), filePath], {
      env: {
        PATH: process.env.PATH || "",
        LP_DEST: process.env.LP_DEST,
        LABEL_NAME: name,
        LABEL_SKU: sku,
        LABEL_QR_DATA: qrData,
        LABEL_FILE: filePath,
      },
    });
    const output = result.stdout.trim();
    if (result.code === 3 || output === "preview") {
      return {
        printed: false,
        status: "preview",
        driver: "command",
        detail: "LP_DEST is not set, so the label was not sent to a printer.",
      };
    }
    if (result.code === 0) {
      return {
        printed: true,
        status: "printed",
        driver: "command",
        detail: output,
      };
    }
    throw classifyPrinterFailure({ code: result.code, stderr: result.stderr, message: result.stdout });
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw classifyPrinterFailure(error);
    }
    throw error;
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
    throw failure(
      "cups_unavailable",
      "escpos is not installed. From pi-print-server run: npm install escpos escpos-usb"
    );
  }

  return new Promise((resolve, reject) => {
    const filePath = path.join(os.tmpdir(), `zap-label-${crypto.randomBytes(8).toString("hex")}.png`);
    fs.writeFile(filePath, pngBuffer)
      .then(() => {
        escpos.Image.load(filePath, (image) => {
          const device = new escpos.USB();
          const printer = new escpos.Printer(device);
          device.open((openError) => {
            if (openError) {
              fs.unlink(filePath).catch(() => undefined);
              reject(
                failure(
                  "printer_offline",
                  "The printer is offline. Check that it is powered on and connected to the Pi."
                )
              );
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
                resolve({ printed: true, status: "printed", driver: "escpos" });
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
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

module.exports = { printLabel, readPrinterConfig, classifyPrinterFailure };
