import { prisma } from "@/lib/prisma";

export function locationDeleteError(quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 0) {
    return "That location could not be checked.";
  }
  if (quantity > 0) {
    return "Transfer the stock out of this location before deleting it.";
  }
  return null;
}

export async function deleteLocationIfEmpty(
  id: string,
  db: typeof prisma = prisma
): Promise<{ error: string } | { deleted: true }> {
  const owned = await db.tote.findUnique({ where: { locationId: id }, select: { id: true } });
  if (owned) {
    return { error: "This location belongs to a tote. Transfer its stock out, then delete the tote." };
  }
  const held = await db.stockBalance.aggregate({
    where: { locationId: id },
    _sum: { quantity: true },
  });
  const blocked = locationDeleteError(held._sum.quantity ?? 0);
  if (blocked) {
    return { error: blocked };
  }
  await db.$transaction([
    db.stockBalance.deleteMany({ where: { locationId: id, quantity: 0 } }),
    db.location.delete({ where: { id } }),
  ]);
  return { deleted: true as const };
}
