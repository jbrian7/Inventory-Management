export default function HistoryLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">History</h1>
      <p className="text-sm text-muted-foreground">Loading movements…</p>
      <div className="h-40 animate-pulse rounded-xl bg-muted" aria-hidden="true" />
    </div>
  );
}
