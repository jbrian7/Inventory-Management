"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { transferItem, type TransferState } from "@/app/items/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: TransferState = {};

const selectClass = "h-12 w-full rounded-md border border-input bg-transparent px-3 text-base";

export function TransferForm({
  itemId,
  itemName,
  places,
  balances,
}: {
  itemId: string;
  itemName: string;
  places: { id: string; name: string }[];
  balances: { locationId: string; name: string; quantity: number }[];
}) {
  const [state, formAction] = useFormState(transferItem, initialState);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [fromId, setFromId] = useState(balances[0]?.locationId ?? places[0]?.id ?? "");
  const [toId, setToId] = useState(places.find((place) => place.id !== fromId)?.id ?? "");
  const available = balances.find((row) => row.locationId === fromId)?.quantity ?? 0;
  const samePlace = fromId !== "" && fromId === toId;

  useEffect(() => {
    if (state.saved) {
      setRequestId(crypto.randomUUID());
    }
  }, [state.saved]);

  return (
    <form id="transfer" action={formAction} className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Transfer stock</h2>
        <p className="text-sm text-muted-foreground">Move {itemName} between locations. The total does not change.</p>
      </div>
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="requestId" value={requestId} />
      {state.error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.saved && state.message ? (
        <p className="rounded-md bg-muted px-3 py-2 text-sm" role="status">
          {state.message}
        </p>
      ) : null}
      <div className="grid gap-3 tablet:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`from-${itemId}`}>From</Label>
          <select
            id={`from-${itemId}`}
            name="fromLocationId"
            className={selectClass}
            value={fromId}
            onChange={(event) => setFromId(event.target.value)}
          >
            {places.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </select>
          <p className="text-sm text-muted-foreground">{available} available</p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`to-${itemId}`}>To</Label>
          <select
            id={`to-${itemId}`}
            name="toLocationId"
            className={selectClass}
            value={toId}
            onChange={(event) => setToId(event.target.value)}
          >
            {places.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`qty-${itemId}`}>Quantity</Label>
        <Input id={`qty-${itemId}`} name="quantity" type="number" min={1} step={1} required className="h-12" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`note-${itemId}`}>Note</Label>
        <Input id={`note-${itemId}`} name="reason" maxLength={200} className="h-12" />
      </div>
      {samePlace ? <p className="text-sm text-destructive">Choose two different locations.</p> : null}
      <SubmitTransfer disabled={samePlace || places.length < 2 || available < 1} />
    </form>
  );
}

function SubmitTransfer({ disabled }: { disabled: boolean }) {
  const status = useFormStatus();
  return (
    <Button type="submit" className="h-12" disabled={disabled || status.pending}>
      {status.pending ? "Transferring…" : "Confirm transfer"}
    </Button>
  );
}
