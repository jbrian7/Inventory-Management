"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { correctItemQuantity, type CorrectionState } from "@/app/items/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: CorrectionState = {};

const selectClass = "h-12 w-full rounded-md border border-input bg-transparent px-3 text-base";

function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="h-12" disabled={disabled || pending}>
      {pending ? "Saving…" : "Correct stock"}
    </Button>
  );
}

export function StockCorrection({
  itemId,
  locations,
}: {
  itemId: string;
  locations: { locationId: string; name: string; quantity: number }[];
}) {
  const [state, action] = useFormState(correctItemQuantity, initialState);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [locationId, setLocationId] = useState(locations.length === 1 ? locations[0]?.locationId ?? "" : "");
  const selected = locations.find((location) => location.locationId === locationId);
  const expected = selected?.quantity ?? 0;
  const [counted, setCounted] = useState(selected ? String(selected.quantity) : "");

  useEffect(() => {
    if (selected) {
      setCounted(String(selected.quantity));
    }
  }, [selected]);

  useEffect(() => {
    if (state.saved) {
      setRequestId(crypto.randomUUID());
    }
  }, [state.saved]);

  return (
    <form action={action} id="correct" className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Correct stock</h2>
        <p className="text-sm text-muted-foreground">
          Count one location and give a reason. This writes an audited movement for that location.
        </p>
      </div>
      <input type="hidden" name="id" value={itemId} />
      <input type="hidden" name="expectedQuantity" value={expected} />
      <input type="hidden" name="locationId" value={locationId} />
      <input type="hidden" name="requestId" value={requestId} />
      {locations.length === 0 ? (
        <p className="text-sm text-muted-foreground">This item has no stock location.</p>
      ) : null}
      {locations.length > 1 ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="correct-location">Location</Label>
          <select
            id="correct-location"
            className={selectClass}
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
            required
          >
            <option value="">Choose a location</option>
            {locations.map((location) => (
              <option key={location.locationId} value={location.locationId}>
                {location.name} ({location.quantity})
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {locations.length === 1 && selected ? (
        <p className="text-sm text-muted-foreground">
          {selected.name} · {selected.quantity} on hand
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="correct-quantity">Counted quantity</Label>
        <Input
          id="correct-quantity"
          name="quantity"
          type="number"
          min={0}
          step={1}
          required
          value={counted}
          onChange={(event) => setCounted(event.target.value)}
          className="h-12"
          disabled={!selected}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="correct-reason">Reason</Label>
        <Input id="correct-reason" name="reason" required maxLength={200} className="h-12" />
      </div>
      {state.saved ? (
        <p className="text-sm" role="status">
          Stock correction saved.
        </p>
      ) : null}
      {state.error ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <SaveButton disabled={!selected} />
    </form>
  );
}
