import { randomBytes } from "node:crypto";

import { inventoryAccessError, scanAccessError, type AccessUser } from "@/lib/access";
import { totalQuantity } from "@/lib/balances";
import { itemQrPayload } from "@/lib/brand";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { suggestProducts } from "@/lib/product-match";
import { usingSheets } from "@/lib/storage/backend";
import { parseAmount, parseRequestId } from "@/lib/stock";

export { suggestProducts };

const maxLines = 40;
const generalCategory = "General";

class IntakeRejected extends Error {}

function isBusy(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message.includes("database is locked") || message.includes("SQLITE_BUSY");
}

export type IntakeLine = {
  itemId?: string | null;
  createNew?: boolean;
  name?: string | null;
  quantity: number;
  locationId: string;
  categoryName?: string | null;
  description?: string | null;
  barcode?: string | null;
  sku?: string | null;
};

export type IntakeResult =
  | { saved: true; lines: { itemId: string; name: string; sku: string; quantity: number; locationName: string }[] }
  | { error: string };

type Actor = (AccessUser & { id?: string }) | null;

export function intakeFingerprint(lines: IntakeLine[]) {
  return JSON.stringify(
    lines.map((line) => ({
      itemId: line.itemId?.trim() ?? "",
      createNew: line.createNew === true,
      name: line.name?.trim().toLowerCase() ?? "",
      quantity: line.quantity,
      locationId: line.locationId.trim(),
      categoryName: line.categoryName?.trim().toLowerCase() ?? "",
      description: line.description?.trim() ?? "",
      barcode: line.barcode?.trim() ?? "",
      sku: line.sku?.trim() ?? "",
    }))
  );
}

