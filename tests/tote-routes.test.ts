import "./env";

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { NextRequest } from "next/server";

import { GET } from "@/app/t/[token]/route";
import { middleware } from "@/middleware";
import { pinCredential } from "@/lib/pin";
import { prisma } from "@/lib/prisma";
import { stampPeer } from "@/lib/public-client";
import { publicScanLimit } from "@/lib/public-scan-limit";
import { renderPublicMissing } from "@/lib/public-tote-page";
import { createTote, setTotePublicEnabled } from "@/lib/tote";
import { testDatabasePath } from "./env";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const manager = { id: "manager", role: "MANAGER", active: true, canScan: true };
const secret = process.env.AUTH_SECRET ?? "";

function peerHeaders(address: string) {
  const stamp = stampPeer(address, secret);
  return new Headers(stamp ? { "x-inventory-peer": stamp } : {});
}

before(async () => {
  execFileSync("npx", ["prisma", "db", "push"], {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });
  await prisma.user.create({
    data: { name: "Jenny", role: "MANAGER", ...pinCredential("2002") },
  });
  const stockroom = await prisma.location.create({ data: { name: "Stockroom" } });
  const category = await prisma.category.create({ data: { name: "Prizes" } });
  const item = await prisma.item.create({
    data: {
      name: "Bouncy balls",
      sku: "BB-001",
      qrCodeData: "ZAP-ITEM-route",
      categoryId: category.id,
      balances: { create: { locationId: stockroom.id, quantity: 4 } },
    },
  });
  const tote = await createTote(manager, { name: "Bin 12", storageLabel: "Aisle 2" });
  if (!("tote" in tote)) {
    throw new Error("tote was not created");
  }
  await prisma.stockBalance.create({
    data: { itemId: item.id, locationId: tote.tote.locationId, quantity: 2 },
  });
  process.env.TOTE_ROUTE_TOKEN = tote.tote.publicToken;
  process.env.TOTE_ROUTE_ID = tote.tote.id;
});

after(async () => {
  await prisma.$disconnect();
  fs.rmSync(testDatabasePath, { force: true });
});

test("anonymous tote routes show live contents and hide disabled links", async () => {
  const token = process.env.TOTE_ROUTE_TOKEN ?? "";
  const open = await GET(new Request(`http://127.0.0.1/t/${token}`, { headers: peerHeaders("203.0.113.40") }), {
    params: { token },
  });
  assert.equal(open.status, 200);
  assert.equal(open.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(open.headers.get("cache-control"), "no-store");
  const html = await open.text();
  assert.match(html, /Bin 12/);
  assert.match(html, /Aisle 2/);
  assert.match(html, /Bouncy balls/);
  assert.equal(html.includes("Sign out"), false);
  assert.equal(html.includes("Secret"), false);
  assert.equal(html.includes(token), false);

  const missing = await GET(new Request("http://127.0.0.1/t/missing-token-value-not-real-aaaaaa", { headers: peerHeaders("203.0.113.41") }), {
    params: { token: "missing-token-value-not-real-aaaaaa" },
  });
  assert.equal(missing.status, 404);
  const missingHtml = await missing.text();
  assert.equal(missingHtml, renderPublicMissing());

  await setTotePublicEnabled(manager, process.env.TOTE_ROUTE_ID ?? "", false);
  const disabled = await GET(new Request(`http://127.0.0.1/t/${token}`, { headers: peerHeaders("203.0.113.42") }), {
    params: { token },
  });
  assert.equal(disabled.status, 404);
  const disabledHtml = await disabled.text();
  assert.equal(disabledHtml, missingHtml);
  assert.equal(disabledHtml.includes("Bouncy balls"), false);
});

test("different phones do not share the public scan limit, and spoofed forwarding does not reset it", async () => {
  const token = process.env.TOTE_ROUTE_TOKEN ?? "";
  await setTotePublicEnabled(manager, process.env.TOTE_ROUTE_ID ?? "", true);
  const phone = "203.0.113.50";
  for (let hit = 0; hit < publicScanLimit; hit += 1) {
    const response = await GET(new Request(`http://127.0.0.1/t/${token}`, { headers: peerHeaders(phone) }), {
      params: { token },
    });
    assert.equal(response.status, 200);
  }
  const blocked = await GET(
    new Request(`http://127.0.0.1/t/${token}`, {
      headers: new Headers({
        ...Object.fromEntries(peerHeaders(phone).entries()),
        "x-forwarded-for": "198.51.100.77",
      }),
    }),
    { params: { token } }
  );
  assert.equal(blocked.status, 429);
  assert.match(await blocked.text(), /Too many requests/);

  const other = await GET(new Request(`http://127.0.0.1/t/${token}`, { headers: peerHeaders("203.0.113.60") }), {
    params: { token },
  });
  assert.equal(other.status, 200);
  assert.match(await other.text(), /Bouncy balls/);
});

test("middleware keeps inventory pages private and publishes only the tote link", async () => {
  for (const pathName of ["/items", "/totes", "/scan", "/history", "/settings", "/reports"]) {
    const response = await middleware(new NextRequest(new URL(`http://127.0.0.1:3000${pathName}`)));
    assert.equal(response.status, 307, pathName);
    assert.match(response.headers.get("location") ?? "", /\/login$/);
  }

  const token = process.env.TOTE_ROUTE_TOKEN ?? "abc";
  const published = await middleware(new NextRequest(new URL(`http://127.0.0.1:3000/t/${token}`)));
  assert.notEqual(published.status, 307);
  assert.equal(published.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(published.headers.get("cache-control"), "no-store");

  const login = await middleware(new NextRequest(new URL("http://127.0.0.1:3000/login")));
  assert.notEqual(login.status, 307);
});
