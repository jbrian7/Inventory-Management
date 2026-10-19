"use server";

import cuid from "cuid";
import { revalidatePath } from "next/cache";

import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type CreateItemState = {
  error?: string;
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

export async function createItem(
  _previous: CreateItemState,
  formData: FormData
): Promise<CreateItemState> {
  const name = String(formData.get("name") ?? "").trim();
  const sku = String(formData.get("sku") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim() || "Stockroom";
  const quantity = wholeNumber(formData.get("quantity"), 0);
  const threshold = wholeNumber(formData.get("threshold"), 5);

  if (!name || !sku) {
    return { error: "Name and SKU are required." };
  }
  if (!Number.isInteger(quantity) || quantity < 0) {
    return { error: "Quantity must be a whole number of 0 or more." };
  }
  if (!Number.isInteger(threshold) || threshold < 0) {
    return { error: "Low-stock threshold must be a whole number of 0 or more." };
  }

  const id = cuid();
  const qrCodeData = `ZAP-ITEM-${id}`;

  try {
    await prisma.item.create({
      data: {
        id,
        name,
        sku,
        description: description || null,
        quantity,
        threshold,
        location,
        qrCodeData,
        History: {
          create: {
            action: "NEW_ITEM",
            amount: quantity,
          },
        },
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { error: "That SKU is already in use." };
    }
    throw error;
  }

  revalidatePath("/items");
  return { name, qrCodeData };
}
