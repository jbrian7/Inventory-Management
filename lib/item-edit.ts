import { inventoryAccessError, type AccessUser } from "@/lib/access";
import { Prisma } from "@/lib/generated/prisma/client";
import { openingMovement } from "@/lib/stock";
import { prisma } from "@/lib/prisma";

export type CatalogInput = {
  name: string;
  sku: string;
  description: string | null;
  threshold: number;
  locationId: string;
  categoryId: string;
  receivedAt: Date;
  outOfStockAt: Date | null;
  isManualOos: boolean;
};

export function catalogData(input: CatalogInput) {
  return {
    name: input.name,
    sku: input.sku,
    description: input.description,
    threshold: input.threshold,
    locationId: input.locationId,
    categoryId: input.categoryId,
    receivedAt: input.receivedAt,
    outOfStockAt: input.outOfStockAt,
    isManualOos: input.isManualOos,
  };
}

function duplicateTarget(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return "";
  }
  const target = error.meta?.target;
  return Array.isArray(target) ? target.join(",") : String(target ?? "");
}

export async function createStockedItem(
  user: { id: string },
  input: CatalogInput & { id: string; qrCodeData: string; quantity: number; requestId: string }
) {
  try {
    const item = await prisma.$transaction(async (tx) => {
      const prior = await tx.history.findUnique({
        where: { requestId: input.requestId },
        include: { item: true },
      });
      if (prior?.item) {
        return prior.item;
      }
      const actor = await tx.user.findUnique({ where: { id: user.id }, select: { name: true } });
      const history = openingMovement(user.id, actor?.name ?? "", input.quantity, input.requestId);
      return tx.item.create({
        data: {
          id: input.id,
          ...catalogData(input),
          quantity: input.quantity,
          qrCodeData: input.qrCodeData,
          History: { create: history },
        },
      });
    });
    return { name: item.name, qrCodeData: item.qrCodeData };
  } catch (error) {
    const target = duplicateTarget(error);
    if (target.includes("requestId")) {
      const prior = await prisma.history.findUnique({
        where: { requestId: input.requestId },
        include: { item: true },
      });
      if (prior?.item) {
        return { name: prior.item.name, qrCodeData: prior.item.qrCodeData };
      }
    }
    if (target.includes("sku") || target.includes("qrCodeData")) {
      return { error: "That SKU is already in use." };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "That SKU is already in use." };
    }
    throw error;
  }
}

export async function saveItemDetails(
  user: (AccessUser & { id?: string }) | null,
  id: string,
  input: CatalogInput
) {
  const denied = inventoryAccessError(user, "edit");
  if (denied) {
    return { error: denied };
  }
  const current = await prisma.item.findUnique({ where: { id } });
  if (!current) {
    return { error: "That item no longer exists." };
  }
  try {
    const item = await prisma.item.update({
      where: { id },
      data: catalogData(input),
    });
    return { saved: true as const, name: item.name, quantity: item.quantity };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "That SKU is already in use." };
    }
    throw error;
  }
}
