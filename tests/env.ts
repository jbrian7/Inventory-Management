import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const file = path.join(os.tmpdir(), `zap-auth-${process.pid}.db`);
fs.rmSync(file, { force: true });

process.env.DATABASE_URL = `file:${file}`;
process.env.PIN_PEPPER = "test-pepper-0123456789";
process.env.AUTH_SECRET = "test-auth-secret-0123456789";

export const testDatabasePath = file;
