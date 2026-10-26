export type BalanceView = {
  locationId: string;
  name: string;
  quantity: number;
};

export function totalQuantity(balances: { quantity: number }[]) {
  return balances.reduce((sum, balance) => {
    if (!Number.isInteger(balance.quantity) || balance.quantity < 0) {
      throw new Error("A stock quantity is unavailable.");
    }
    return sum + balance.quantity;
  }, 0);
}

export function locationSummary(balances: { name: string }[]) {
  if (balances.length === 0) {
    return "No location";
  }
  if (balances.length === 1) {
    return balances[0]?.name ?? "No location";
  }
  return `${balances.length} locations`;
}

export function balancesFromRows(
  rows: { locationId: string; quantity: number; location: { name: string } }[]
): BalanceView[] {
  return [...rows]
    .map((row) => ({
      locationId: row.locationId,
      name: row.location.name,
      quantity: row.quantity,
    }))
    .sort((left, right) => left.name.localeCompare(right.name) || left.locationId.localeCompare(right.locationId));
}
