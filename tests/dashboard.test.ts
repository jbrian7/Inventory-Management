import "./env";

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  activityEmptyMessage,
  buildDashboard,
  dashboardUnavailableMessage,
  homeActions,
  isLowStock,
  loadDashboard,
  lowStockEmptyMessage,
  onHandUnits,
  presentMovement,
  prioritizeLowStock,
  type StockSnapshot,
} from "@/lib/dashboard";
import {
  canViewHistory,
  filtersActive,
  historyAccessError,
  historyEmptyMessage,
  historyPageSize,
  historyUnavailableMessage,
  historyWhere,
  loadHistory,
  pageWindow,
  parseHistoryQuery,
} from "@/lib/history-query";
import { businessDayRange, businessTodayRange } from "@/lib/business-time";
import { pinCredential } from "@/lib/pin";
import { prisma } from "@/lib/prisma";
import { navColumns, primaryNav } from "@/lib/nav";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const noonEastern = new Date("2026-10-23T16:00:00.000Z");

before(async () => {
  execFileSync("npx", ["prisma", "db", "push"], {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });
  const location = await prisma.location.create({ data: { name: "Counter" } });
  const category = await prisma.category.create({ data: { name: "Prizes" } });
  const haven = await prisma.user.create({
    data: { name: "Haven", role: "STAFF", ...pinCredential("3003") },
  });
  const item = await prisma.item.create({
    data: {
      name: "Bouncy balls",
      sku: "BB-1",
      threshold: 5,
      categoryId: category.id,
      qrCodeData: "ZAP-ITEM-dash",
      balances: { create: { locationId: location.id, quantity: 4 } },
    },
  });
  const filler = await prisma.item.create({
    data: {
      name: "Filler",
      sku: "FL-1",
      threshold: 1,
      isManualOos: true,
      categoryId: category.id,
      qrCodeData: "ZAP-ITEM-filler",
      balances: { create: { locationId: location.id, quantity: 9 } },
    },
  });
  await prisma.history.createMany({
    data: [
      {
        itemId: item.id,
        action: "REMOVE",
        amount: 1,
        quantityBefore: 5,
        quantityAfter: 4,
        userId: haven.id,
        reason: "party",
        timestamp: new Date("2026-10-23T04:00:00.000Z"),
      },
      {
        itemId: item.id,
        action: "ADD",
        amount: 1,
        quantityBefore: 4,
        quantityAfter: 5,
        userId: null,
        timestamp: new Date("2026-10-24T03:59:00.000Z"),
      },
      {
        itemId: item.id,
        action: "NEW_ITEM",
        amount: 4,
        userId: null,
        timestamp: new Date("2026-10-23T03:59:00.000Z"),
      },
      {
        itemId: item.id,
        action: "AUDIT",
        amount: 1,
        quantityBefore: 4,
        quantityAfter: 5,
        userId: haven.id,
        timestamp: new Date("2026-10-24T04:00:00.000Z"),
      },
      ...Array.from({ length: 21 }, (_, index) => ({
        itemId: filler.id,
        action: "ADD",
        amount: 1,
        quantityBefore: index,
        quantityAfter: index + 1,
        userId: haven.id,
        timestamp: new Date(Date.UTC(2025, 0, 1, 0, index)),
      })),
    ],
  });
});

after(async () => {
  await prisma.$disconnect();
  fs.rmSync(process.env.DATABASE_URL!.slice("file:".length), { force: true });
});

test("business days follow Eastern Time, including daylight saving changes", () => {
  const october = businessDayRange("2026-10-23");
  assert.equal(october.start.toISOString(), "2026-10-23T04:00:00.000Z");
  assert.equal(october.end.toISOString(), "2026-10-24T04:00:00.000Z");

  const winter = businessDayRange("2026-01-15");
  assert.equal(winter.start.toISOString(), "2026-01-15T05:00:00.000Z");

  const springForward = businessDayRange("2026-03-08");
  assert.equal(springForward.start.toISOString(), "2026-03-08T05:00:00.000Z");
  assert.equal(springForward.end.toISOString(), "2026-03-09T04:00:00.000Z");

  const fallBack = businessDayRange("2026-11-01");
  assert.equal(fallBack.start.toISOString(), "2026-11-01T04:00:00.000Z");
  assert.equal(fallBack.end.toISOString(), "2026-11-02T05:00:00.000Z");

  const today = businessTodayRange(noonEastern);
  assert.equal(today.start.toISOString(), october.start.toISOString());
});

