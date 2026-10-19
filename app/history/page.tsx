import { History } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function HistoryPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="text-sm text-muted-foreground">
          Check-ins and check-outs for every item.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="size-4" aria-hidden="true" />
            No adjustments yet
          </CardTitle>
          <CardDescription>
            Stock movements are stored on the History model.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Scan a label and adjust quantity to record the first entry.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}