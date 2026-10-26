/**
 * Create the first production admin without the development seed.
 *
 * Does not change an existing account, and does not read or write inventory.
 *
 *   ZAP_ADMIN_NAME="Alex" ZAP_ADMIN_PIN="4821" npx tsx scripts/create-admin.ts
 *
 * Requires DATABASE_URL, PIN_PEPPER, ZAP_ADMIN_NAME, and a 4-digit ZAP_ADMIN_PIN
 * that is not one of the development PINs.
 */
import "dotenv/config";

import { pinCredential } from "../lib/pin";
import { prisma } from "../lib/prisma";

const demoPins = new Set(["1001", "2002", "3003", "4004"]);

async function main() {
  const name = process.env.ZAP_ADMIN_NAME?.trim() ?? "";
  const pin = process.env.ZAP_ADMIN_PIN?.trim() ?? "";
  if (!name) {
    throw new Error("Set ZAP_ADMIN_NAME.");
  }
  if (!/^\d{4}$/.test(pin) || demoPins.has(pin)) {
    throw new Error("Set ZAP_ADMIN_PIN to a 4-digit PIN that is not a development account.");
  }
  const credential = pinCredential(pin);
  const existing = await prisma.user.findUnique({ where: { pinLookup: credential.pinLookup } });
  if (existing) {
    throw new Error("That PIN is already in use. Existing accounts were not changed.");
  }
  await prisma.user.create({
    data: {
      name,
      role: "ADMIN",
      canScan: true,
      active: true,
      ...credential,
    },
  });
  console.info("Admin account created. Inventory was not changed.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  });