test("on-hand totals keep recorded units and low stock skips manual out of stock", () => {
  const items: StockSnapshot[] = [
    { id: "a", name: "Plush", quantity: 0, threshold: 5, isManualOos: false, location: "Stockroom" },
    { id: "b", name: "Balls", quantity: 4, threshold: 5, isManualOos: false, location: "Counter" },
    { id: "c", name: "Tokens", quantity: 30, threshold: 5, isManualOos: false, location: "Stockroom" },
    { id: "d", name: "Squish", quantity: 2, threshold: 2, isManualOos: true, location: "Counter" },
  ];
  assert.equal(onHandUnits(items), 36);
  assert.equal(isLowStock(items[3]!), false);
  assert.deepEqual(
    prioritizeLowStock(items).map((item) => item.name),
    ["Plush", "Balls"]
  );
  const dashboard = buildDashboard(items, [], 0);
  assert.equal(dashboard.onHand, 36);
  assert.equal(dashboard.lowStockCount, 2);
  assert.equal(dashboard.todayCount, 0);
  assert.equal(lowStockEmptyMessage(0), "No items yet. Add inventory to start tracking.");
  assert.equal(lowStockEmptyMessage(3), "Nothing is at or below its threshold.");
  assert.equal(activityEmptyMessage(), "No stock movements yet.");
  assert.equal(buildDashboard([], [], 0).onHand, 0);
  assert.throws(() => onHandUnits([{ quantity: 1.5 }]), /unavailable/);
  assert.throws(() => buildDashboard(items, [], Number.NaN), /unavailable/);
});

test("a failed dashboard query does not become a zero summary", async () => {
  await assert.rejects(
    () =>
      loadDashboard(noonEastern, {
        item: {
          findMany: async () => {
            throw new Error("db down");
          },
        },
        history: {
          findMany: async () => [],
          count: async () => 0,
        },
      }),
    /db down/
  );
  assert.doesNotMatch(dashboardUnavailableMessage, /\b0\b/);
});

test("home actions and navigation follow role", () => {
  assert.equal(homeActions("STAFF").addItem, false);
  assert.equal(homeActions("STAFF").scan, true);
  assert.equal(homeActions("MANAGER").addItem, true);
  assert.equal(homeActions("ADMIN").addItem, true);
  assert.equal(homeActions(null).addItem, false);

  const staffNav = primaryNav(false);
  const managerNav = primaryNav(true);
  assert.deepEqual(
    staffNav.map((item) => item.label),
    ["Home", "Scan", "Items", "Totes", "History"]
  );
  assert.equal(
    managerNav.some((item) => item.href === "/settings"),
    true
  );
  assert.equal(navColumns(staffNav.length), "grid-cols-5");
  assert.equal(navColumns(managerNav.length), "grid-cols-6");

  assert.equal(canViewHistory("STAFF"), true);
  assert.equal(canViewHistory("MANAGER"), true);
  assert.equal(historyAccessError({ role: "STAFF", active: false }), "Sign in to view history.");
  assert.equal(historyAccessError(null), "Sign in to view history.");
  assert.equal(historyAccessError({ role: "STAFF", active: true }), null);
});

