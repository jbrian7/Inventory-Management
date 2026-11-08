export type QueuedIntakeRow = {
  itemId: string | null;
  createNew: boolean;
  name: string;
  quantity: string;
  locationId: string;
  toLocationId: string;
  categoryName: string;
  description: string;
  barcode: string;
};

export function queuedIntakeLines(rows: QueuedIntakeRow[]) {
  return rows.map((row) => ({
    itemId: row.itemId,
    createNew: row.createNew,
    name: row.name,
    quantity: Number(row.quantity),
    locationId: row.locationId,
    toLocationId: row.toLocationId,
    categoryName: row.categoryName,
    description: row.description,
    barcode: row.barcode,
  }));
}

export function queuedRowDetail(
  row: { createNew: boolean; quantity: string; locationId: string; toLocationId: string },
  places: { id: string; name: string }[],
  mode: "add" | "remove" | "move"
) {
  const from = places.find((place) => place.id === row.locationId)?.name ?? "Unknown place";
  const kind = row.createNew ? "New" : "Existing";
  if (mode === "move") {
    const to = places.find((place) => place.id === row.toLocationId)?.name ?? "Unknown place";
    return `${kind} · ${row.quantity} · ${from} → ${to}`;
  }
  return `${kind} · ${row.quantity} · ${from}`;
}
