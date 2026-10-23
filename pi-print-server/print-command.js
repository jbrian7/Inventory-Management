const { spawn } = require("child_process");
const fs = require("fs");

function writeFd(fd, chunk) {
  fs.writeSync(fd, chunk);
}

const filePath = process.argv[2];
const destinationPattern = /^[A-Za-z0-9_-]{1,64}$/;

if (!filePath || !fs.existsSync(filePath)) {
  console.error("Label image was not created.");
  process.exit(1);
}

const destination = process.env.LP_DEST?.trim() ?? "";

if (!destination) {
  console.log("preview");
  process.exit(3);
}

if (!destinationPattern.test(destination)) {
  console.error("LP_DEST may only contain letters, numbers, hyphens, and underscores.");
  process.exit(1);
}

const child = spawn("lp", ["-d", destination, filePath], { stdio: ["ignore", "pipe", "pipe"] });

child.stdout.on("data", (chunk) => {
  writeFd(1, chunk);
});
child.stderr.on("data", (chunk) => {
  writeFd(2, chunk);
});

child.on("error", (error) => {
  const message =
    error.code === "ENOENT"
      ? "CUPS is not available. The lp command was not found.\n"
      : "CUPS is not available. The lp command could not be started.\n";
  writeFd(2, message);
});

child.on("close", (code) => {
  process.exit(code ?? 1);
});
