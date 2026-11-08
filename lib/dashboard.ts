import { locationSummary, totalQuantity } from "@/lib/balances";
import { businessTodayRange } from "@/lib/business-time";
import {
  formatMovementTime,
  movementActorLabel,
  movementQuantityLine,
  movementTitle,
} from "@/lib/movement";
import { dashboardUnavailableMessage } from "@/lib/page-messages";
import { prisma } from "@/lib/prisma";
import { canEditInventory } from "@/lib/roles";

export { dashboardUnavailableMessage };

export const recentActivityLimit = 5;
export const lowStockPreviewLimit = 8;

export type StockSnapshot = {
  id: string;
  name: string;
  quantity: number;
  threshold: number;
  isManualOos: boolean;
  location: string;
};

export type MovementSnapshot = {
  id: string;
  action: string;
  amount: number;
  quantityBefore: number | null;
  quantityAfter: number | null;
  locationName?: string | null;
  fromLocationName?: string | null;
  toLocationName?: string | null;
  sourceQuantityBefore?: number | null;
  sourceQuantityAfter?: number | null;
  destinationQuantityBefore?: number | null;
  destinationQuantityAfter?: number | null;
  reason: string | null;
  timestamp: Date;
  actorName?: string | null;
  user: { name: string } | null;
  item: { id: string; name: string } | null;
};

export type PresentedMovement = {
  id: string;
  itemId: string;
  itemName: string;
  action: string;
  amount: number;
  title: string;
  actor: string;
  sentence: string | null;
  quantityLine: string;
  reason: string | null;
  time: string;
};

export function onHandUnits(items: { quantity: number }[]) {
  return items.reduce((sum, item) => {
    if (!Number.isInteger(item.quantity)) {
      throw new Error("A stock quantity is unavailable.");
    }
    return sum + item.quantity;
  }, 0);
}

export function isLowStock(item: { quantity: number; threshold: number; isManualOos: boolean }) {
  return !item.isManualOos && item.quantity <= item.threshold;
}

export function prioritizeLowStock<T extends StockSnapshot>(items: T[]) {
  return items.filter(isLowStock).sort((left, right) => {
    const shortage = right.threshold - right.quantity - (left.threshold - left.quantity);
    if (shortage !== 0) {
      return shortage;
    }
    if (left.quantity !== right.quantity) {
      return left.quantity - right.quantity;
    }
    return left.name.localeCompare(right.name);
  });
}

export function lowStockEmptyMessage(itemCount: number) {
  if (itemCount === 0) {
    return "No items yet. Add inventory to start tracking.";
  }
  return "Nothing is at or below its threshold.";
}

export function activityEmptyMessage() {
  return "No stock movements yet.";
}

export function homeActions(role: string | null | undefined) {
  return {
    scan: true,
    addItem: Boolean(role && canEditInventory(role)),
  };
}

export function presentMovement(entry: MovementSnapshot): PresentedMovement {
  const itemName = entry.item?.name.trim() || "Unknown item";
  const actor = movementActorLabel(entry);
  return {
    id: entry.id,
    itemId: entry.item?.id ?? "",
    itemName,
    action: entry.action,
    amount: entry.amount,
    title: movementTitle(entry),
    actor,
    sentence: entry.action === "TRANSFER" ? `${actor} transferred ${entry.amount} ${itemName}` : null,
    quantityLine: movementQuantityLine(entry),
    reason: entry.reason?.trim() || null,
    time: formatMovementTime(entry.timestamp),
  };
}

export function buildDashboard(
  items: StockSnapshot[],
  recent: PresentedMovement[],
  todayCount: number
) {
  if (!Number.isInteger(todayCount) || todayCount < 0) {
    throw new Error("Today's movement count is unavailable.");
  }
  const lowStock = prioritizeLowStock(items);
  return {
    onHand: onHandUnits(items),
    lowStockCount: lowStock.length,
    todayCount,
    lowStock: lowStock.slice(0, lowStockPreviewLimit),
    lowStockHidden: Math.max(0, lowStock.length - lowStockPreviewLimit),
    recent,
    itemCount: items.length,
  };
}

type DashboardDb = {
  item: {
    findMany: (args: unknown) => Promise<
      {
        id: string;
        name: string;
        threshold: number;
        isManualOos: boolean;
        balances: { quantity: number; location: { name: string } }[];
      }[]
    >;
  };
  history: {
    findMany: (args: unknown) => Promise<MovementSnapshot[]>;
    count: (args: unknown) => Promise<number>;
  };
};

export async function loadDashboard(now = new Date(), db: DashboardDb = prisma as unknown as DashboardDb) {
  const { start, end } = businessTodayRange(now);
  const [items, recent, todayCount] = await Promise.all([
    db.item.findMany({
      select: {
        id: true,
        name: true,
        threshold: true,
        isManualOos: true,
        balances: { select: { quantity: true, location: { select: { name: true } } } },
      },
    }),
    db.history.findMany({
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
      take: recentActivityLimit,
      include: {
        user: { select: { name: true } },
        item: { select: { id: true, name: true } },
      },
    }),
    db.history.count({
      where: { timestamp: { gte: start, lt: end } },
    }),
  ]);
  return buildDashboard(
    items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: totalQuantity(item.balances),
      threshold: item.threshold,
      isManualOos: item.isManualOos,
      location: locationSummary(item.balances.map((balance) => ({ name: balance.location.name }))),
    })),
    recent.map(presentMovement),
    todayCount
  );
}
