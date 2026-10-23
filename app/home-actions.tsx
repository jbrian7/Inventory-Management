import Link from "next/link";
import { PackagePlus, ScanLine } from "lucide-react";

import { Button } from "@/components/ui/button";

export function DashboardLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Loading inventory…</p>
      <div className="grid grid-cols-3 gap-2">
        {["On hand", "Low stock", "Today"].map((label) => (
          <div key={label} className="h-20 animate-pulse rounded-xl bg-muted" aria-hidden="true" />
        ))}
      </div>
    </div>
  );
}

export function HomeActions({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <Button asChild className="h-14 w-full text-base">
        <Link href="/scan">
          <ScanLine aria-hidden="true" />
          Scan
        </Link>
      </Button>
      {canEdit ? (
        <Button asChild variant="secondary" className="h-12 w-full">
          <Link href="/items">
            <PackagePlus aria-hidden="true" />
            Add item
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
