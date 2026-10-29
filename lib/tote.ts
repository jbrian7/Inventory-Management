import { randomBytes } from "node:crypto";

import { inventoryAccessError, type AccessUser } from "@/lib/access";
import { totalQuantity } from "@/lib/balances";
import { Prisma } from "@/lib/generated/prisma/client";
import { locationDeleteError } from "@/lib/locations";
import { prisma } from "@/lib/prisma";

const maxName = 80;
const maxStorage = 120;

export function createToteToken() {
  return randomBytes(32).toString("base64url");
}

export function cleanToteName(value: unknown): { error: string } | { name: string } {
  if (typeof value !== "string") {
    return { error: "Enter a tote name." };
  }
  const name = value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  if (!name) {
    return { error: "Enter a tote name." };
  }
  if (name.length > maxName) {
    return { error: "Tote name must be 80 characters or less." };
  }
  return { name };
}

export function cleanStorageLabel(value: unknown): { error: string } | { storageLabel: string | null } {
  if (value === null || value === undefined || value === "") {
    return { storageLabel: null };
  }
  if (typeof value !== "string") {
    return { error: "Storage label must be text." };
  }
  const storageLabel = value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  if (!storageLabel) {
    return { storageLabel: null };
  }
  if (storageLabel.length > maxStorage) {
    return { error: "Storage label must be 120 characters or less." };
  }
  return { storageLabel };
}

function duplicateName(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function createTote(
  user: (AccessUser & { id?: string }) | null,
  input: { name: unknown; storageLabel: unknown; publicEnabled?: boolean },
  db: typeof prisma = prisma
): Promise<{ error: string } | { tote: { id: string; name: string; locationId: string; publicToken: string } }> {
  const denied = inventoryAccessError(user, "add");
  if (denied) {
    return { error: denied };
  }
  const name = cleanToteName(input.name);
  if ("error" in name) {
    return { error: name.error };
  }
  const storage = cleanStorageLabel(input.storageLabel);
  if ("error" in storage) {
    return { error: storage.error };
  }
  try {
    return await db.$transaction(async (tx) => {
      const location = await tx.location.create({ data: { name: name.name } });
      const tote = await tx.tote.create({
        data: {
          name: name.name,
          storageLabel: storage.storageLabel,
          publicEnabled: input.publicEnabled !== false,
          publicToken: createToteToken(),
          locationId: location.id,
        },
      });
      return {
        tote: {
          id: tote.id,
          name: tote.name,
          locationId: tote.locationId,
          publicToken: tote.publicToken,
        },
      };
    });
  } catch (error) {
    if (duplicateName(error)) {
      return { error: "That name is already used." };
    }
    throw error;
  }
}

export async function updateTote(
  user: (AccessUser & { id?: string }) | null,
  id: string,
  input: { name: unknown; storageLabel: unknown },
  db: typeof prisma = prisma
) {
  const denied = inventoryAccessError(user, "edit");
  if (denied) {
    return { error: denied };
  }
  const name = cleanToteName(input.name);
  if ("error" in name) {
    return { error: name.error };
  }
  const storage = cleanStorageLabel(input.storageLabel);
  if ("error" in storage) {
    return { error: storage.error };
  }
  const current = await db.tote.findUnique({ where: { id } });
  if (!current) {
    return { error: "That tote no longer exists." };
  }
  try {
    await db.$transaction([
      db.location.update({ where: { id: current.locationId }, data: { name: name.name } }),
      db.tote.update({
        where: { id },
        data: { name: name.name, storageLabel: storage.storageLabel },
      }),
    ]);
    return { saved: true as const };
  } catch (error) {
    if (duplicateName(error)) {
      return { error: "That name is already used." };
    }
    throw error;
  }
}

export async function setTotePublicEnabled(
  user: (AccessUser & { id?: string }) | null,
  id: string,
  enabled: boolean,
  db: typeof prisma = prisma
) {
  const denied = inventoryAccessError(user, "edit");
  if (denied) {
    return { error: denied };
  }
  const current = await db.tote.findUnique({ where: { id } });
  if (!current) {
    return { error: "That tote no longer exists." };
  }
  await db.tote.update({ where: { id }, data: { publicEnabled: enabled } });
  return { saved: true as const, publicEnabled: enabled };
}

export async function rotateToteToken(
  user: (AccessUser & { id?: string }) | null,
  id: string,
  db: typeof prisma = prisma
): Promise<{ error: string } | { saved: true; publicToken: string }> {
  const denied = inventoryAccessError(user, "edit");
  if (denied) {
    return { error: denied };
  }
  const current = await db.tote.findUnique({ where: { id } });
  if (!current) {
    return { error: "That tote no longer exists." };
  }
  const publicToken = createToteToken();
  await db.tote.update({ where: { id }, data: { publicToken } });
  return { saved: true as const, publicToken };
}

export async function deleteTote(user: (AccessUser & { id?: string }) | null, id: string, db: typeof prisma = prisma) {
  const denied = inventoryAccessError(user, "edit");
  if (denied) {
    return { error: denied };
  }
  const current = await db.tote.findUnique({ where: { id } });
  if (!current) {
    return { error: "That tote no longer exists." };
  }
  const held = await db.stockBalance.aggregate({
    where: { locationId: current.locationId },
    _sum: { quantity: true },
  });
  const blocked = locationDeleteError(held._sum.quantity ?? 0);
  if (blocked) {
    return { error: "Transfer the stock out of this tote before deleting it." };
  }
  await db.$transaction([
    db.stockBalance.deleteMany({ where: { locationId: current.locationId, quantity: 0 } }),
    db.tote.delete({ where: { id } }),
    db.location.delete({ where: { id: current.locationId } }),
  ]);
  return { deleted: true as const };
}

export type PublicToteView = {
  businessName: string;
  name: string;
  storageLabel: string | null;
  items: { name: string; quantity: number }[];
  distinct: number;
  pieces: number;
};

export async function loadPublicTote(token: string, db: typeof prisma = prisma): Promise<PublicToteView | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return null;
  }
  const tote = await db.tote.findUnique({
    where: { publicToken: token },
    include: {
      location: {
        include: {
          balances: {
            where: { quantity: { gt: 0 } },
            include: { item: { select: { name: true } } },
          },
        },
      },
    },
  });
  if (!tote || !tote.publicEnabled) {
    return null;
  }
  const items = tote.location.balances
    .map((balance) => ({ name: balance.item.name, quantity: balance.quantity }))
    .sort((left, right) => left.name.localeCompare(right.name) || right.quantity - left.quantity);
  return {
    businessName: "",
    name: tote.name,
    storageLabel: tote.storageLabel,
    items,
    distinct: items.length,
    pieces: totalQuantity(items),
  };
}
