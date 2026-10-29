import { totalQuantity } from "@/lib/balances";
import { csvDocument } from "@/lib/csv";
import { prisma } from "@/lib/prisma";
import { canExportReports } from "@/lib/roles";

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
