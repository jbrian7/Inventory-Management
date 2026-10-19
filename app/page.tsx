import Link from "next/link";
import { AlertTriangle, PackagePlus, ScanLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const stats = [
  { label: "On hand", value: "0", detail: "units in stock" },
  { label: "Low stock", value: "0", detail: "below threshold" },
  { label: "Today", value: "0", detail: "adjustments" },
];

export default function HomePage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">Zap Zone</p>
        <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
        <p className="text-sm text-muted-foreground">
          Scan a bin label to check stock in or out.
        </p>
      </header>

      <section aria-label="Inventory summary" className="grid grid-cols-3 gap-2">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="space-y-1 p-3">
              <CardDescription className="text-xs">{stat.label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{stat.value}</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-[11px] leading-snug text-muted-foreground">
                {stat.detail}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="size-4 text-destructive" aria-hidden="true" />
            Low stock
          </CardTitle>
          <CardDescription>
            Items at or below their reorder threshold.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No low-stock items yet. Add inventory to start tracking.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Button asChild size="lg" className="h-12">
          <Link href="/scan">
            <ScanLine aria-hidden="true" />
            Scan
          </Link>
        </Button>
        <Button asChild size="lg" variant="secondary" className="h-12">
          <Link href="/items">
            <PackagePlus aria-hidden="true" />
            Add item
          </Link>
        </Button>
      </div>
    </div>
  );
}
