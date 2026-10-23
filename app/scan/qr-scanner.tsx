"use client";

import { Html5Qrcode } from "html5-qrcode";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { adjustmentMessage } from "@/lib/scan-feedback";
import type { StockDirection, StockItem } from "@/lib/stock";
import { cn } from "@/lib/utils";

import { lookupQrCode, updateStock } from "./actions";

const viewfinderId = "qr-viewfinder";
const wideQuery = "(min-width: 768px) and (min-height: 500px)";

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

function useWideLayout() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(wideQuery);
    const apply = () => setWide(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
  return wide;
}

export function QrScanner() {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handlingRef = useRef(false);
  const submitLock = useRef(false);
  const wide = useWideLayout();
  const [cameraState, setCameraState] = useState<"starting" | "live" | "error">(
    "starting"
  );
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [looking, setLooking] = useState(false);
  const [item, setItem] = useState<StockItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [amount, setAmount] = useState("1");
  const [pending, setPending] = useState(false);
  const requestRef = useRef<string | null>(null);

  useEffect(() => {
    const scanner = new Html5Qrcode(viewfinderId, false);
    scannerRef.current = scanner;
    let stopped = false;
    const box = window.matchMedia(wideQuery).matches ? 320 : 240;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: box, height: box }, aspectRatio: 1 },
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

    setLooking(true);
    setFeedback(null);
    try {
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
    } catch {
      setItem(null);
      setNotice("The label could not be looked up. Try the scan again.");
      setOpen(true);
    } finally {
      setLooking(false);
    }
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
      submitLock.current = false;
      resumeScanner();
    }
  }

  async function onPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !scannerRef.current || looking || pending) {
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
      setFeedback(null);
      setOpen(true);
    }
  }

  async function onAdjust(direction: StockDirection) {
    if (!item || pending || submitLock.current) {
      return;
    }
    submitLock.current = true;
    const requestId = requestRef.current ?? crypto.randomUUID();
    requestRef.current = requestId;
    const parsed = Number(amount);
    setPending(true);
    setFeedback(null);
    try {
      const result = await updateStock(item.qrCodeData, direction, parsed, requestId);
      if ("error" in result) {
        requestRef.current = null;
        setNotice(result.error);
        return;
      }
      requestRef.current = null;
      setItem(result.item);
      setNotice(null);
      setFeedback(adjustmentMessage(direction, parsed, result.item.quantity));
    } catch {
      setNotice("The change did not finish. Submit it again.");
    } finally {
      submitLock.current = false;
      setPending(false);
    }
  }

  const panel = (
    <AdjustPanel
      item={item}
      notice={notice}
      feedback={feedback}
      amount={amount}
      pending={pending}
      onAmount={setAmount}
      onAdjust={onAdjust}
      onScanAnother={() => onOpenChange(false)}
    />
  );

  return (
    <div className="flex flex-col gap-4 tablet:!grid tablet:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)] tablet:items-start tablet:gap-6">
      <div className="flex flex-col gap-4">
        <div className="relative h-[52vh] min-h-72 overflow-hidden rounded-2xl bg-black tablet:h-[min(70vh,40rem)]">
          <div id={viewfinderId} className="h-full w-full" />
          {cameraState === "starting" ? (
            <p className="pointer-events-none absolute inset-x-0 top-4 text-center text-sm text-white" role="status">
              Requesting camera…
            </p>
          ) : null}
          {looking ? (
            <p className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-sm font-medium text-white" role="status">
              Looking up label…
            </p>
          ) : null}
          {cameraState === "error" && cameraError ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-center text-sm text-white" role="alert">
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
            disabled={looking || pending}
            className="h-12 cursor-pointer file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-sm file:font-medium"
          />
          <p className="text-sm text-muted-foreground">
            Point the camera at a bin label, or choose a photo of the QR code.
          </p>
        </div>
      </div>

      <aside className="hidden tablet:!block" aria-live="polite">
        {wide && open ? (
          panel
        ) : (
          <div className="rounded-xl border bg-card p-5">
            <h2 className="text-lg font-semibold">Ready to scan</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Scan a label to adjust stock. The count stays on this side so you can scan the next bin without leaving the camera.
            </p>
          </div>
        )}
      </aside>

      {wide ? null : (
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent
            side="bottom"
            className="mx-auto max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl pb-[max(2rem,env(safe-area-inset-bottom))]"
          >
            <SheetTitle className="sr-only">
              {item ? item.name : "QR code not recognized"}
            </SheetTitle>
            {panel}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

function AdjustPanel({
  item,
  notice,
  feedback,
  amount,
  pending,
  onAmount,
  onAdjust,
  onScanAnother,
}: {
  item: StockItem | null;
  notice: string | null;
  feedback: string | null;
  amount: string;
  pending: boolean;
  onAmount: (value: string) => void;
  onAdjust: (direction: StockDirection) => void;
  onScanAnother: () => void;
}) {
  const lowStock = item ? item.quantity <= item.threshold : false;

  return (
    <div className="tablet:rounded-xl tablet:border tablet:bg-card tablet:p-5" aria-busy={pending}>
      <div className="space-y-2 pr-8 text-left">
        <h2 className="text-2xl font-semibold">
          {item ? item.name : "QR code not recognized"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {item ? `${item.sku} · ${item.location}` : "This label is not in the inventory."}
        </p>
      </div>

      {item ? (
        <div className="mt-6 flex flex-col gap-5">
          <div>
            <p className="text-sm text-muted-foreground">Current stock</p>
            <p
              className={cn(
                "text-5xl font-semibold tabular-nums",
                lowStock && "text-red-700"
              )}
              aria-live="polite"
            >
              {item.quantity}
            </p>
            {lowStock ? (
              <p className="text-sm font-medium text-red-700">
                Low stock · threshold {item.threshold}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Threshold {item.threshold}</p>
            )}
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
              onChange={(event) => onAmount(event.target.value)}
              onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
              autoComplete="off"
              enterKeyHint="done"
              className="h-16 text-center text-3xl"
              disabled={pending}
            />
          </div>

          {pending ? (
            <p className="text-sm font-medium" role="status">
              Saving…
            </p>
          ) : null}
          {feedback ? (
            <p className="text-sm font-medium" role="status">
              {feedback}
            </p>
          ) : null}
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
              {pending ? "Saving…" : "Add Stock"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="h-16 text-lg"
              disabled={pending}
              onClick={() => onAdjust("REMOVE")}
            >
              {pending ? "Saving…" : "Deduct Stock"}
            </Button>
            <Button type="button" variant="secondary" className="h-14 text-base" onClick={onScanAnother}>
              Scan another
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          <p className="text-sm text-muted-foreground" role="alert">
            {notice}
          </p>
          <Button type="button" variant="secondary" className="h-14 text-base" onClick={onScanAnother}>
            Scan another
          </Button>
        </div>
      )}
    </div>
  );
}
