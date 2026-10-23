import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { adjustmentMessage } from "@/lib/scan-feedback";
import { primaryNav } from "@/lib/nav";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function source(relative: string) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

test("tablet layout keeps the phone column and widens from the md breakpoint", () => {
  const layout = source("app/layout.tsx");
  assert.match(layout, /max-w-md/);
  assert.match(layout, /tablet:max-w-3xl/);
  assert.match(source("tailwind.config.ts"), /min-height: 500px/);
  assert.match(layout, /lg:!max-w-6xl/);
  assert.match(layout, /safe-area-inset-bottom/);
  assert.match(layout, /safe-area-inset-top/);

  const nav = source("components/bottom-nav.tsx");
  assert.match(nav, /lg:hidden/);
  assert.match(nav, /function SideNav/);
  assert.match(nav, /primaryNav\(showSettings\)/);
  assert.match(nav, /min-h-16/);
  assert.match(nav, /min-h-12/);

  const staff = primaryNav(false).map((item) => item.label);
  const manager = primaryNav(true).map((item) => item.label);
  assert.deepEqual(staff, ["Home", "Scan", "Items", "History"]);
  assert.equal(manager.includes("Settings"), true);
  assert.equal(staff.includes("Settings"), false);
});

test("the dashboard and catalog use columns only from tablet width", () => {
  const dashboard = source("app/home-dashboard.tsx");
  assert.match(dashboard, /tablet:grid-cols-2/);
  assert.match(dashboard, /grid-cols-3/);
  assert.match(dashboard, /Short /);

  const catalog = source("app/items/item-catalog.tsx");
  assert.match(catalog, /tablet:!hidden/);
  assert.match(catalog, /hidden overflow-x-auto rounded-xl border tablet:!block/);
  assert.match(catalog, /<table/);
  assert.match(catalog, /OUT OF STOCK/);
  assert.match(catalog, /In stock/);
  assert.match(catalog, /item-search/);
  assert.match(catalog, /item-location/);
});

test("scan adjustments confirm the new count and ignore a second tap", () => {
  assert.equal(adjustmentMessage("ADD", 2, 6), "Added 2. On hand is now 6.");
  assert.equal(adjustmentMessage("REMOVE", 1, 3), "Deducted 1. On hand is now 3.");

  const scanner = source("app/scan/qr-scanner.tsx");
  assert.match(scanner, /submitLock/);
  assert.match(scanner, /Scan another/);
  assert.match(scanner, /Looking up label/);
  assert.match(scanner, /Saving…/);
  assert.match(scanner, /h-16/);
  assert.match(scanner, /tablet:grid-cols-\[minmax\(0,1\.15fr\)_minmax\(18rem,0\.85fr\)\]/);
  assert.match(scanner, /min-height: 500px/);
});
