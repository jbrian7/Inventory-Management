import { readSheetHistory } from "@/lib/storage/sheets-stock";

export async function SheetsHistory() {
  const rows = await readSheetHistory();
  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="text-sm text-muted-foreground">Movements stored in this deployment&apos;s spreadsheet.</p>
      </header>
      <ul className="rounded-xl border bg-card">
        {rows.length === 0 ? (
          <li className="px-4 py-3 text-sm text-muted-foreground">No movements yet.</li>
        ) : (
          rows.slice(0, 100).map((row) => (
            <li key={row.id} className="border-b px-4 py-3 text-sm last:border-b-0">
              <p className="font-medium">{row.itemName}</p>
              <p>
                {row.action} {row.amount}
                {row.actorName ? ` · ${row.actorName}` : ""}
              </p>
              <p className="text-muted-foreground">
                {row.locationName || (row.fromLocationName ? `${row.fromLocationName} → ${row.toLocationName}` : "")}
              </p>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
