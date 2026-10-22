import Link from "next/link";

import { topMovers } from "@/lib/top-movers";

export async function TopMovers() {
  const movers = await topMovers();

  return (
    <section aria-label="Top movers" className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">Top movers</h2>
        <p className="text-xs text-muted-foreground">Removed in 30 days</p>
      </div>
      {movers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No removals in the last 30 days.</p>
      ) : (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {movers.map((item) => (
            <Link
              key={item.id}
              href={`/items/${item.id}`}
              className="w-36 shrink-0 rounded-xl border bg-card p-3 shadow-sm"
            >
              <p className="truncate text-sm font-semibold">{item.name}</p>
              <p className="truncate text-xs text-muted-foreground">{item.sku}</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{item.removed}</p>
              <p className="text-[11px] text-muted-foreground">units out</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
