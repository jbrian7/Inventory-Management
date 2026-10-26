import { inventoryAccessError, scanAccessError, type AccessUser } from "@/lib/access";
import { balancesFromRows, locationSummary, totalQuantity, type BalanceView } from "@/lib/balances";
import { Prisma } from "@/lib/generated/prisma/client";
import { isStockAction } from "@/lib/movement";
import { prisma } from "@/lib/prisma";

export type StockItem = {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  threshold: number;
  location: string;
  locations: BalanceView[];
  directory: { id: string; name: string }[];
  qrCodeData: string;
};

export type StockResult = { item: StockItem } | { error: string };

export type StockDirection = "ADD" | "REMOVE";

export type StockActor = AccessUser & { id?: string };

const maxAmount = 100000;
const attempts = 3;
const transactionOptions = { maxWait: 15000, timeout: 15000 };

const balanceInclude = {
  balances: { include: { location: true } },
} as const;

type ItemWithBalances = {
  id: string;
  name: string;
  sku: string;
  threshold: number;
  qrCodeData: string;
  balances: { locationId: string; quantity: number; location: { name: string } }[];
};

export function toStockItem(item: ItemWithBalances, directory: { id: string; name: string }[]): StockItem {
  const locations = balancesFromRows(item.balances);
  return {
    id: item.id,
    name: item.name,
    sku: item.sku,
    quantity: totalQuantity(locations),
    threshold: item.threshold,
    location: locationSummary(locations),
    locations,
    directory,
    qrCodeData: item.qrCodeData,
  };
}

export function parseDirection(value: unknown): StockDirection | null {
  return value === "ADD" || value === "REMOVE" ? value : null;
}

export function parseAmount(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(amount) || amount < 1 || amount > maxAmount) {
    return null;
  }
  return amount;
}

export function parseQuantity(value: unknown) {
  const quantity = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > maxAmount) {
    return null;
  }
  return quantity;
}

export function parseRequestId(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const requestId = value.trim();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(requestId)) {
    return null;
  }
  return requestId;
}

export function parseReason(value: unknown, required: boolean) {
  const reason = typeof value === "string" ? value.trim() : "";
  if (required && reason.length === 0) {
    return { error: "A reason is required." };
  }
  if (reason.length > 200) {
    return { error: "Reason must be 200 characters or less." };
  }
  return { reason: reason || null };
}

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

async function directoryOf(db: Pick<typeof prisma, "location">) {
  const places = await db.location.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  return places;
}

export async function loadStockItem(db: Pick<typeof prisma, "item" | "location">, itemId: string) {
  const item = await db.item.findUnique({ where: { id: itemId }, include: balanceInclude });
  if (!item) {
    return null;
  }
  return toStockItem(item, await directoryOf(db));
}

export async function replayStockItem(
  requestId: string,
  db: Pick<typeof prisma, "history" | "item" | "location">
): Promise<StockResult | null> {
  const prior = await db.history.findUnique({ where: { requestId } });
  if (!prior) {
    return null;
  }
  const item = await loadStockItem(db, prior.itemId);
  return item ? { item } : null;
}

export function openingMovement(
  userId: string,
  actorName: string,
  quantity: number,
  requestId: string,
  locationName: string
) {
  if (!parseRequestId(requestId) || parseQuantity(quantity) === null) {
    throw new Error("Invalid opening stock.");
  }
  return {
    action: "NEW_ITEM",
    amount: quantity,
    quantityBefore: 0,
    quantityAfter: quantity,
    locationName,
    userId,
    actorName: actorName.trim() || "Unknown",
    requestId,
    reason: null,
  };
}

async function actorSnapshot(db: { user: { findUnique: typeof prisma.user.findUnique } }, userId: string) {
  const actor = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  return actor?.name.trim() || "Unknown";
}

export async function findItemByQr(qrCodeData: string, user: AccessUser | null): Promise<StockResult> {
  const denied = scanAccessError(user);
  if (denied) {
    return { error: denied };
  }
  const code = qrCodeData.trim();
  if (!code) {
    return { error: "That QR code was empty." };
  }

  const item = await prisma.item.findUnique({
    where: { qrCodeData: code },
    include: balanceInclude,
  });
  if (!item) {
    return { error: "No item matches this QR code." };
  }

  return { item: toStockItem(item, await directoryOf(prisma)) };
}

