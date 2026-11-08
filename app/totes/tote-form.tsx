"use client";

import { useFormState, useFormStatus } from "react-dom";

import { createToteAction, type ToteActionState } from "@/app/totes/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ToteActionState = {};

export function ToteForm() {
  const [state, action] = useFormState(createToteAction, initialState);

  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <h2 className="text-base font-semibold">New tote</h2>
      <p className="text-sm text-muted-foreground">
        This creates a location used only for this tote. Stock is moved in with a transfer.
      </p>
      <input type="hidden" name="publicEnabled" value="true" />
      <div className="flex flex-col gap-2">
        <Label htmlFor="tote-name">Name or number</Label>
        <Input id="tote-name" name="name" required maxLength={80} className="h-12" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="tote-storage">Storage or shelf</Label>
        <Input id="tote-storage" name="storageLabel" maxLength={120} className="h-12" />
      </div>
      {state.error ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.saved && state.message ? (
        <p className="text-sm" role="status">
          {state.message}
        </p>
      ) : null}
      <Submit />
    </form>
  );
}

function Submit() {
  const status = useFormStatus();
  return (
    <Button type="submit" className="h-12" disabled={status.pending}>
      {status.pending ? "Creating…" : "Create tote"}
    </Button>
  );
}
