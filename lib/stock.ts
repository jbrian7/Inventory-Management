import { inventoryAccessError, scanAccessError, type AccessUser } from "@/lib/access";
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
  qrCodeData: string;
};

export type StockResult = { item: StockItem } | { error: string };

export type StockDirection = "ADD" | "REMOVE";

export type StockActor = AccessUser & { id?: string };

const itemWithLocation = { location: true } as const;
const maxAmount = 100000;
const attempts = 3;
const transactionOptions = { maxWait: 15000, timeout: 15000 };

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

async function replay(requestId: string, db: typeof prisma): Promise<StockResult | null> {
  const prior = await db.history.findUnique({
    where: { requestId },
    include: { item: { include: itemWithLocation } },
  });
  if (!prior?.item) {
    return null;
  }
  return { item: toStockItem(prior.item) };
}

export function openingMovement(userId: string, quantity: number, requestId: string) {
  if (!parseRequestId(requestId) || parseQuantity(quantity) === null) {
    throw new Error("Invalid opening stock.");
  }
  return {
    action: "NEW_ITEM",
    amount: quantity,
    quantityBefore: 0,
    quantityAfter: quantity,
    userId,
    requestId,
    reason: null,
  };
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
    include: itemWithLocation,
  });
  if (!item) {
    return { error: "No item matches this QR code." };
  }

  return { item: toStockItem(item) };
}

export async function adjustStock(
  qrCodeData: string,
  direction: unknown,
  amount: unknown,
  user: StockActor | null,
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
  const noteReason = note.reason ?? null;
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
        reason: noteReason,
      });
    } catch (error) {
      if (duplicateRequest(error)) {
        const prior = await replay(submission, db);
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

async function applyAdjustment(
  db: typeof prisma,
  input: {
    code: string;
    action: StockDirection;
    amount: number;
    userId: string;
    requestId: string;
    reason: string | null;
  }
): Promise<StockResult> {
  return db.$transaction(async (tx) => {
    // Take the write lock before any read so two devices cannot deadlock on SQLite.
    await tx.$executeRawUnsafe(
      "UPDATE Item SET quantity = quantity WHERE qrCodeData = ?",
      input.code
    );
    const prior = await tx.history.findUnique({
      where: { requestId: input.requestId },
      include: { item: { include: itemWithLocation } },
    });
    if (prior?.item) {
      return { item: toStockItem(prior.item) };
    }

    const current = await tx.item.findUnique({
      where: { qrCodeData: input.code },
      include: itemWithLocation,
    });
    if (!current) {
      return { error: "No item matches this QR code." };
    }

    const changed =
      input.action === "ADD"
        ? await tx.item.updateMany({
            where: { id: current.id },
            data: { quantity: { increment: input.amount } },
          })
        : await tx.item.updateMany({
            where: { id: current.id, quantity: { gte: input.amount } },
            data: { quantity: { decrement: input.amount } },
          });
    if (changed.count !== 1) {
      const latest = await tx.item.findUnique({ where: { id: current.id } });
      if (!latest) {
        return { error: "No item matches this QR code." };
      }
      return { error: `Only ${latest.quantity} in stock.` };
    }

    const updated = await tx.item.findUniqueOrThrow({
      where: { id: current.id },
      include: itemWithLocation,
    });
    const quantityBefore =
      input.action === "ADD" ? updated.quantity - input.amount : updated.quantity + input.amount;
    await tx.history.create({
      data: {
        itemId: updated.id,
        userId: input.userId,
        action: input.action,
        amount: input.amount,
        quantityBefore,
        quantityAfter: updated.quantity,
        reason: input.reason,
        requestId: input.requestId,
      },
    });
    return { item: toStockItem(updated) };
  }, transactionOptions);
}

export async function correctStock(
  itemId: string,
  nextQuantity: unknown,
  expectedQuantity: unknown,
  reason: unknown,
  requestId: unknown,
  user: StockActor | null,
  db: typeof prisma = prisma
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
      });
    } catch (error) {
      if (duplicateRequest(error)) {
        const prior = await replay(submission, db);
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
  }
): Promise<StockResult> {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("UPDATE Item SET quantity = quantity WHERE id = ?", input.id);
    const prior = await tx.history.findUnique({
      where: { requestId: input.requestId },
      include: { item: { include: itemWithLocation } },
    });
    if (prior?.item) {
      return { item: toStockItem(prior.item) };
    }

    const changed = await tx.item.updateMany({
      where: { id: input.id, quantity: input.expected },
      data: { quantity: input.next },
    });
    if (changed.count !== 1) {
      const latest = await tx.item.findUnique({ where: { id: input.id } });
      if (!latest) {
        return { error: "That item no longer exists." };
      }
      return { error: "Stock changed on another device. Reload and try again." };
    }

    const updated = await tx.item.findUniqueOrThrow({
      where: { id: input.id },
      include: itemWithLocation,
    });
    await tx.history.create({
      data: {
        itemId: updated.id,
        userId: input.userId,
        action: "AUDIT",
        amount: Math.abs(input.next - input.expected),
        quantityBefore: input.expected,
        quantityAfter: input.next,
        reason: input.reason,
        requestId: input.requestId,
      },
    });
    return { item: toStockItem(updated) };
  }, transactionOptions);
}
