"use client";

import { useState } from "react";
import { Delete } from "lucide-react";

import { login } from "@/app/login/actions";
import { Button } from "@/components/ui/button";

const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"] as const;

export function PinPad() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(next: string) {
    setPending(true);
    const result = await login(next);
    if (result?.error) {
      setError(result.error);
      setPin("");
      setPending(false);
    }
  }

  function press(digit: string) {
    if (pending || pin.length >= 4) {
      return;
    }
    const next = `${pin}${digit}`;
    setPin(next);
    setError(null);
    if (next.length === 4) {
      void submit(next);
    }
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex h-12 items-center gap-3" aria-live="polite">
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className={`size-3 rounded-full border ${
              index < pin.length ? "border-foreground bg-foreground" : "border-muted-foreground"
            }`}
          />
        ))}
        <span className="sr-only">{pin.length} of 4 digits</span>
      </div>
      {error ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {pending ? "Checking PIN…" : "Enter the 4-digit PIN."}
        </p>
      )}
      <div className="grid w-full grid-cols-3 gap-3">
        {digits.slice(0, 9).map((digit) => (
          <Button
            key={digit}
            type="button"
            variant="secondary"
            className="h-16 text-2xl"
            onClick={() => press(digit)}
            disabled={pending}
          >
            {digit}
          </Button>
        ))}
        <span />
        <Button
          type="button"
          variant="secondary"
          className="h-16 text-2xl"
          onClick={() => press("0")}
          disabled={pending}
        >
          0
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-16"
          aria-label="Delete digit"
          onClick={() => setPin((current) => current.slice(0, -1))}
          disabled={pending || pin.length === 0}
        >
          <Delete aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