test("history filters, legacy rows, and pages stay consistent", async () => {
  const dashboard = await loadDashboard(noonEastern);
  assert.equal(dashboard.onHand, 13);
  assert.equal(dashboard.lowStockCount, 1);
  assert.equal(dashboard.lowStock[0]?.name, "Bouncy balls");
  assert.equal(dashboard.todayCount, 2);
  assert.equal(dashboard.recent[0]?.actor === "Haven" || dashboard.recent[0]?.actor === "Unknown", true);

  const legacy = presentMovement({
    id: "old",
    action: "REMOVE",
    amount: 2,
    quantityBefore: null,
    quantityAfter: null,
    reason: null,
    timestamp: new Date("2026-10-19T09:08:08.234Z"),
    actorName: null,
    user: null,
    item: { id: "item", name: "Bouncy balls" },
  });
  assert.equal(legacy.actor, "Unknown");
  assert.equal(
    presentMovement({
      id: "named",
      action: "REMOVE",
      amount: 1,
      quantityBefore: 2,
      quantityAfter: 1,
      reason: null,
      timestamp: new Date("2026-10-19T09:08:08.234Z"),
      actorName: "Casey",
      user: { name: "Casey Renamed" },
      item: { id: "item", name: "Bouncy balls" },
    }).actor,
    "Casey"
  );
  assert.equal(legacy.quantityLine, "Recorded before counts were tracked");

  const balls = await prisma.item.findFirstOrThrow({ where: { sku: "BB-1" } });
  const haven = await prisma.user.findFirstOrThrow({ where: { name: "Haven" } });
  const byItem = await loadHistory(parseHistoryQuery({ item: balls.id }));
  assert.equal(byItem.total, 4);
  assert.equal(byItem.rows.every((row) => row.itemName === "Bouncy balls"), true);

  const removed = await loadHistory(parseHistoryQuery({ action: "REMOVE" }));
  assert.equal(removed.total, 1);
  assert.equal(removed.rows[0]?.title, "Deducted 1");
  assert.equal(removed.rows[0]?.actor, "Haven");
  assert.equal(removed.rows[0]?.reason, "party");
  assert.equal(removed.rows[0]?.quantityLine, "5 → 4");

  const unknown = await loadHistory(parseHistoryQuery({ staff: "unknown" }));
  assert.equal(unknown.total, 2);
  assert.equal(unknown.rows.every((row) => row.actor === "Unknown"), true);

  const byStaff = await loadHistory(parseHistoryQuery({ staff: haven.id }));
  assert.equal(byStaff.rows.every((row) => row.actor === "Haven"), true);
  assert.equal(byStaff.total, 23);

  const oneDay = await loadHistory(parseHistoryQuery({ from: "2026-10-22", to: "2026-10-22" }));
  assert.equal(oneDay.total, 1);
  assert.equal(oneDay.rows[0]?.title, "Received 4");

  const paged = await loadHistory(parseHistoryQuery({ item: (await prisma.item.findFirstOrThrow({ where: { sku: "FL-1" } })).id, page: "2" }));
  assert.equal(paged.total, 21);
  assert.equal(paged.rows.length, 1);
  assert.equal(paged.window.start, 21);
  assert.equal(paged.window.end, 21);

  const empty = await loadHistory(parseHistoryQuery({ action: "AUDIT", staff: "unknown" }));
  assert.equal(empty.total, 0);
  assert.equal(empty.rows.length, 0);
  assert.equal(historyEmptyMessage(true), "No movements match these filters.");
  assert.match(historyEmptyMessage(false), /No stock movements yet/);

  const invalid = parseHistoryQuery({ action: "STEAL", from: "2026-10-23", to: "2026-10-01" });
  assert.equal(invalid.error, "That action is not recognized.");
  const backwards = parseHistoryQuery({ from: "2026-10-23", to: "2026-10-01" });
  assert.equal(backwards.error, "The start date is after the end date.");
  assert.equal(parseHistoryQuery({ from: "2026-02-31" }).error, "Enter a valid date.");
  assert.equal(filtersActive(backwards), true);

  const where = historyWhere(parseHistoryQuery({ from: "2026-10-23", to: "2026-10-23", staff: "unknown" }));
  assert.equal(where.userId, null);
  assert.equal(where.timestamp?.gte?.toISOString(), "2026-10-23T04:00:00.000Z");
  assert.equal(where.timestamp?.lt?.toISOString(), "2026-10-24T04:00:00.000Z");
  assert.equal(pageWindow(2, 21, historyPageSize).skip, 20);
  assert.doesNotMatch(historyUnavailableMessage, /\b0\b/);
});

test("a failed history query does not report an empty total", async () => {
  await assert.rejects(
    () =>
      loadHistory(parseHistoryQuery({}), {
        history: {
          count: async () => {
            throw new Error("db down");
          },
          findMany: async () => [],
        },
      }),
    /db down/
  );
});
