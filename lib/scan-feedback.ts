import type { StockDirection } from "@/lib/stock";

export function adjustmentMessage(direction: StockDirection, amount: number, quantity: number) {
  const verb = direction === "ADD" ? "Added" : "Deducted";
  return `${verb} ${amount}. On hand is now ${quantity}.`;
}
