export type Lifecycle = "ACTIVE" | "DEPLETED" | "ARCHIVED";

export function lifecycleOf(item: { archivedAt?: Date | string | null; quantity: number }): Lifecycle {
  if (item.archivedAt) {
    return "ARCHIVED";
  }
  if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
    return "DEPLETED";
  }
  return "ACTIVE";
}

export function tracksLowStock(threshold: number) {
  return Number.isInteger(threshold) && threshold > 0;
}
