"use server";

import { revalidatePath } from "next/cache";

import {
  adjustStock,
  findItemByQr,
  type StockDirection,
  type StockResult,
} from "@/lib/stock";

export async function lookupQrCode(qrCodeData: string): Promise<StockResult> {
  return findItemByQr(qrCodeData);
}

export async function updateStock(
  qrCodeData: string,
  direction: StockDirection,
  amount: number
): Promise<StockResult> {
  const result = await adjustStock(qrCodeData, direction, amount);
  if ("item" in result) {
    revalidatePath("/items");
    revalidatePath("/");
  }
  return result;
}
