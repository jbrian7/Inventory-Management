"use client";

import { Button } from "@/components/ui/button";
import { historyUnavailableMessage } from "@/lib/page-messages";

export default function HistoryError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col gap-4" role="alert">
      <h1 className="text-2xl font-semibold tracking-tight">History could not be loaded</h1>
      <p className="text-sm text-muted-foreground">{historyUnavailableMessage}</p>
      <Button type="button" className="h-12" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  );
}
