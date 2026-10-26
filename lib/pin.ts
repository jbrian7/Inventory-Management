import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const scryptN = 16384;
const scryptR = 8;
const scryptP = 1;
const keyLength = 32;

function pepper() {
  const value = process.env.PIN_PEPPER;
  if (!value || value.length < 16) {
    throw new Error("PIN_PEPPER is not set.");
  }
  return value;
}

/** Deterministic lookup key. Unique PINs map to unique keys without storing the PIN. */
export function pinLookup(pin: string) {
  return createHmac("sha256", pepper()).update(pin).digest("hex");
}

export function hashPin(pin: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, keyLength, { N: scryptN, r: scryptR, p: scryptP });
  return [
    "scrypt",
    String(scryptN),
    String(scryptR),
    String(scryptP),
    salt.toString("base64"),
    hash.toString("base64"),
  ].join("$");
}

export function verifyPin(pin: string, stored: string) {
  const [algorithm, nRaw, rRaw, pRaw, saltB64, hashB64] = stored.split("$");
  if (algorithm !== "scrypt" || !nRaw || !rRaw || !pRaw || !saltB64 || !hashB64) {
    return false;
  }
  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  if (salt.length === 0 || expected.length === 0) {
    return false;
  }
  const actual = scryptSync(pin, salt, expected.length, { N: n, r, p });
  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

export function pinCredential(pin: string) {
  return { pinHash: hashPin(pin), pinLookup: pinLookup(pin) };
}
