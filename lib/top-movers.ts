import { prisma } from "@/lib/prisma";

const windowMs = 30 * 24 * 60 * 60 * 1000;

export type TopMover = {
  id: string;
  name: string;
  sku: string;
  removed: number;
};

export async function topMovers(now = new Date(), limit = 5): Promise<TopMover[]> {
  const since = new Date(now.getTime() - windowMs);
  const grouped = await prisma.history.groupBy({
    by: ["itemId"],
    where: {
      action: "REMOVE",
      timestamp: { gte: since },
    },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
    take: limit,
  });

  if (grouped.length === 0) {
    return [];
  }

  const items = await prisma.item.findMany({
    where: { id: { in: grouped.map((row) => row.itemId) } },
    select: { id: true, name: true, sku: true },
  });
  const byId = new Map(items.map((item) => [item.id, item]));

  return grouped.flatMap((row) => {
    const item = byId.get(row.itemId);
    if (!item) {
      return [];
    }
    return [{ id: item.id, name: item.name, sku: item.sku, removed: row._sum.amount ?? 0 }];
  });
}
