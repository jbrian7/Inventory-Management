"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/current-user";
import { archiveItems, restoreItems } from "@/lib/intake";
import { totalQuantity } from "@/lib/balances";
import { prisma } from "@/lib/prisma";
import { usingSheets } from "@/lib/storage/backend";

export async function archiveItemAction(id: string) {
  const user = await getCurrentUser();
  const result = await archiveItems(user, [id]);
  if ("error" in result) {
    return result;
  }
  revalidatePath("/items");
  revalidatePath("/");
  return result;
}

export async function restoreItemAction(id: string) {
  const user = await getCurrentUser();
  const result = await restoreItems(user, [id]);
  if ("error" in result) {
    return result;
  }
  revalidatePath("/items");
  revalidatePath("/");
  return result;
}

export async function archiveDepletedAction(): Promise<void> {
  const user = await getCurrentUser();
  const items = usingSheets()
    ? (await (await import("@/lib/storage/sheets-stock")).readSheetCatalog())
        .filter((item) => !item.archivedAt)
        .map((item) => ({ id: item.id, balances: item.balances }))
    : await prisma.item.findMany({
        where: { archivedAt: null },
        include: { balances: { select: { quantity: true } } },
      });
  const ids = items.filter((item) => totalQuantity(item.balances) === 0).map((item) => item.id);
  if (ids.length === 0) {
    return;
  }
  const result = await archiveItems(user, ids);
  if (!("error" in result)) {
    revalidatePath("/items");
    revalidatePath("/");
  }
}
