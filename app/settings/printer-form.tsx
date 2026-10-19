"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizePrinterBase, readPrinterBase, writePrinterBase } from "@/lib/printer-url";

export function PrinterForm() {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = readPrinterBase();
    setValue(stored);
    setSaved(stored);
    setReady(true);
  }, []);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const base = normalizePrinterBase(value);
    if (!base) {
      setError("Enter an address like http://192.168.1.50:3001.");
      return;
    }
    writePrinterBase(base);
    setValue(base);
    setSaved(base);
    setError(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Raspberry Pi local IP</CardTitle>
        <CardDescription>
          Saved in this browser and used when printing a label.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="printer-url">Printer address</Label>
            <Input
              id="printer-url"
              name="printer-url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="http://192.168.1.50:3001"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="h-12"
              disabled={!ready}
            />
          </div>
          {error ? (
            <p className="text-sm font-medium text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          {saved && !error ? (
            <p className="text-sm text-muted-foreground" role="status">
              Saved {saved}
            </p>
          ) : null}
          <Button type="submit" className="h-12" disabled={!ready}>
            Save
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
