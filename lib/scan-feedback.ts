import type { StockDirection } from "@/lib/stock";

export function adjustmentMessage(
  direction: StockDirection,
  amount: number,
  quantity: number,
  locationName?: string,
  total?: number
) {
  const verb = direction === "ADD" ? "Added" : "Deducted";
  if (!locationName) {
    return `${verb} ${amount}. On hand is now ${quantity}.`;
  }
  const totalLine = total !== undefined && total !== quantity ? ` Total on hand is ${total}.` : "";
  return `${verb} ${amount} at ${locationName}. On hand there is now ${quantity}.${totalLine}`;
}
