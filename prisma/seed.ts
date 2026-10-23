import "dotenv/config";

import { pinCredential } from "../lib/pin";
import { prisma } from "../lib/prisma";

const users = [
  { name: "Josh Brian", pin: "1001", role: "ADMIN" },
  { name: "Jenny", pin: "2002", role: "MANAGER" },
  { name: "Haven", pin: "3003", role: "STAFF" },
  { name: "Tanner", pin: "4004", role: "STAFF" },
];

const categories = ["Stuffed Animals", "Squishies"];
const locations = ["Stockroom", "Redemption Counter"];

// Rows that existed before location became a relation. The push drops them
// because the old location string cannot become a required foreign key.
const existingItems = [
  {
    id: "cmvezlzbx00007hjs7yhf5ogm",
    name: "Bouncy balls",
    sku: "BB-001",
    description: "Party favor",
    quantity: 4,
    threshold: 5,
    locationName: "Redemption Counter",
    qrCodeData: "ZAP-ITEM-cmvezlzbx00007hjs7yhf5ogm",
    createdAt: new Date("2026-10-19T08:23:21.139Z"),
  },
  {
    id: "cmvezqvor00007hjs4io1ecfa",
    name: "Arcade tokens",
    sku: "AT-010",
    description: "Metal tokens",
    quantity: 30,
    threshold: 5,
    locationName: "Stockroom",
    qrCodeData: "ZAP-ITEM-cmvezqvor00007hjs4io1ecfa",
    createdAt: new Date("2026-10-19T08:27:09.677Z"),
  },
];

const existingHistory = [
  {
    id: "cmvezlzcq00007hjswb9naoag",
    itemId: "cmvezlzbx00007hjs7yhf5ogm",
    action: "NEW_ITEM",
    amount: 4,
    timestamp: new Date("2026-10-19T08:23:21.139Z"),
  },
  {
    id: "cmvezqvou00017hjsxjzpsm97",
    itemId: "cmvezqvor00007hjs4io1ecfa",
    action: "NEW_ITEM",
    amount: 30,
    timestamp: new Date("2026-10-19T08:27:09.677Z"),
  },
  {
    id: "cmvf176v80000xwjs0e8l9n0p",
    itemId: "cmvezlzbx00007hjs7yhf5ogm",
    action: "ADD",
    amount: 2,
    timestamp: new Date("2026-10-19T09:07:50.275Z"),
  },
  {
    id: "cmvf17kq20001xwjswjy0z1uj",
    itemId: "cmvezlzbx00007hjs7yhf5ogm",
    action: "REMOVE",
    amount: 2,
    timestamp: new Date("2026-10-19T09:08:08.234Z"),
  },
];

async function main() {
  for (const user of users) {
    const credential = pinCredential(user.pin);
    await prisma.user.upsert({
      where: { pinLookup: credential.pinLookup },
      update: { name: user.name, role: user.role, canScan: true, active: true },
      create: {
        name: user.name,
        role: user.role,
        canScan: true,
        active: true,
        ...credential,
      },
    });
  }

  for (const name of categories) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  for (const name of locations) {
    await prisma.location.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  const defaultCategory = await prisma.category.findUniqueOrThrow({
    where: { name: "Stuffed Animals" },
  });

  for (const item of existingItems) {
    const location = await prisma.location.findUniqueOrThrow({
      where: { name: item.locationName },
    });
    await prisma.item.upsert({
      where: { id: item.id },
      update: {},
      create: {
        id: item.id,
        name: item.name,
        sku: item.sku,
        description: item.description,
        quantity: item.quantity,
        threshold: item.threshold,
        qrCodeData: item.qrCodeData,
        createdAt: item.createdAt,
        receivedAt: item.createdAt,
        locationId: location.id,
        categoryId: defaultCategory.id,
      },
    });
  }

  for (const entry of existingHistory) {
    await prisma.history.upsert({
      where: { id: entry.id },
      update: {},
      create: entry,
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
