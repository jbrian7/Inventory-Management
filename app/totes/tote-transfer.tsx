"use client";

import { useState } from "react";

import { TransferForm } from "@/app/items/transfer-form";
import { Label } from "@/components/ui/label";

export function ToteTransfer({
  toteLocationId,
  places,
  items,
}: {
  toteLocationId: string;
  places: { id: string; name: string }[];
  items: {
    id: string;
    name: string;
    balances: { locationId: string; name: string; quantity: number }[];
  }[];
}) {
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const item = items.find((entry) => entry.id === itemId);
  const fromId = item?.balances.find((balance) => balance.locationId !== toteLocationId && balance.quantity > 0)?.locationId;

  return (
    <section className="flex flex-col gap-3" aria-label="Transfer">
      <div className="flex flex-col gap-2">
        <Label htmlFor="tote-item">Item</Label>
        <select
          id="tote-item"
          className="h-12 w-full rounded-md border border-input bg-transparent px-3 text-base"
          value={itemId}
          onChange={(event) => setItemId(event.target.value)}
        >
          {items.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
      </div>
      {item ? (
        <TransferForm
          key={`${item.id}:${fromId ?? ""}:${toteLocationId}`}
          itemId={item.id}
          itemName={item.name}
          places={places}
          balances={item.balances}
          initialFromId={fromId}
          initialToId={toteLocationId}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Add an item before transferring into this tote.</p>
      )}
    </section>
  );
}