export async function adjustStock(
  qrCodeData: string,
  direction: unknown,
  amount: unknown,
  user: StockActor | null,
  requestId?: unknown,
  reason?: unknown,
  db: typeof prisma = prisma,
  locationId?: string
): Promise<StockResult> {
  const denied = scanAccessError(user);
  if (denied) {
    return { error: denied };
  }
  if (!user?.id) {
    return { error: "Sign in to scan." };
  }
  const action = parseDirection(direction);
  if (!action || !isStockAction(action)) {
    return { error: "That stock action is not recognized." };
  }
  const change = parseAmount(amount);
  if (change === null) {
    return { error: "Enter a whole number of 1 or more." };
  }
  const submission = parseRequestId(requestId);
  if (!submission) {
    return { error: "Submit this change again." };
  }
  const note = parseReason(reason, false);
  if ("error" in note && note.error) {
    return { error: note.error };
  }
  const code = qrCodeData.trim();
  if (!code) {
    return { error: "That QR code was empty." };
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await applyAdjustment(db, {
        code,
        action,
        amount: change,
        userId: user.id,
        requestId: submission,
        reason: note.reason ?? null,
        locationId: locationId?.trim() || undefined,
      });
    } catch (error) {
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

class StockRejected extends Error {}

async function applyAdjustment(
  db: typeof prisma,
  input: {
    code: string;
    action: StockDirection;
    amount: number;
    userId: string;
    requestId: string;
    reason: string | null;
    locationId?: string;
  }
): Promise<StockResult> {
  try {
    return await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("UPDATE Item SET sku = sku WHERE qrCodeData = ?", input.code);
      const prior = await replayStockItem(input.requestId, tx as unknown as typeof prisma);
      if (prior) {
        return prior;
      }

      const current = await tx.item.findUnique({
        where: { qrCodeData: input.code },
        include: balanceInclude,
      });
      if (!current) {
        return { error: "No item matches this QR code." };
      }

      const chosen = await chooseBalance(tx as unknown as typeof prisma, current, input.locationId, input.action);
      if ("error" in chosen) {
        return chosen;
      }

      const before = chosen.quantity;
      if (input.action === "ADD" && before + input.amount > maxAmount) {
        throw new StockRejected("That amount is too large.");
      }
      const changed =
        input.action === "ADD"
          ? await tx.stockBalance.updateMany({
              where: { itemId: current.id, locationId: chosen.locationId },
              data: { quantity: { increment: input.amount } },
            })
          : await tx.stockBalance.updateMany({
              where: {
                itemId: current.id,
                locationId: chosen.locationId,
                quantity: { gte: input.amount },
              },
              data: { quantity: { decrement: input.amount } },
            });
      if (changed.count !== 1) {
        throw new StockRejected(`Only ${before} in stock at ${chosen.name}.`);
      }

      const after = input.action === "ADD" ? before + input.amount : before - input.amount;
      await tx.history.create({
        data: {
          itemId: current.id,
          userId: input.userId,
          actorName: await actorSnapshot(tx, input.userId),
          action: input.action,
          amount: input.amount,
          quantityBefore: before,
          quantityAfter: after,
          locationName: chosen.name,
          reason: input.reason,
          requestId: input.requestId,
        },
      });
      const item = await loadStockItem(tx as unknown as typeof prisma, current.id);
      if (!item) {
        return { error: "No item matches this QR code." };
      }
      return { item };
    }, transactionOptions);
  } catch (error) {
    if (error instanceof StockRejected) {
      return { error: error.message };
    }
    throw error;
  }
}

