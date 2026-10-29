"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/current-user";
import { sendLabel } from "@/lib/print-client";
import { printAccessError, validateLabelFields, type PrintOutcome } from "@/lib/print-job";
import { prisma } from "@/lib/prisma";
import { totePublicUrl } from "@/lib/public-url";
import {
  createTote,
  deleteTote,
  rotateToteToken,
  setTotePublicEnabled,
  updateTote,
} from "@/lib/tote";

export type ToteActionState = {
  error?: string;
  saved?: boolean;
  message?: string;
};

function text(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

export async function createToteAction(_previous: ToteActionState, formData: FormData): Promise<ToteActionState> {
  const user = await getCurrentUser();
  const created = await createTote(user, {
    name: text(formData.get("name")),
    storageLabel: text(formData.get("storageLabel")),
    publicEnabled: formData.get("publicEnabled") === "true",
  });
  if ("error" in created) {
    return { error: created.error };
  }
  revalidatePath("/totes");
  revalidatePath("/settings");
  return { saved: true, message: `Created ${created.tote.name}.` };
}

export async function updateToteAction(_previous: ToteActionState, formData: FormData): Promise<ToteActionState> {
  const user = await getCurrentUser();
  const id = text(formData.get("id")).trim();
  const saved = await updateTote(user, id, {
    name: text(formData.get("name")),
    storageLabel: text(formData.get("storageLabel")),
  });
  if ("error" in saved) {
    return { error: saved.error };
  }
  revalidatePath("/totes");
  revalidatePath(`/totes/${id}`);
  revalidatePath("/settings");
  return { saved: true, message: "Tote details saved." };
}

export async function setToteVisibilityAction(id: string, enabled: boolean): Promise<ToteActionState> {
  const user = await getCurrentUser();
  const saved = await setTotePublicEnabled(user, id, enabled);
  if ("error" in saved) {
    return { error: saved.error };
  }
  revalidatePath(`/totes/${id}`);
  return { saved: true, message: enabled ? "Public link is on." : "Public link is off." };
}

export async function rotateToteLinkAction(id: string): Promise<ToteActionState> {
  const user = await getCurrentUser();
  const rotated = await rotateToteToken(user, id);
  if ("error" in rotated) {
    return { error: rotated.error };
  }
  revalidatePath(`/totes/${id}`);
  revalidatePath(`/totes/${id}/label`);
  return { saved: true, message: "The old public link no longer works. Print a new label." };
}

export async function deleteToteAction(id: string): Promise<ToteActionState> {
  const user = await getCurrentUser();
  const removed = await deleteTote(user, id);
  if ("error" in removed) {
    return { error: removed.error };
  }
  revalidatePath("/totes");
  revalidatePath("/settings");
  return { saved: true };
}

export async function printToteOnPi(toteId: string): Promise<PrintOutcome> {
  const user = await getCurrentUser();
  const denied = printAccessError(user);
  if (denied) {
    return { printed: false, error: denied };
  }
  const tote = await prisma.tote.findUnique({ where: { id: toteId } });
  if (!tote) {
    return { printed: false, error: "That tote no longer exists." };
  }
  const url = totePublicUrl(tote.publicToken);
  if ("error" in url) {
    return { printed: false, error: url.error };
  }
  const label = validateLabelFields({ name: tote.name, sku: "TOTE", qrData: url.url });
  if ("error" in label) {
    return { printed: false, error: label.error };
  }
  return sendLabel(label.label);
}
