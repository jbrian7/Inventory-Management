import { prisma } from "@/lib/prisma";

export type StockItem = {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  threshold: number;
  location: string;
  qrCodeData: string;
};

export type StockResult = { item: StockItem } | { error: string };

export type StockDirection = "ADD" | "REMOVE";

const itemWithLocation = { location: true } as const;

function toStockItem(item: {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  threshold: number;
  location: { name: string };
  qrCodeData: string;
}): StockItem {
  return {
    id: item.id,
    name: item.name,
    sku: item.sku,
    quantity: item.quantity,
    threshold: item.threshold,
    location: item.location.name,
    qrCodeData: item.qrCodeData,
  };
}

export async function findItemByQr(qrCodeData: string): Promise<StockResult> {
  const code = qrCodeData.trim();
  if (!code) {
    return { error: "That QR code was empty." };
  }

  const item = await prisma.item.findUnique({
    where: { qrCodeData: code },
    include: itemWithLocation,
  });
  if (!item) {
    return { error: "No item matches this QR code." };
  }

  return { item: toStockItem(item) };
}

export async function adjustStock(
  qrCodeData: string,
  direction: StockDirection,
  amount: number
): Promise<StockResult> {
  const code = qrCodeData.trim();
  if (!Number.isInteger(amount) || amount < 1) {
    return { error: "Enter a whole number of 1 or more." };
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.item.findUnique({
        where: { qrCodeData: code },
        include: itemWithLocation,
      });
      if (!current) {
        return null;
      }

      const quantity =
        direction === "ADD" ? current.quantity + amount : current.quantity - amount;
      if (quantity < 0) {
        throw new Error(`ONLY_${current.quantity}`);
      }

      return tx.item.update({
        where: { id: current.id },
        data: {
          quantity,
          History: {
            create: {
              action: direction,
              amount,
            },
          },
        },
        include: itemWithLocation,
      });
    });

    if (!updated) {
      return { error: "No item matches this QR code." };
    }

    return { item: toStockItem(updated) };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("ONLY_")) {
      const available = error.message.slice("ONLY_".length);
      return { error: `Only ${available} in stock.` };
    }
    throw error;
  }
}