function cleanText(value: string | null | undefined, max: number) {
  const text = (value ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  if (text.length > max) {
    return null;
  }
  return text;
}

export function generateSku() {
  return `IN-${Date.now().toString(36).toUpperCase()}${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function receiveStock(user: Actor, lines: IntakeLine[], requestId: unknown, db: typeof prisma = prisma): Promise<IntakeResult> {
  if (usingSheets() && db === prisma) {
    const { receiveOnSheets } = await import("@/lib/storage/sheets-stock");
    return receiveOnSheets(user, lines, requestId);
  }
  const denied = scanAccessError(user);
  if (denied) {
    return { error: denied };
  }
  if (!user?.id) {
    return { error: "Sign in to scan." };
  }
  const submission = parseRequestId(requestId);
  if (!submission) {
    return { error: "Submit this receipt again." };
  }
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > maxLines) {
    return { error: "Add at least one product." };
  }
  const fingerprint = intakeFingerprint(lines);
  for (const line of lines) {
    if (!line.locationId?.trim()) {
      return { error: "Choose a destination." };
    }
    if (parseAmount(line.quantity) === null) {
      return { error: "Enter a whole number of 1 or more." };
    }
    const creating = line.createNew === true;
    const existing = Boolean(line.itemId?.trim());
    if (creating === existing) {
      return { error: "Choose an existing product or create a new one." };
    }
    if (creating && inventoryAccessError(user, "add")) {
      return { error: "Only admins and managers can add items." };
    }
    if (creating && !cleanText(line.name, 80)) {
      return { error: "Enter a product name." };
    }
  }

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
    return await db.$transaction(async (tx) => {
      const prior = await tx.stockReceipt.findUnique({ where: { requestId: submission } });
      if (prior) {
        if (prior.fingerprint !== fingerprint) {
          return { error: "That request was already used for a different receipt." };
        }
        return { saved: true as const, lines: [] };
      }
      const actor = await tx.user.findUnique({ where: { id: user.id }, select: { name: true } });
      const actorName = actor?.name.trim() || "Unknown";
      const saved: { itemId: string; name: string; sku: string; quantity: number; locationName: string }[] = [];

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]!;
        const location = await tx.location.findUnique({ where: { id: line.locationId.trim() } });
        if (!location) {
          throw new IntakeRejected("Choose a destination that exists.");
        }
        const received = line.createNew
          ? await createReceivedItem(tx, line, user.id!, actorName, submission, index, location.name)
          : await addReceivedItem(tx, line, user.id!, actorName, submission, index, location.name);
        if ("error" in received) {
          throw new IntakeRejected(received.error);
        }
        saved.push({ ...received, locationName: location.name });
      }

      await tx.stockReceipt.create({
        data: { requestId: submission, fingerprint, userId: user.id, actorName },
      });
      return { saved: true as const, lines: saved };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const prior = await db.stockReceipt.findUnique({ where: { requestId: submission } });
      if (prior?.fingerprint === fingerprint) {
        return { saved: true, lines: [] };
      }
      if (prior) {
        return { error: "That request was already used for a different receipt." };
      }
    }
    if (error instanceof IntakeRejected) {
      return { error: error.message };
    }
    if (isBusy(error) && attempt < 5) {
      continue;
    }
    throw error;
    }
  }
  return { error: "The receipt could not be saved." };
}

async function addReceivedItem(
  tx: Prisma.TransactionClient,
  line: IntakeLine,
  userId: string,
  actorName: string,
  requestId: string,
  index: number,
  locationName: string
) {
  const item = await tx.item.findUnique({ where: { id: line.itemId!.trim() }, include: { balances: true } });
  if (!item) {
    return { error: "Choose a product that is still in the catalog." };
  }
  await tx.$executeRawUnsafe("UPDATE Item SET sku = sku WHERE id = ?", item.id);
  const lockedItem = await tx.item.findUnique({ where: { id: item.id }, select: { archivedAt: true } });
  if (!lockedItem || lockedItem.archivedAt) {
    return { error: "Choose a product that is still in the catalog." };
  }
  const current = await tx.stockBalance.findUnique({
    where: { itemId_locationId: { itemId: item.id, locationId: line.locationId.trim() } },
  });
  const before = current?.quantity ?? 0;
  if (!current) {
    await tx.stockBalance.create({ data: { itemId: item.id, locationId: line.locationId.trim(), quantity: 0 } });
  }
  const updated = await tx.stockBalance.updateMany({
    where: { itemId: item.id, locationId: line.locationId.trim() },
    data: { quantity: { increment: line.quantity } },
  });
  if (updated.count !== 1) {
    return { error: "The receipt could not be saved." };
  }
  await tx.history.create({
    data: {
      itemId: item.id,
      userId,
      actorName,
      action: "ADD",
      amount: line.quantity,
      quantityBefore: before,
      quantityAfter: before + line.quantity,
      locationName,
      requestId: `${requestId}-${index}`,
      reason: "Received",
    },
  });
  return { itemId: item.id, name: item.name, sku: item.sku, quantity: line.quantity };
}

async function createReceivedItem(
  tx: Prisma.TransactionClient,
  line: IntakeLine,
  userId: string,
  actorName: string,
  requestId: string,
  index: number,
  locationName: string
) {
  const name = cleanText(line.name, 80);
  if (!name) {
    return { error: "Enter a product name." };
  }
  const description = cleanText(line.description, 200);
  const barcode = cleanText(line.barcode, 80);
  const requestedSku = cleanText(line.sku, 40);
  const categoryName = cleanText(line.categoryName, 80) || generalCategory;
  const category = await tx.category.upsert({
    where: { name: categoryName },
    update: {},
    create: { name: categoryName },
  });
  const id = `in_${randomBytes(12).toString("hex")}`;
  let sku = requestedSku || generateSku();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const taken = await tx.item.findUnique({ where: { sku } });
    if (!taken) {
      break;
    }
    sku = generateSku();
  }
  if (barcode) {
    const takenBarcode = await tx.item.findUnique({ where: { barcode } });
    if (takenBarcode) {
      return { error: "That barcode is already in use." };
    }
  }
  const item = await tx.item.create({
    data: {
      id,
      name,
      sku,
      description: description || null,
      barcode: barcode || null,
      threshold: 0,
      categoryId: category.id,
      qrCodeData: itemQrPayload(id),
      balances: { create: { locationId: line.locationId.trim(), quantity: line.quantity } },
      History: {
        create: {
          userId,
          actorName,
          action: "NEW_ITEM",
          amount: line.quantity,
          quantityBefore: 0,
          quantityAfter: line.quantity,
          locationName,
          requestId: `${requestId}-${index}`,
          reason: "Received",
        },
      },
    },
  });
  return { itemId: item.id, name: item.name, sku: item.sku, quantity: line.quantity };
}

export async function archiveItems(user: Actor, ids: string[], db: typeof prisma = prisma) {
  if (usingSheets() && db === prisma) {
    const { archiveOnSheets } = await import("@/lib/storage/sheets-stock");
    return archiveOnSheets(user, ids);
  }
  const denied = inventoryAccessError(user, "edit");
  if (denied) {
    return { error: denied };
  }
  const unique = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
  if (unique.length < 1) {
    return { error: "Choose a product to archive." };
  }
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await db.$transaction(async (tx) => {
        for (const id of unique) {
          await tx.$executeRawUnsafe("UPDATE Item SET sku = sku WHERE id = ?", id);
          const item = await tx.item.findUnique({
            where: { id },
            include: { balances: { select: { quantity: true } } },
          });
          if (!item) {
            throw new IntakeRejected("Choose a product that exists.");
          }
          if (item.archivedAt) {
            continue;
          }
          if (totalQuantity(item.balances) > 0) {
            throw new IntakeRejected(`${item.name} still has stock. Deplete it before archiving.`);
          }
          await tx.item.update({ where: { id }, data: { archivedAt: new Date() } });
        }
        return { saved: true as const, count: unique.length };
      });
    } catch (error) {
      if (isBusy(error) && attempt < 5) {
        continue;
      }
      if (error instanceof IntakeRejected) {
        return { error: error.message };
      }
      throw error;
    }
  }
  return { error: "The product could not be archived." };
}

export async function restoreItems(user: Actor, ids: string[], db: typeof prisma = prisma) {
  if (usingSheets() && db === prisma) {
    const { restoreOnSheets } = await import("@/lib/storage/sheets-stock");
    return restoreOnSheets(user, ids);
  }
  const denied = inventoryAccessError(user, "edit");
  if (denied) {
    return { error: denied };
  }
  const unique = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
  if (unique.length < 1) {
    return { error: "Choose a product to restore." };
  }
  await db.item.updateMany({
    where: { id: { in: unique } },
    data: { archivedAt: null },
  });
  return { saved: true as const, count: unique.length };
}

export async function moveStock(
  user: Actor,
  lines: (IntakeLine & { toLocationId: string })[],
  requestId: unknown,
  db: typeof prisma = prisma
): Promise<IntakeResult> {
  if (usingSheets() && db === prisma) {
    const { moveOnSheets } = await import("@/lib/storage/sheets-stock");
    return moveOnSheets(user, lines, requestId);
  }
  const denied = scanAccessError(user);
  if (denied || !user?.id) {
    return { error: denied || "Sign in to scan." };
  }
  const submission = parseRequestId(requestId);
  if (!submission) {
    return { error: "Submit this move again." };
  }
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > maxLines) {
    return { error: "Choose at least one product." };
  }
  const fingerprint = intakeFingerprint(
    lines.map((line) => ({ ...line, name: line.toLocationId, createNew: false }))
  );
  for (const line of lines) {
    if (!line.itemId?.trim() || !line.locationId?.trim() || !line.toLocationId?.trim()) {
      return { error: "Choose a product and two places." };
    }
    if (line.locationId.trim() === line.toLocationId.trim()) {
      return { error: "Choose two different places." };
    }
    if (parseAmount(line.quantity) === null) {
      return { error: "Enter a whole number of 1 or more." };
    }
  }
  try {
    return await db.$transaction(async (tx) => {
      const prior = await tx.stockReceipt.findUnique({ where: { requestId: submission } });
      if (prior) {
        if (prior.fingerprint !== fingerprint) {
          throw new IntakeRejected("That request was already used for a different receipt.");
        }
        return { saved: true as const, lines: [] };
      }
      const actor = await tx.user.findUnique({ where: { id: user.id }, select: { name: true } });
      const actorName = actor?.name.trim() || "Unknown";
      const saved: { itemId: string; name: string; sku: string; quantity: number; locationName: string }[] = [];
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]!;
        const [from, to, item] = await Promise.all([
          tx.location.findUnique({ where: { id: line.locationId.trim() } }),
          tx.location.findUnique({ where: { id: line.toLocationId.trim() } }),
          tx.item.findUnique({ where: { id: line.itemId!.trim() }, include: { balances: true } }),
        ]);
        if (!from || !to || !item) {
          throw new IntakeRejected("Choose a product and places that exist.");
        }
        await tx.$executeRawUnsafe("UPDATE Item SET sku = sku WHERE id = ?", item.id);
        const source = await tx.stockBalance.findUnique({
          where: { itemId_locationId: { itemId: item.id, locationId: from.id } },
        });
        const before = source?.quantity ?? 0;
        if (before < line.quantity) {
          throw new IntakeRejected(`Only ${before} ${item.name} in ${from.name}.`);
        }
        const dest = await tx.stockBalance.findUnique({
          where: { itemId_locationId: { itemId: item.id, locationId: to.id } },
        });
        const destBefore = dest?.quantity ?? 0;
        if (!dest) {
          await tx.stockBalance.create({ data: { itemId: item.id, locationId: to.id, quantity: 0 } });
        }
        const moved = await tx.stockBalance.updateMany({
          where: { itemId: item.id, locationId: from.id, quantity: { gte: line.quantity } },
          data: { quantity: { decrement: line.quantity } },
        });
        if (moved.count !== 1) {
          throw new IntakeRejected(`Only ${before} ${item.name} in ${from.name}.`);
        }
        await tx.stockBalance.updateMany({
          where: { itemId: item.id, locationId: to.id },
          data: { quantity: { increment: line.quantity } },
        });
        const total = totalQuantity(item.balances);
        await tx.history.create({
          data: {
            itemId: item.id,
            userId: user.id,
            actorName,
            action: "TRANSFER",
            amount: line.quantity,
            quantityBefore: total,
            quantityAfter: total,
            fromLocationName: from.name,
            toLocationName: to.name,
            sourceQuantityBefore: before,
            sourceQuantityAfter: before - line.quantity,
            destinationQuantityBefore: destBefore,
            destinationQuantityAfter: destBefore + line.quantity,
            requestId: `${submission}-${index}`,
            reason: "Moved",
          },
        });
        saved.push({ itemId: item.id, name: item.name, sku: item.sku, quantity: line.quantity, locationName: `${from.name} → ${to.name}` });
      }
      await tx.stockReceipt.create({
        data: { requestId: submission, fingerprint, userId: user.id, actorName },
      });
      return { saved: true as const, lines: saved };
    });
  } catch (error) {
    if (error instanceof IntakeRejected) {
      return { error: error.message };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const prior = await db.stockReceipt.findUnique({ where: { requestId: submission } });
      if (prior?.fingerprint === fingerprint) {
        return { saved: true, lines: [] };
      }
    }
    throw error;
  }
}

export async function removeStock(user: Actor, lines: IntakeLine[], requestId: unknown, db: typeof prisma = prisma): Promise<IntakeResult> {
  if (usingSheets() && db === prisma) {
    const { removeOnSheets } = await import("@/lib/storage/sheets-stock");
    return removeOnSheets(user, lines, requestId);
  }
  const denied = scanAccessError(user);
  if (denied || !user?.id) {
    return { error: denied || "Sign in to scan." };
  }
  const submission = parseRequestId(requestId);
  if (!submission) {
    return { error: "Submit this removal again." };
  }
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > maxLines) {
    return { error: "Choose at least one product." };
  }
  const normalized = lines.map((line) => ({ ...line, createNew: false }));
  const fingerprint = intakeFingerprint(normalized);
  for (const line of normalized) {
    if (!line.itemId?.trim() || !line.locationId?.trim() || parseAmount(line.quantity) === null) {
      return { error: "Choose a product, a place, and a whole number of 1 or more." };
    }
  }
  try {
    return await db.$transaction(async (tx) => {
      const prior = await tx.stockReceipt.findUnique({ where: { requestId: submission } });
      if (prior) {
        if (prior.fingerprint !== fingerprint) {
          return { error: "That request was already used for a different receipt." };
        }
        return { saved: true as const, lines: [] };
      }
      const actor = await tx.user.findUnique({ where: { id: user.id }, select: { name: true } });
      const actorName = actor?.name.trim() || "Unknown";
      const saved: { itemId: string; name: string; sku: string; quantity: number; locationName: string }[] = [];
      for (let index = 0; index < normalized.length; index += 1) {
        const line = normalized[index]!;
        const location = await tx.location.findUnique({ where: { id: line.locationId.trim() } });
        const item = await tx.item.findUnique({ where: { id: line.itemId!.trim() } });
        if (!location || !item) {
          throw new IntakeRejected("Choose a product and place that exist.");
        }
        await tx.$executeRawUnsafe("UPDATE Item SET sku = sku WHERE id = ?", item.id);
        const balance = await tx.stockBalance.findUnique({
          where: { itemId_locationId: { itemId: item.id, locationId: location.id } },
        });
        const before = balance?.quantity ?? 0;
        const updated = await tx.stockBalance.updateMany({
          where: { itemId: item.id, locationId: location.id, quantity: { gte: line.quantity } },
          data: { quantity: { decrement: line.quantity } },
        });
        if (updated.count !== 1) {
          throw new IntakeRejected(`Only ${before} ${item.name} in ${location.name}.`);
        }
        await tx.history.create({
          data: {
            itemId: item.id,
            userId: user.id,
            actorName,
            action: "REMOVE",
            amount: line.quantity,
            quantityBefore: before,
            quantityAfter: before - line.quantity,
            locationName: location.name,
            requestId: `${submission}-${index}`,
            reason: "Removed",
          },
        });
        saved.push({ itemId: item.id, name: item.name, sku: item.sku, quantity: line.quantity, locationName: location.name });
      }
      await tx.stockReceipt.create({
        data: { requestId: submission, fingerprint, userId: user.id, actorName },
      });
      return { saved: true as const, lines: saved };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const prior = await db.stockReceipt.findUnique({ where: { requestId: submission } });
      if (prior?.fingerprint === fingerprint) {
        return { saved: true, lines: [] };
      }
    }
    if (error instanceof IntakeRejected) {
      return { error: error.message };
    }
    throw error;
  }
}
