import Link from "next/link";
import { PackagePlus, ScanLine } from "lucide-react";

import { Button } from "@/components/ui/button";

export function DashboardLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Loading inventory…</p>
      <div className="grid grid-cols-3 gap-2 tablet:gap-4">
        {["On hand", "Low stock", "Today"].map((label) => (
          <div key={label} className="h-20 animate-pulse rounded-xl bg-muted tablet:h-24" aria-hidden="true" />
        ))}
      </div>
      <div className="grid gap-4 tablet:grid-cols-2">
        <div className="h-40 animate-pulse rounded-xl bg-muted" aria-hidden="true" />
        <div className="h-40 animate-pulse rounded-xl bg-muted" aria-hidden="true" />
      </div>
    </div>
  );
}

export function HomeActions({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="flex w-full flex-col gap-3 tablet:w-auto tablet:min-w-72 tablet:!flex-row">
      <Button asChild className="h-14 w-full text-base tablet:min-w-40">
        <Link href="/scan">
          <ScanLine aria-hidden="true" />
          Scan
        </Link>
      </Button>
      <Button asChild variant="secondary" className="h-12 w-full tablet:h-14 tablet:w-auto">
        <Link href="/intake">Receive</Link>
      </Button>
      {canEdit ? (
        <Button asChild variant="secondary" className="h-12 w-full tablet:h-14 tablet:w-auto">
          <Link href="/items">
            <PackagePlus aria-hidden="true" />
            Add item
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
