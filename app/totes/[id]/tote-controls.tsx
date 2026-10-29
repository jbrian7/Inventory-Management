"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";

import {
  deleteToteAction,
  rotateToteLinkAction,
  setToteVisibilityAction,
  updateToteAction,
  type ToteActionState,
} from "@/app/totes/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ToteActionState = {};

export function ToteControls({
  toteId,
  name,
  storageLabel,
  publicEnabled,
}: {
  toteId: string;
  name: string;
  storageLabel: string;
  publicEnabled: boolean;
}) {
  const router = useRouter();
  const [state, action] = useFormState(updateToteAction, initialState);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(task: () => Promise<ToteActionState>, after?: () => void) {
    setPending(true);
    setNotice(null);
    setError(null);
    try {
      const result = await task();
      if (result.error) {
        setError(result.error);
        return;
      }
      setNotice(result.message ?? "Saved.");
      after?.();
      router.refresh();
    } catch {
      setError("That change did not finish. Try it again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <h2 className="text-base font-semibold">Tote details</h2>
        <input type="hidden" name="id" value={toteId} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-tote-name">Name or number</Label>
          <Input id="edit-tote-name" name="name" required maxLength={80} defaultValue={name} className="h-12" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-tote-storage">Storage or shelf</Label>
          <Input
            id="edit-tote-storage"
            name="storageLabel"
            maxLength={120}
            defaultValue={storageLabel}
            className="h-12"
          />
        </div>
        {state.error ? (
          <p className="text-sm font-medium text-destructive" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.message ? (
          <p className="text-sm" role="status">
            {state.message}
          </p>
        ) : null}
        <SaveDetails />
      </form>
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <h2 className="text-base font-semibold">Public link</h2>
        <p className="text-sm text-muted-foreground">
          {publicEnabled ? "Anyone with the QR code can view the contents." : "The QR code does not open the contents."}
        </p>
        {notice ? (
          <p className="text-sm" role="status">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm font-medium text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          className="h-12"
          disabled={pending}
          onClick={() => run(() => setToteVisibilityAction(toteId, !publicEnabled))}
        >
          {publicEnabled ? "Turn public link off" : "Turn public link on"}
        </Button>
        <Button type="button" variant="secondary" className="h-12" disabled={pending} onClick={() => run(() => rotateToteLinkAction(toteId))}>
          Rotate public link
        </Button>
        <Button
          type="button"
          variant="destructive"
          className="h-12"
          disabled={pending}
          onClick={() => run(() => deleteToteAction(toteId), () => router.push("/totes"))}
        >
          Delete tote
        </Button>
      </div>
    </div>
  );
}

function SaveDetails() {
  const status = useFormStatus();
  return (
    <Button type="submit" className="h-12" disabled={status.pending}>
      {status.pending ? "Saving…" : "Save details"}
    </Button>
  );
}
