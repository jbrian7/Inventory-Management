"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { readPrinterBase } from "@/lib/printer-url";

export function PrintLabelButton({
  item,
}: {
  item: { name: string; sku: string; qrCodeData: string };
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onPrint() {
    const base = readPrinterBase();
    if (!base) {
      setMessage(null);
      setError("Save the Raspberry Pi address in Settings first.");
      return;
    }

    setPending(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`${base}/print`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: item.name,
          sku: item.sku,
          qrData: item.qrCodeData,
          qrCodeData: item.qrCodeData,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        imageBytes?: number;
      } | null;

      if (!response.ok) {
        setError(payload?.error || `The printer returned ${response.status}.`);
        return;
      }

      setMessage(
        payload?.imageBytes
          ? `Label sent (${payload.imageBytes} byte QR image).`
          : "Label sent."
      );
    } catch {
      setError(`Could not reach the printer at ${base}.`);
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
      {error ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {error}{" "}
          {error.includes("Settings") ? (
            <Link href="/settings" className="underline">
              Open Settings
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
