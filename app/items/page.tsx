import { Package } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ItemsPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Items</h1>
        <p className="text-sm text-muted-foreground">
          Novelties, prizes, and arcade parts.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="size-4" aria-hidden="true" />
            Nothing stocked yet
          </CardTitle>
          <CardDescription>
            New items get a unique QR payload for bin labels.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Add an item to start printing labels and adjusting stock.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
