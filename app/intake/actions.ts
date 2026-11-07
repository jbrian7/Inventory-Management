"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/current-user";
import { moveStock, receiveStock, removeStock, type IntakeLine } from "@/lib/intake";

export type IntakeState = {
  error?: string;
  saved?: boolean;
  message?: string;
};

function readLines(value: FormDataEntryValue | null): IntakeLine[] | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as IntakeLine[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function submitIntake(_previous: IntakeState, formData: FormData): Promise<IntakeState> {
  const user = await getCurrentUser();
  const lines = readLines(formData.get("lines"));
  if (!lines) {
    return { error: "Add at least one product." };
  }
  const result = await receiveStock(user, lines, formData.get("requestId"));
  if ("error" in result) {
    return { error: result.error };
  }
  revalidatePath("/");
  revalidatePath("/items");
  revalidatePath("/totes");
  revalidatePath("/history");
  const count = result.lines.length;
  return {
    saved: true,
    message: count > 0 ? `Received ${count} ${count === 1 ? "line" : "lines"}.` : "This receipt was already saved.",
  };
}

export async function submitRemoval(_previous: IntakeState, formData: FormData): Promise<IntakeState> {
  const user = await getCurrentUser();
  const lines = readLines(formData.get("lines"));
  if (!lines) {
    return { error: "Choose at least one product." };
  }
  const result = await removeStock(user, lines, formData.get("requestId"));
  if ("error" in result) {
    return { error: result.error };
  }
  revalidatePath("/");
  revalidatePath("/items");
  revalidatePath("/totes");
  revalidatePath("/history");
  return { saved: true, message: result.lines.length > 0 ? "Stock removed." : "This removal was already saved." };
}

export async function submitMove(_previous: IntakeState, formData: FormData): Promise<IntakeState> {
  const user = await getCurrentUser();
  const lines = readLines(formData.get("lines"));
  if (!lines) {
    return { error: "Choose at least one product." };
  }
  const destination = String(formData.get("toLocationId") ?? "").trim();
  const result = await moveStock(
    user,
    lines.map((line) => ({ ...line, toLocationId: destination || String((line as { toLocationId?: string }).toLocationId ?? "") })),
    formData.get("requestId")
  );
  if ("error" in result) {
    return { error: result.error };
  }
  revalidatePath("/");
  revalidatePath("/items");
  revalidatePath("/totes");
  revalidatePath("/history");
  return { saved: true, message: result.lines.length > 0 ? "Stock moved." : "This move was already saved." };
}
