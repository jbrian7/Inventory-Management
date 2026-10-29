"use client";

import { useState } from "react";

import { printToteOnPi } from "@/app/totes/actions";
import { Button } from "@/components/ui/button";

export function PiPrintButton({ toteId }: { toteId: string }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onPrint() {
    setPending(true);
    setMessage(null);
    setError(null);
    try {
      const result = await printToteOnPi(toteId);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      if (result.status === "printed" && result.printed === true) {
        setMessage("The Pi accepted the label.");
        return;
      }
      setMessage("The Pi prepared the label and did not print it.");
    } catch {
      setError("The label could not be sent to the Pi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 print:hidden">
      <Button type="button" variant="secondary" className="h-12" disabled={pending} onClick={onPrint}>
        {pending ? "Sending…" : "Send to Pi printer"}
      </Button>
      <p className="text-sm text-muted-foreground">Optional. Uses the existing print server when it is configured.</p>
      {message ? (
        <p className="text-sm" role="status">
          {message}
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
