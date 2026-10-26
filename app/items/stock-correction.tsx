"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { correctItemQuantity, type CorrectionState } from "@/app/items/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: CorrectionState = {};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="h-12" disabled={pending}>
      {pending ? "Saving…" : "Correct stock"}
    </Button>
  );
}

export function StockCorrection({ itemId, quantity }: { itemId: string; quantity: number }) {
  const [state, action] = useFormState(correctItemQuantity, initialState);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [counted, setCounted] = useState(String(quantity));

  useEffect(() => {
    setCounted(String(quantity));
  }, [quantity]);

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
          Enter the counted quantity and a reason. This writes an audited movement.
        </p>
      </div>
      <input type="hidden" name="id" value={itemId} />
      <input type="hidden" name="expectedQuantity" value={quantity} />
      <input type="hidden" name="requestId" value={requestId} />
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
      <SaveButton />
    </form>
  );
}
