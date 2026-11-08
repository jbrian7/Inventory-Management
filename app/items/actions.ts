"use server";

import cuid from "cuid";
import { revalidatePath } from "next/cache";

import { itemQrPayload } from "@/lib/brand";
import { getCurrentUser } from "@/lib/current-user";
import { createStockedItem, saveItemDetails } from "@/lib/item-edit";
import { parseDateInput, todayDateInput } from "@/lib/item-dates";
import { prisma } from "@/lib/prisma";
import { inventoryAccessError } from "@/lib/access";
import { correctStock, parseQuantity, parseRequestId } from "@/lib/stock";
import { transferStock } from "@/lib/transfer";

export type ItemFormState = {
  error?: string;
  saved?: boolean;
  name?: string;
  qrCodeData?: string;
};

export type CorrectionState = {
  error?: string;
  saved?: boolean;
};

export type TransferState = {
  error?: string;
  saved?: boolean;
  message?: string;
};

function wholeNumber(value: FormDataEntryValue | null, fallback: number) {
  if (value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

async function requireEditor(kind: "add" | "edit") {
  const user = await getCurrentUser();
  if (inventoryAccessError(user, kind)) {
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

function readItemFields(
  formData: FormData,
  options: { requireQuantity: boolean; requireLocation: boolean }
): { error: string } | { fields: ItemFields } {
  const name = String(formData.get("name") ?? "").trim();
  const sku = String(formData.get("sku") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const locationId = String(formData.get("locationId") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "").trim();
  const quantity = options.requireQuantity ? wholeNumber(formData.get("quantity"), 0) : 0;
  const threshold = wholeNumber(formData.get("threshold"), 5);
  const receivedRaw = String(formData.get("receivedAt") ?? "").trim();
  const outRaw = String(formData.get("outOfStockAt") ?? "").trim();
  const isManualOos = String(formData.get("isManualOos") ?? "") === "true";

  if (!name || !sku) {
    return { error: "Name and SKU are required." };
  }
  if (options.requireLocation && !locationId) {
    return { error: "Choose a location." };
  }
  if (!categoryId) {
    return { error: "Choose a category." };
  }
  if (options.requireQuantity && (!Number.isInteger(quantity) || quantity < 0)) {
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

export async function createItem(
  _previous: ItemFormState,
  formData: FormData
): Promise<ItemFormState> {
  const user = await requireEditor("add");
  if (!user) {
    return { error: "Only admins and managers can add items." };
  }

  const parsed = readItemFields(formData, { requireQuantity: true, requireLocation: true });
  if ("error" in parsed) {
    return { error: parsed.error };
  }
  const requestId = parseRequestId(formData.get("requestId"));
  if (!requestId) {
    return { error: "Submit this item again." };
  }
  const quantity = parseQuantity(parsed.fields.quantity);
  if (quantity === null) {
    return { error: "Quantity must be a whole number of 0 or more." };
  }
  const missing = await relationsExist(parsed.fields.locationId, parsed.fields.categoryId);
  if (missing) {
    return { error: missing };
  }

  const id = cuid();
  const qrCodeData = itemQrPayload(id);
  const created = await createStockedItem(user, {
    ...parsed.fields,
    quantity,
    id,
    qrCodeData,
    requestId,
  });
  if ("error" in created) {
    return { error: created.error };
  }

  revalidatePath("/items");
  return { name: created.name, qrCodeData: created.qrCodeData };
}

export async function updateItem(
  _previous: ItemFormState,
  formData: FormData
): Promise<ItemFormState> {
  const user = await requireEditor("edit");
  if (!user) {
    return { error: "Only admins and managers can edit items." };
  }

  const id = String(formData.get("id") ?? "").trim();
  const current = await prisma.item.findUnique({ where: { id } });
  if (!current) {
    return { error: "That item no longer exists." };
  }

  const parsed = readItemFields(formData, { requireQuantity: false, requireLocation: false });
  if ("error" in parsed) {
    return { error: parsed.error };
  }
  const category = await prisma.category.findUnique({ where: { id: parsed.fields.categoryId } });
  if (!category) {
    return { error: "Choose a category." };
  }

  const saved = await saveItemDetails(user, id, {
    name: parsed.fields.name,
    sku: parsed.fields.sku,
    description: parsed.fields.description,
    threshold: parsed.fields.threshold,
    categoryId: parsed.fields.categoryId,
    receivedAt: parsed.fields.receivedAt,
    outOfStockAt: parsed.fields.outOfStockAt,
    isManualOos: parsed.fields.isManualOos,
  });
  if ("error" in saved) {
    return { error: saved.error };
  }

  revalidatePath("/items");
  revalidatePath(`/items/${id}`);
  revalidatePath(`/items/${id}/edit`);
  return { saved: true, name: saved.name };
}

export async function correctItemQuantity(
  _previous: CorrectionState,
  formData: FormData
): Promise<CorrectionState> {
  const user = await getCurrentUser();
  const result = await correctStock(
    String(formData.get("id") ?? ""),
    formData.get("quantity"),
    formData.get("expectedQuantity"),
    formData.get("reason"),
    formData.get("requestId"),
    user,
    undefined,
    String(formData.get("locationId") ?? "")
  );
  if ("error" in result) {
    return { error: result.error };
  }
  revalidatePath("/items");
  revalidatePath(`/items/${result.item.id}`);
  revalidatePath(`/items/${result.item.id}/edit`);
  return { saved: true };
}

export async function transferItem(
  _previous: TransferState,
  formData: FormData
): Promise<TransferState> {
  const user = await getCurrentUser();
  const result = await transferStock(
    String(formData.get("itemId") ?? ""),
    formData.get("fromLocationId"),
    formData.get("toLocationId"),
    formData.get("quantity"),
    user,
    formData.get("requestId"),
    formData.get("reason")
  );
  if ("error" in result) {
    return { error: result.error };
  }
  const fromName = result.item.locations.find((row) => row.locationId === String(formData.get("fromLocationId")))?.name;
  const toName = result.item.locations.find((row) => row.locationId === String(formData.get("toLocationId")))?.name;
  const amount = String(formData.get("quantity") ?? "").trim();
  revalidatePath("/");
  revalidatePath("/items");
  revalidatePath("/history");
  revalidatePath(`/items/${result.item.id}`);
  return {
    saved: true,
    message:
      fromName && toName
        ? `Transferred ${amount} ${result.item.name}. ${fromName} → ${toName}. Total on hand is ${result.item.quantity}.`
        : `Transferred ${amount} ${result.item.name}. Total on hand is ${result.item.quantity}.`,
  };
}
