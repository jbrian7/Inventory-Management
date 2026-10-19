import { ScanLine } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ScanPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Scan</h1>
        <p className="text-sm text-muted-foreground">
          Use the device camera to read a bin label.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ScanLine className="size-4" aria-hidden="true" />
            Camera ready
          </CardTitle>
          <CardDescription>
            Point at a printed QR label to check stock in or out.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex aspect-square items-center justify-center rounded-lg border border-dashed bg-muted text-sm text-muted-foreground">
            Scanner opens in a later step
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
