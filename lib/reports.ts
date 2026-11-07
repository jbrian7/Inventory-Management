import { totalQuantity } from "@/lib/balances";
import { csvDocument } from "@/lib/csv";
import { lifecycleOf } from "@/lib/lifecycle";
import { prisma } from "@/lib/prisma";
import { canExportReports } from "@/lib/roles";

const recentDays = 30;

export function reportAccessError(user: { role: string; active: boolean } | null) {
  if (!user || !user.active || !canExportReports(user.role)) {
    return "Only admins can export reports.";
  }
  return null;
}

export async function itemTotalsCsv(db: typeof prisma = prisma) {
  const items = await db.item.findMany({
    include: { category: true, balances: { select: { quantity: true } } },
    orderBy: { name: "asc" },
  });
  return csvDocument(
    ["sku", "name", "category", "total_quantity", "threshold", "manual_out_of_stock"],
    items.map((item) => [
      item.sku,
      item.name,
      item.category.name,
      totalQuantity(item.balances),
      item.threshold,
      item.isManualOos ? "yes" : "no",
    ])
  );
}

export async function locationBalancesCsv(db: typeof prisma = prisma) {
  const rows = await db.stockBalance.findMany({
    include: { item: true, location: true },
    orderBy: [{ location: { name: "asc" } }, { item: { name: "asc" } }],
  });
  return csvDocument(
    ["sku", "item_name", "location", "quantity"],
    rows.map((row) => [row.item.sku, row.item.name, row.location.name, row.quantity])
  );
}

export async function toteContentsCsv(db: typeof prisma = prisma) {
  const totes = await db.tote.findMany({
    include: {
      location: {
        include: {
          balances: { include: { item: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });
  const rows: unknown[][] = [];
  for (const tote of totes) {
    const stocked = tote.location.balances
      .filter((balance) => balance.quantity > 0)
      .sort((left, right) => left.item.name.localeCompare(right.item.name));
    if (stocked.length === 0) {
      rows.push([tote.name, tote.storageLabel ?? "", "", "", 0]);
      continue;
    }
    for (const balance of stocked) {
      rows.push([tote.name, tote.storageLabel ?? "", balance.item.sku, balance.item.name, balance.quantity]);
    }
  }
  return csvDocument(["tote_name", "storage_label", "sku", "item_name", "quantity"], rows);
}

export async function transferHistoryCsv(db: typeof prisma = prisma) {
  const rows = await db.history.findMany({
    where: { action: "TRANSFER" },
    include: { item: { select: { name: true, sku: true } } },
    orderBy: [{ timestamp: "desc" }, { id: "desc" }],
  });
  return csvDocument(
    [
      "timestamp_utc",
      "sku",
      "item_name",
      "amount",
      "from_location",
      "to_location",
      "source_before",
      "source_after",
      "destination_before",
      "destination_after",
      "reason",
    ],
    rows.map((row) => [
      row.timestamp.toISOString(),
      row.item.sku,
      row.item.name,
      row.amount,
      row.fromLocationName ?? "",
      row.toLocationName ?? "",
      row.sourceQuantityBefore ?? "",
      row.sourceQuantityAfter ?? "",
      row.destinationQuantityBefore ?? "",
      row.destinationQuantityAfter ?? "",
      row.reason ?? "",
    ])
  );
}

export async function receivedProductsCsv(now = new Date(), db: typeof prisma = prisma) {
  const since = new Date(now.getTime() - recentDays * 24 * 60 * 60 * 1000);
  const items = await db.item.findMany({
    where: { createdAt: { gte: since } },
    include: { category: true, balances: { select: { quantity: true } } },
    orderBy: { createdAt: "desc" },
  });
  return csvDocument(
    ["sku", "name", "category", "barcode", "total_quantity", "received_at", "status"],
    items.map((item) => {
      const quantity = totalQuantity(item.balances);
      return [item.sku, item.name, item.category.name, item.barcode ?? "", quantity, item.createdAt.toISOString(), lifecycleOf({ archivedAt: item.archivedAt, quantity })];
    })
  );
}

export async function lifecycleCsv(db: typeof prisma = prisma) {
  const items = await db.item.findMany({
    include: { balances: { select: { quantity: true } } },
    orderBy: { name: "asc" },
  });
  return csvDocument(
    ["sku", "name", "status", "total_quantity", "archived_at"],
    items.map((item) => {
      const quantity = totalQuantity(item.balances);
      const status = lifecycleOf({ archivedAt: item.archivedAt, quantity });
      return [item.sku, item.name, status, quantity, item.archivedAt?.toISOString() ?? ""];
    }).filter((row) => row[2] !== "ACTIVE")
  );
}

export async function recentMovementsCsv(now = new Date(), db: typeof prisma = prisma) {
  const since = new Date(now.getTime() - recentDays * 24 * 60 * 60 * 1000);
  const rows = await db.history.findMany({
    where: { timestamp: { gte: since } },
    include: { item: { select: { name: true, sku: true } } },
    orderBy: { timestamp: "desc" },
  });
  return csvDocument(
    ["timestamp_utc", "sku", "item_name", "action", "amount", "location", "from_location", "to_location", "reason"],
    rows.map((row) => [
      row.timestamp.toISOString(),
      row.item.sku,
      row.item.name,
      row.action,
      row.amount,
      row.locationName ?? "",
      row.fromLocationName ?? "",
      row.toLocationName ?? "",
      row.reason ?? "",
    ])
  );
}

export async function staleItemsCsv(now = new Date(), db: typeof prisma = prisma) {
  const since = new Date(now.getTime() - recentDays * 24 * 60 * 60 * 1000);
  const items = await db.item.findMany({
    where: { archivedAt: null },
    include: {
      balances: { select: { quantity: true } },
      History: { where: { timestamp: { gte: since } }, select: { id: true } },
    },
    orderBy: { name: "asc" },
  });
  return csvDocument(
    ["sku", "name", "total_quantity"],
    items
      .map((item) => ({ sku: item.sku, name: item.name, quantity: totalQuantity(item.balances), moved: item.History.length > 0 }))
      .filter((item) => item.quantity > 0 && !item.moved)
      .map((item) => [item.sku, item.name, item.quantity])
  );
}
