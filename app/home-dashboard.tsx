import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { RetryLoad } from "@/components/retry-load";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  activityEmptyMessage,
  dashboardUnavailableMessage,
  loadDashboard,
  lowStockEmptyMessage,
} from "@/lib/dashboard";

export async function HomeDashboard() {
  let dashboard: Awaited<ReturnType<typeof loadDashboard>>;
  try {
    dashboard = await loadDashboard();
  } catch {
    return <RetryLoad title="Inventory could not be loaded" message={dashboardUnavailableMessage} />;
  }
  const stats = [
    { label: "On hand", value: dashboard.onHand, detail: "units in stock" },
    { label: "Low stock", value: dashboard.lowStockCount, detail: "at or below threshold" },
    { label: "Today", value: dashboard.todayCount, detail: "movements, Eastern Time" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Inventory summary" className="grid grid-cols-3 gap-2">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="space-y-1 p-3">
              <CardDescription className="text-xs">{stat.label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{stat.value}</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-[11px] leading-snug text-muted-foreground">{stat.detail}</p>
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
            Items at or below their threshold. Manually marked out of stock are not listed here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dashboard.lowStock.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {lowStockEmptyMessage(dashboard.itemCount)}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {dashboard.lowStock.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/items/${item.id}`}
                    className="flex flex-col gap-0.5 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm"
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-medium text-red-950">{item.name}</span>
                      <span className="text-lg font-semibold tabular-nums text-red-700">
                        {item.quantity}
                      </span>
                    </span>
                    <span className="text-red-800">
                      Threshold {item.threshold} · {item.location}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {dashboard.lowStockHidden > 0 ? (
            <Link href="/items" className="mt-3 inline-block text-sm font-medium text-primary">
              {dashboard.lowStockHidden} more low-stock items
            </Link>
          ) : null}
        </CardContent>
      </Card>

      <section className="flex flex-col gap-2" aria-label="Recent activity">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold">Recent activity</h2>
          <Link href="/history" className="text-sm font-medium text-primary">
            History
          </Link>
        </div>
        {dashboard.recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">{activityEmptyMessage()}</p>
        ) : (
          <ul className="rounded-xl border bg-card px-4">
            {dashboard.recent.map((entry) => (
              <li key={entry.id} className="border-b py-3 text-sm last:border-b-0">
                <div className="flex items-baseline justify-between gap-3">
                  <Link href={`/items/${entry.itemId}`} className="font-medium">
                    {entry.itemName}
                  </Link>
                  <span className="text-muted-foreground">{entry.actor}</span>
                </div>
                <p>{entry.title}</p>
                <p className="text-muted-foreground">{entry.quantityLine}</p>
                {entry.reason ? <p>{entry.reason}</p> : null}
                <p className="text-xs text-muted-foreground">{entry.time}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
