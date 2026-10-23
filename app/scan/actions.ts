"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/current-user";
import {
  adjustStock,
  findItemByQr,
  type StockDirection,
  type StockResult,
} from "@/lib/stock";

export async function lookupQrCode(qrCodeData: string): Promise<StockResult> {
  const user = await getCurrentUser();
  return findItemByQr(qrCodeData, user);
}

export async function updateStock(
  qrCodeData: string,
  direction: StockDirection,
  amount: number
): Promise<StockResult> {
  const user = await getCurrentUser();
  const result = await adjustStock(qrCodeData, direction, amount, user);
  if ("item" in result) {
    revalidatePath("/items");
    revalidatePath("/");
  }
  return result;
}
