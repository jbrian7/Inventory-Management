"use server";

import cuid from "cuid";
import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/current-user";
import { parseDateInput, todayDateInput } from "@/lib/item-dates";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { canEditInventory } from "@/lib/roles";

export type ItemFormState = {
  error?: string;
  saved?: boolean;
  name?: string;
  qrCodeData?: string;
};

function wholeNumber(value: FormDataEntryValue | null, fallback: number) {
  if (value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

async function requireEditor() {
  const user = await getCurrentUser();
  if (!user || !canEditInventory(user.role)) {
    return null;
  }
  return user;
}

type ItemFields = {
  name: string;
  sku: string;
  description: string | null;
  quantity: number;
  threshold: number;
  locationId: string;
  categoryId: string;
  receivedAt: Date;
  outOfStockAt: Date | null;
  isManualOos: boolean;
};

function readItemFields(formData: FormData): { error: string } | { fields: ItemFields } {
  const name = String(formData.get("name") ?? "").trim();
  const sku = String(formData.get("sku") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const locationId = String(formData.get("locationId") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "").trim();
  const quantity = wholeNumber(formData.get("quantity"), 0);
  const threshold = wholeNumber(formData.get("threshold"), 5);
  const receivedRaw = String(formData.get("receivedAt") ?? "").trim();
  const outRaw = String(formData.get("outOfStockAt") ?? "").trim();
  const isManualOos = String(formData.get("isManualOos") ?? "") === "true";

  if (!name || !sku) {
    return { error: "Name and SKU are required." };
  }
  if (!locationId) {
    return { error: "Choose a location." };
  }
  if (!categoryId) {
    return { error: "Choose a category." };
  }
  if (!Number.isInteger(quantity) || quantity < 0) {
    return { error: "Quantity must be a whole number of 0 or more." };
  }
  if (!Number.isInteger(threshold) || threshold < 0) {
    return { error: "Low-stock threshold must be a whole number of 0 or more." };
  }

  const receivedAt = receivedRaw ? parseDateInput(receivedRaw) : parseDateInput(todayDateInput());
  if (!receivedAt) {
    return { error: "Enter a valid received date." };
  }

  let outOfStockAt: Date | null = null;
  if (isManualOos) {
    outOfStockAt = outRaw ? parseDateInput(outRaw) : parseDateInput(todayDateInput());
    if (!outOfStockAt) {
      return { error: "Enter a valid out-of-stock date." };
    }
  }

  return {
    fields: {
      name,
      sku,
      description: description || null,
      quantity,
      threshold,
      locationId,
      categoryId,
      receivedAt,
      outOfStockAt,
      isManualOos,
    },
  };
}

async function relationsExist(locationId: string, categoryId: string) {
  const [location, category] = await Promise.all([
    prisma.location.findUnique({ where: { id: locationId } }),
    prisma.category.findUnique({ where: { id: categoryId } }),
  ]);
  if (!location) {
    return "Choose a location.";
  }
  if (!category) {
    return "Choose a category.";
  }
  return null;
}

function knownError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

export async function createItem(
  _previous: ItemFormState,
  formData: FormData
): Promise<ItemFormState> {
  const user = await requireEditor();
  if (!user) {
    return { error: "Only admins and managers can add items." };
  }

  const parsed = readItemFields(formData);
  if ("error" in parsed) {
    return { error: parsed.error };
  }
  const missing = await relationsExist(parsed.fields.locationId, parsed.fields.categoryId);
  if (missing) {
    return { error: missing };
  }

  const id = cuid();
  const qrCodeData = `ZAP-ITEM-${id}`;

  try {
    await prisma.item.create({
      data: {
        id,
        ...parsed.fields,
        qrCodeData,
        History: {
          create: {
            action: "NEW_ITEM",
            amount: parsed.fields.quantity,
            userId: user.id,
          },
        },
      },
    });
  } catch (error) {
    if (knownError(error)) {
      return { error: "That SKU is already in use." };
    }
    throw error;
  }

  revalidatePath("/items");
  return { name: parsed.fields.name, qrCodeData };
}

export async function updateItem(
  _previous: ItemFormState,
  formData: FormData
): Promise<ItemFormState> {
  const user = await requireEditor();
  if (!user) {
    return { error: "Only admins and managers can edit items." };
  }

  const id = String(formData.get("id") ?? "").trim();
  const current = await prisma.item.findUnique({ where: { id } });
  if (!current) {
    return { error: "That item no longer exists." };
  }

  const parsed = readItemFields(formData);
  if ("error" in parsed) {
    return { error: parsed.error };
  }
  const missing = await relationsExist(parsed.fields.locationId, parsed.fields.categoryId);
  if (missing) {
    return { error: missing };
  }

  try {
    await prisma.item.update({
      where: { id },
      data: parsed.fields,
    });
  } catch (error) {
    if (knownError(error)) {
      return { error: "That SKU is already in use." };
    }
    throw error;
  }

  revalidatePath("/items");
  revalidatePath(`/items/${id}`);
  revalidatePath(`/items/${id}/edit`);
  return { saved: true, name: parsed.fields.name };
}
