import { businessZone } from "@/lib/business-time";

const zone = businessZone;

export const stockActions = ["ADD", "REMOVE", "AUDIT", "NEW_ITEM"] as const;

export type StockAction = (typeof stockActions)[number];

export function isStockAction(value: string): value is StockAction {
  return (stockActions as readonly string[]).includes(value);
}

export function movementActorLabel(user: { name: string } | null | undefined) {
  const name = user?.name?.trim();
  return name || "Unknown";
}

export const actionFilterLabels: Record<StockAction, string> = {
  ADD: "Added",
  REMOVE: "Deducted",
  AUDIT: "Corrected",
  NEW_ITEM: "Received",
};

export function movementTitle(entry: { action: string; amount: number }) {
  if (entry.action === "ADD") {
    return `Added ${entry.amount}`;
  }
  if (entry.action === "REMOVE") {
    return `Deducted ${entry.amount}`;
  }
  if (entry.action === "AUDIT") {
    return `Corrected by ${entry.amount}`;
  }
  if (entry.action === "NEW_ITEM") {
    return `Received ${entry.amount}`;
  }
  return entry.action;
}

export function movementQuantityLine(entry: {
  quantityBefore: number | null;
  quantityAfter: number | null;
}) {
  if (entry.quantityBefore === null || entry.quantityAfter === null) {
    return "Recorded before counts were tracked";
  }
  return `${entry.quantityBefore} → ${entry.quantityAfter}`;
}

export function formatMovementTime(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

export function movementIsConsistent(entry: {
  action: string;
  amount: number;
  quantityBefore: number | null;
  quantityAfter: number | null;
}) {
  if (entry.quantityBefore === null || entry.quantityAfter === null) {
    return true;
  }
  const delta = entry.quantityAfter - entry.quantityBefore;
  if (entry.action === "ADD" || entry.action === "NEW_ITEM") {
    return delta === entry.amount && entry.quantityAfter >= 0;
  }
  if (entry.action === "REMOVE") {
    return delta === -entry.amount && entry.quantityAfter >= 0;
  }
  if (entry.action === "AUDIT") {
    return Math.abs(delta) === entry.amount && entry.quantityAfter >= 0;
  }
  return false;
}
