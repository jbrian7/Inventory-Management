import "./env";

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  businessName,
  businessNameFallback,
  documentTitle,
  itemQrPayload,
  productName,
  qrItemPrefix,
} from "@/lib/brand";
import { prepareTestPrint } from "@/lib/print-job";
import { prisma } from "@/lib/prisma";
import { sessionCookieName } from "@/lib/session";
import { findItemByQr } from "@/lib/stock";
import { testDatabasePath } from "./env";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const legacyQr = "ZAP-ITEM-cmvezlzbx00007hjs7yhf5ogm";
const staff = { role: "STAFF", active: true, canScan: true };

before(async () => {
  execFileSync("npx", ["prisma", "db", "push"], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  const location = await prisma.location.create({ data: { name: "Stockroom" } });
  const category = await prisma.category.create({ data: { name: "Prizes" } });
  await prisma.item.create({
    data: {
      name: "Bouncy balls",
      sku: "BB-1",
      quantity: 4,
      qrCodeData: legacyQr,
      locationId: location.id,
      categoryId: category.id,
    },
  });
});

after(async () => {
  await prisma.$disconnect();
  fs.rmSync(testDatabasePath, { force: true });
});

test("the business name is configured per deployment and falls back when unset", () => {
  assert.equal(productName, "Inventory Manager");
  assert.equal(businessNameFallback, "Your business");
  assert.equal(businessName({ BUSINESS_NAME: "Zap Zone" }), "Zap Zone");
  assert.equal(documentTitle({ BUSINESS_NAME: "Zap Zone" }), "Inventory Manager · Zap Zone");
  assert.equal(businessName({}), businessNameFallback);
  assert.equal(businessName({ BUSINESS_NAME: "   " }), businessNameFallback);
  assert.equal(businessName({ BUSINESS_NAME: "\n  \t" }), businessNameFallback);
  assert.equal(documentTitle({}), "Inventory Manager · Your business");
  assert.equal(businessName({ BUSINESS_NAME: "  North\nCounter  " }), "North Counter");
});

test("labels still use ZAP-ITEM and a stored payload is found unchanged", async () => {
  assert.equal(qrItemPrefix, "ZAP-ITEM");
  assert.equal(itemQrPayload("cmvezlzbx00007hjs7yhf5ogm"), legacyQr);
  assert.match(fs.readFileSync(path.join(root, "app/items/actions.ts"), "utf8"), /itemQrPayload\(id\)/);
  assert.equal(sessionCookieName, "zap_session");

  const found = await findItemByQr(legacyQr, staff);
  assert.equal("item" in found && found.item.qrCodeData, legacyQr);
  assert.equal("item" in found && found.item.quantity, 4);

  const renamed = await findItemByQr(legacyQr.replace(qrItemPrefix, "ITEM"), staff);
  assert.equal("error" in renamed && renamed.error, "No item matches this QR code.");
});

test("a test label uses the configured business name and the same QR sample", async () => {
  const manager = { role: "MANAGER" as const, active: true };
  const previous = process.env.BUSINESS_NAME;
  try {
    delete process.env.BUSINESS_NAME;
    let sent: { name: string; sku: string; qrData: string } | undefined;
    await prepareTestPrint(manager, async (label) => {
      sent = label;
      return { status: "preview", printed: false };
    });
    assert.deepEqual(sent, { name: "Your business test", sku: "TEST", qrData: "ZAP-TEST" });

    process.env.BUSINESS_NAME = "Zap Zone";
    await prepareTestPrint(manager, async (label) => {
      sent = label;
      return { status: "preview", printed: false };
    });
    assert.deepEqual(sent, { name: "Zap Zone test", sku: "TEST", qrData: "ZAP-TEST" });
  } finally {
    if (previous === undefined) {
      delete process.env.BUSINESS_NAME;
    } else {
      process.env.BUSINESS_NAME = previous;
    }
  }
});
