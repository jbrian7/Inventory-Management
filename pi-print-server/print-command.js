const { spawn } = require("child_process");
const fs = require("fs");

const filePath = process.argv[2];

if (!filePath || !fs.existsSync(filePath)) {
  console.error("Label image was not created.");
  process.exit(1);
}

const bytes = fs.statSync(filePath).size;
const destination = process.env.LP_DEST;

if (!destination) {
  console.log(`Label ready (${bytes} bytes). Set LP_DEST to send it to CUPS.`);
  process.exit(0);
}

const child = spawn("lp", ["-d", destination, filePath], { stdio: "inherit" });

child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
