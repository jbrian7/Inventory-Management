"use client";

import { Html5Qrcode } from "html5-qrcode";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { StockDirection, StockItem } from "@/lib/stock";
import { cn } from "@/lib/utils";

import { lookupQrCode, updateStock } from "./actions";

const viewfinderId = "qr-viewfinder";

function cameraMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera access was blocked. Allow the camera for this site, then reload.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera was found. You can still scan a photo of the label.";
  }
  return "The camera could not start. You can still scan a photo of the label.";
}

export function QrScanner() {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handlingRef = useRef(false);
  const [cameraState, setCameraState] = useState<"starting" | "live" | "error">(
    "starting"
  );
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [item, setItem] = useState<StockItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [amount, setAmount] = useState("1");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const scanner = new Html5Qrcode(viewfinderId, false);
    scannerRef.current = scanner;
    let stopped = false;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 },
        (decodedText) => {
          void openCode(decodedText);
        },
        () => undefined
      )
      .then(() => {
        if (stopped) {
          return scanner.stop().catch(() => undefined);
        }
        setCameraState("live");
      })
      .catch((error: unknown) => {
        if (!stopped) {
          setCameraState("error");
          setCameraError(cameraMessage(error));
        }
      });

    return () => {
      stopped = true;
      if (scanner.isScanning) {
        scanner.stop().catch(() => undefined);
      }
    };
  }, []);

  async function openCode(raw: string) {
    if (handlingRef.current) {
      return;
    }
    handlingRef.current = true;
    const scanner = scannerRef.current;
    if (scanner?.isScanning) {
      try {
        scanner.pause(true);
      } catch {
        // A photo scan may already have paused the camera.
      }
    }

    const result = await lookupQrCode(raw);
    if ("error" in result) {
      setItem(null);
      setNotice(result.error);
    } else {
      setItem(result.item);
      setNotice(null);
      setAmount("1");
    }
    setOpen(true);
  }

  function resumeScanner() {
    handlingRef.current = false;
    const scanner = scannerRef.current;
    if (scanner?.isScanning) {
      try {
        scanner.resume();
      } catch {
        setCameraState("error");
        setCameraError("The camera could not resume. Reload the page to scan again.");
      }
    }
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setPending(false);
      resumeScanner();
    }
  }

  async function onPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !scannerRef.current) {
      return;
    }

    try {
      if (scannerRef.current.isScanning) {
        scannerRef.current.pause(true);
      }
      const decodedText = await scannerRef.current.scanFile(file, false);
      handlingRef.current = false;
      await openCode(decodedText);
    } catch {
      handlingRef.current = true;
      setItem(null);
      setNotice("That photo did not contain a readable QR code.");
      setOpen(true);
    }
  }

  async function onAdjust(direction: StockDirection) {
    if (!item) {
      return;
    }
    const parsed = Number(amount);
    setPending(true);
    const result = await updateStock(item.qrCodeData, direction, parsed);
    setPending(false);
    if ("error" in result) {
      setNotice(result.error);
      return;
    }
    setItem(result.item);
    setNotice(null);
  }

  const lowStock = item ? item.quantity <= item.threshold : false;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative h-[52vh] min-h-72 overflow-hidden rounded-2xl bg-black">
        <div id={viewfinderId} className="h-full w-full" />
        {cameraState === "starting" ? (
          <p className="pointer-events-none absolute inset-x-0 top-4 text-center text-sm text-white">
            Requesting camera…
          </p>
        ) : null}
        {cameraState === "error" && cameraError ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-center text-sm text-white">
            {cameraError}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="qr-photo" className="sr-only">
          Scan a photo of the label
        </Label>
        <Input
          id="qr-photo"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onPhoto}
          className="h-12 cursor-pointer file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-sm file:font-medium"
        />
        <p className="text-sm text-muted-foreground">
          Point the camera at a bin label, or choose a photo of the QR code.
        </p>
      </div>

      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[85vh] max-w-md overflow-y-auto rounded-t-2xl pb-8"
        >
          <SheetHeader className="text-left">
            <SheetTitle className="text-2xl">
              {item ? item.name : "QR code not recognized"}
            </SheetTitle>
            <SheetDescription>
              {item
                ? `${item.sku} · ${item.location}`
                : "This label is not in the inventory."}
            </SheetDescription>
          </SheetHeader>

          {item ? (
            <div className="mt-6 flex flex-col gap-5">
              <div>
                <p className="text-sm text-muted-foreground">Current stock</p>
                <p
                  className={cn(
                    "text-5xl font-semibold tabular-nums",
                    lowStock && "text-red-700"
                  )}
                >
                  {item.quantity}
                </p>
                {lowStock ? (
                  <p className="text-sm font-medium text-red-700">
                    Low stock · threshold {item.threshold}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="adjust-amount">Amount</Label>
                <Input
                  id="adjust-amount"
                  inputMode="numeric"
                  type="number"
                  min={1}
                  step={1}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="h-16 text-center text-3xl"
                />
              </div>

              {notice ? (
                <p className="text-sm font-medium text-destructive" role="alert">
                  {notice}
                </p>
              ) : null}

              <div className="grid grid-cols-1 gap-3">
                <Button
                  type="button"
                  className="h-16 text-lg"
                  disabled={pending}
                  onClick={() => onAdjust("ADD")}
                >
                  Add Stock
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="h-16 text-lg"
                  disabled={pending}
                  onClick={() => onAdjust("REMOVE")}
                >
                  Deduct Stock
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-6 text-sm text-muted-foreground" role="alert">
              {notice}
            </p>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
