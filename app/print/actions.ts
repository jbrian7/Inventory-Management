"use server";

import { getCurrentUser } from "@/lib/current-user";
import { sendLabel } from "@/lib/print-client";
import { prepareItemPrint, prepareTestPrint, type PrintOutcome } from "@/lib/print-job";
import { prisma } from "@/lib/prisma";

export type PrintActionState = PrintOutcome;

export async function printItemLabel(itemId: string): Promise<PrintActionState> {
  const user = await getCurrentUser();
  return prepareItemPrint(user, itemId, {
    loadItem: (id) =>
      prisma.item.findUnique({
        where: { id },
        select: { name: true, sku: true, qrCodeData: true },
      }),
    send: sendLabel,
  });
}

export async function printTestLabel(): Promise<PrintActionState> {
  const user = await getCurrentUser();
  return prepareTestPrint(user, sendLabel);
}
