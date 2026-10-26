import "dotenv/config";

import { assertDevelopmentSeed, seedDevelopmentData } from "../lib/dev-seed";
import { prisma } from "../lib/prisma";

async function main() {
  assertDevelopmentSeed();
  const users = await seedDevelopmentData();
  console.info(`Development seed finished. New demo accounts created: ${users.created}. Existing accounts and inventory were left unchanged.`);
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
