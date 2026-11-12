import Link from "next/link";

import { readSheetCatalog, readSheetHistory } from "@/lib/storage/sheets-stock";

export async function SheetsHome() {
  const [items, history] = await Promise.all([readSheetCatalog(), readSheetHistory()]);
  const onHand = items.reduce((sum, item) => sum + item.quantity, 0);
  const counts = {
    active: items.filter((item) => item.lifecycle === "ACTIVE").length,
    depleted: items.filter((item) => item.lifecycle === "DEPLETED").length,
    archived: items.filter((item) => item.lifecycle === "ARCHIVED").length,
  };
  return (
    <section className="flex flex-col gap-4" aria-label="Google Sheets inventory">
      <p className="text-sm text-muted-foreground">Stored in this deployment&apos;s spreadsheet. SQLite is not being updated.</p>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">On hand</p>
          <p className="text-2xl font-semibold tabular-nums">{onHand}</p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">Depleted</p>
          <p className="text-2xl font-semibold tabular-nums">{counts.depleted}</p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">Archived</p>
          <p className="text-2xl font-semibold tabular-nums">{counts.archived}</p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{counts.active} active products.</p>
      <section className="rounded-xl border bg-card">
        <h2 className="border-b px-4 py-3 text-base font-semibold">Recent movements</h2>
        <ul>
          {history.slice(0, 8).map((row) => (
            <li key={row.id} className="border-b px-4 py-3 text-sm last:border-b-0">
              <Link href={`/items/${row.itemId}`} className="font-medium">
                {row.itemName}
              </Link>
              <p className="text-muted-foreground">
                {row.action} {row.amount}
                {row.locationName ? ` · ${row.locationName}` : ""}
                {row.fromLocationName ? ` · ${row.fromLocationName} → ${row.toLocationName}` : ""}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
