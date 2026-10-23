"use client";

import { useState } from "react";

import { printItemLabel } from "@/app/print/actions";
import { Button } from "@/components/ui/button";

export function PrintLabelButton({ itemId }: { itemId: string }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onPrint() {
    setPending(true);
    setMessage(null);
    setWarning(null);
    setError(null);
    try {
      const result = await printItemLabel(itemId);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      if (result.status === "printed" && result.printed === true) {
        setMessage("Label sent to the printer.");
        return;
      }
      setWarning("The label was prepared, but it was not printed. Set LP_DEST on the Pi to the CUPS queue.");
    } catch {
      setError("The label could not be printed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" className="h-14 text-base" disabled={pending} onClick={onPrint}>
        {pending ? "Sending…" : "Print Label"}
      </Button>
      {message ? (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
      {warning ? (
        <p className="text-sm font-medium" role="status">
          Not printed. {warning}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
