"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { labelPageCss } from "@/lib/label-print";

export function BrowserPrintButton() {
  const [opened, setOpened] = useState(false);
  const [mode, setMode] = useState<"label" | "sheet">("label");

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: labelPageCss(mode) }} />
      <div className="flex flex-col gap-3 print:hidden">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Paper</legend>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="radio"
            name="paper"
            checked={mode === "label"}
            onChange={() => setMode("label")}
          />
          2 × 2 inch label
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="radio"
            name="paper"
            checked={mode === "sheet"}
            onChange={() => setMode("sheet")}
          />
          Letter sheet with a 2 × 2 inch label
        </label>
      </fieldset>
      <Button
        type="button"
        className="h-12"
        onClick={() => {
          document.documentElement.dataset.printMode = mode;
          window.print();
          setOpened(true);
        }}
      >
        Open print dialog
      </Button>
      {opened ? (
        <p className="text-sm text-muted-foreground" role="status">
          The print dialog was opened. Inventory Manager cannot tell whether the label printed.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Choose a Wi-Fi, AirPrint, or desktop printer. Opening the dialog does not mean the label printed.
        </p>
      )}
    </div>
    </>
  );
}
