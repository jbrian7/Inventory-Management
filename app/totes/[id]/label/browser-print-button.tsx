"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

export function BrowserPrintButton() {
  const [opened, setOpened] = useState(false);

  return (
    <div className="flex flex-col gap-2 print:hidden">
      <Button
        type="button"
        className="h-12"
        onClick={() => {
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
          Choose a Wi-Fi, AirPrint, or label printer in the dialog. Opening the dialog does not mean the label printed.
        </p>
      )}
    </div>
  );
}