async function chooseBalance(
  db: Pick<typeof prisma, "location" | "stockBalance">,
  item: ItemWithBalances,
  locationId: string | undefined,
  action: StockDirection
): Promise<BalanceView | { error: string }> {
  const locations = balancesFromRows(item.balances);
  if (!locationId) {
    if (locations.length === 1 && locations[0]) {
      return locations[0];
    }
    if (locations.length === 0) {
      return { error: "This item has no stock location." };
    }
    return { error: "Choose a location." };
  }

  const existing = locations.find((location) => location.locationId === locationId);
  if (existing) {
    return existing;
  }
  if (action === "REMOVE") {
    return { error: "Only 0 in stock at that location." };
  }
  const place = await db.location.findUnique({ where: { id: locationId } });
  if (!place) {
    return { error: "That location does not exist." };
  }
  await db.stockBalance.create({
    data: { itemId: item.id, locationId: place.id, quantity: 0 },
  });
  return { locationId: place.id, name: place.name, quantity: 0 };
}

export async function correctStock(
  itemId: string,
  nextQuantity: unknown,
  expectedQuantity: unknown,
  reason: unknown,
  requestId: unknown,
  user: StockActor | null,
  db: typeof prisma = prisma,
  locationId?: string
): Promise<StockResult> {
  const denied = inventoryAccessError(user, "edit");
  if (denied) {
    return { error: denied };
  }
  if (!user?.id) {
    return { error: "Only admins and managers can edit items." };
  }
  const next = parseQuantity(nextQuantity);
  const expected = parseQuantity(expectedQuantity);
  if (next === null || expected === null) {
    return { error: "Quantity must be a whole number of 0 or more." };
  }
  if (next === expected) {
    return { error: "Quantity is already that value." };
  }
  const submission = parseRequestId(requestId);
  if (!submission) {
    return { error: "Submit this change again." };
  }
  const note = parseReason(reason, true);
  if ("error" in note && note.error) {
    return { error: note.error };
  }
  const noteReason = note.reason ?? null;
  if (!noteReason) {
    return { error: "A reason is required." };
  }
  const id = itemId.trim();
  if (!id) {
    return { error: "That item no longer exists." };
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await applyCorrection(db, {
        id,
        next,
        expected,
        reason: noteReason,
        requestId: submission,
        userId: user.id,
        locationId: locationId?.trim() || undefined,
      });
    } catch (error) {
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

async function applyCorrection(
  db: typeof prisma,
  input: {
    id: string;
    next: number;
    expected: number;
    reason: string;
    requestId: string;
    userId: string;
    locationId?: string;
  }
): Promise<StockResult> {
  try {
    return await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("UPDATE Item SET sku = sku WHERE id = ?", input.id);
      const prior = await replayStockItem(input.requestId, tx as unknown as typeof prisma);
      if (prior) {
        return prior;
      }

      const current = await tx.item.findUnique({
        where: { id: input.id },
        include: balanceInclude,
      });
      if (!current) {
        return { error: "That item no longer exists." };
      }
      const locations = balancesFromRows(current.balances);
      const chosen = input.locationId
        ? locations.find((location) => location.locationId === input.locationId)
        : locations.length === 1
          ? locations[0]
          : undefined;
      if (!chosen) {
        return {
          error: locations.length > 1 ? "Choose a location." : "This item has no stock location.",
        };
      }
      if (chosen.quantity !== input.expected) {
        return { error: "Stock changed on another device. Reload and try again." };
      }

      const changed = await tx.stockBalance.updateMany({
        where: { itemId: current.id, locationId: chosen.locationId, quantity: input.expected },
        data: { quantity: input.next },
      });
      if (changed.count !== 1) {
        throw new StockRejected("Stock changed on another device. Reload and try again.");
      }

      await tx.history.create({
        data: {
          itemId: current.id,
          userId: input.userId,
          actorName: await actorSnapshot(tx, input.userId),
          action: "AUDIT",
          amount: Math.abs(input.next - input.expected),
          quantityBefore: input.expected,
          quantityAfter: input.next,
          locationName: chosen.name,
          reason: input.reason,
          requestId: input.requestId,
        },
      });
      const item = await loadStockItem(tx as unknown as typeof prisma, current.id);
      if (!item) {
        return { error: "That item no longer exists." };
      }
      return { item };
    }, transactionOptions);
  } catch (error) {
    if (error instanceof StockRejected) {
      return { error: error.message };
    }
    throw error;
  }
}
