import { scanAccessError, type AccessUser } from "@/lib/access";
import { balancesFromRows, totalQuantity } from "@/lib/balances";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  loadStockItem,
  parseAmount,
  parseReason,
  parseRequestId,
  replayStockItem,
  type StockActor,
  type StockResult,
} from "@/lib/stock";

class TransferRejected extends Error {}

const attempts = 3;
const transactionOptions = { maxWait: 15000, timeout: 15000 };

function locked(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return (
    message.includes("database is locked") ||
    message.includes("SQLITE_BUSY") ||
    (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")
  );
}

function duplicateRequest(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function transferStock(
  itemId: string,
  fromLocationId: unknown,
  toLocationId: unknown,
  amount: unknown,
  user: (StockActor & AccessUser) | null,
  requestId?: unknown,
  reason?: unknown,
  db: typeof prisma = prisma
): Promise<StockResult> {
  const denied = scanAccessError(user);
  if (denied) {
    return { error: denied };
  }
  if (!user?.id) {
    return { error: "Sign in to scan." };
  }
  const change = parseAmount(amount);
  if (change === null) {
    return { error: "Enter a whole number of 1 or more." };
  }
  const fromId = typeof fromLocationId === "string" ? fromLocationId.trim() : "";
  const toId = typeof toLocationId === "string" ? toLocationId.trim() : "";
  if (!fromId || !toId) {
    return { error: "Choose the source and destination." };
  }
  if (fromId === toId) {
    return { error: "Choose two different locations." };
  }
  const submission = parseRequestId(requestId);
  if (!submission) {
    return { error: "Submit this transfer again." };
  }
  const note = parseReason(reason, false);
  if ("error" in note && note.error) {
    return { error: note.error };
  }
  const id = itemId.trim();
  if (!id) {
    return { error: "That item no longer exists." };
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await applyTransfer(db, {
        itemId: id,
        fromId,
        toId,
        amount: change,
        userId: user.id,
        requestId: submission,
        reason: note.reason ?? null,
      });
    } catch (error) {
      if (error instanceof TransferRejected) {
        return { error: error.message };
      }
      if (duplicateRequest(error)) {
        const prior = await replayStockItem(submission, db);
        if (prior) {
          return prior;
        }
      }
      if (locked(error) && attempt < attempts) {
        continue;
      }
      if (locked(error)) {
        return { error: "Stock changed on another device. Reload and try again." };
      }
      throw error;
    }
  }
  return { error: "Stock changed on another device. Reload and try again." };
}

async function applyTransfer(
  db: typeof prisma,
  input: {
    itemId: string;
    fromId: string;
    toId: string;
    amount: number;
    userId: string;
    requestId: string;
    reason: string | null;
  }
): Promise<StockResult> {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("UPDATE Item SET sku = sku WHERE id = ?", input.itemId);
    const prior = await replayStockItem(input.requestId, tx as unknown as typeof prisma);
    if (prior) {
      return prior;
    }

    const item = await tx.item.findUnique({ where: { id: input.itemId } });
    if (!item) {
      return { error: "That item no longer exists." };
    }
    const places = await tx.location.findMany({
      where: { id: { in: [input.fromId, input.toId] } },
    });
    const from = places.find((place) => place.id === input.fromId);
    const to = places.find((place) => place.id === input.toId);
    if (!from || !to) {
      return { error: "Choose a location that exists." };
    }
    if (from.id === to.id) {
      return { error: "Choose two different locations." };
    }

    const source = await tx.stockBalance.findUnique({
      where: { itemId_locationId: { itemId: item.id, locationId: from.id } },
    });
    if (!source || source.quantity < input.amount) {
      throw new TransferRejected(`Only ${source?.quantity ?? 0} in stock at ${from.name}.`);
    }

    const existingDest = await tx.stockBalance.findUnique({
      where: { itemId_locationId: { itemId: item.id, locationId: to.id } },
    });
    const destinationBefore = existingDest?.quantity ?? 0;
    if (destinationBefore + input.amount > 100000) {
      throw new TransferRejected("That amount is too large.");
    }
    if (!existingDest) {
      await tx.stockBalance.create({
        data: { itemId: item.id, locationId: to.id, quantity: 0 },
      });
    }

    const moved = await tx.stockBalance.updateMany({
      where: { itemId: item.id, locationId: from.id, quantity: { gte: input.amount } },
      data: { quantity: { decrement: input.amount } },
    });
    if (moved.count !== 1) {
      throw new TransferRejected(`Only ${source.quantity} in stock at ${from.name}.`);
    }
    const received = await tx.stockBalance.updateMany({
      where: { itemId: item.id, locationId: to.id },
      data: { quantity: { increment: input.amount } },
    });
    if (received.count !== 1) {
      throw new TransferRejected("The destination balance could not be updated.");
    }

    const balances = await tx.stockBalance.findMany({
      where: { itemId: item.id },
      include: { location: true },
    });
    const views = balancesFromRows(balances);
    const total = totalQuantity(views);
    const sourceAfter = source.quantity - input.amount;
    const destinationAfter = destinationBefore + input.amount;
    if (sourceAfter < 0 || destinationAfter < 0) {
      throw new Error("Refusing a negative balance.");
    }

    const actor = await tx.user.findUnique({ where: { id: input.userId }, select: { name: true } });
    await tx.history.create({
      data: {
        itemId: item.id,
        userId: input.userId,
        actorName: actor?.name.trim() || "Unknown",
        action: "TRANSFER",
        amount: input.amount,
        quantityBefore: total,
        quantityAfter: total,
        fromLocationName: from.name,
        toLocationName: to.name,
        sourceQuantityBefore: source.quantity,
        sourceQuantityAfter: sourceAfter,
        destinationQuantityBefore: destinationBefore,
        destinationQuantityAfter: destinationAfter,
        reason: input.reason,
        requestId: input.requestId,
      },
    });

    const stocked = await loadStockItem(tx as unknown as typeof prisma, item.id);
    if (!stocked) {
      return { error: "That item no longer exists." };
    }
    return { item: stocked };
  }, transactionOptions);
}
