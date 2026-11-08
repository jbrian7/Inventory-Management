import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/current-user";
import { reportAccessError } from "@/lib/reports";

const exports = [
  { href: "/reports/items", title: "Item totals", detail: "One row per catalog item, summed across locations." },
  { href: "/reports/balances", title: "Balances by location", detail: "One row per item and location." },
  { href: "/reports/totes", title: "Tote contents", detail: "Items currently in each tote. Public links are not included." },
  { href: "/reports/transfers", title: "Transfer history", detail: "Moves between locations. Staff names are not included." },
  { href: "/reports/received", title: "New products", detail: "Products created in the last 30 days." },
  { href: "/reports/lifecycle", title: "Depleted and archived", detail: "Products with no stock, and products taken out of daily use." },
  { href: "/reports/movements", title: "Recent movements", detail: "Stock changes from the last 30 days. Staff names are not included." },
  { href: "/reports/stale", title: "No recent movement", detail: "In-stock products with no movement in 30 days." },
];

export default async function ReportsPage() {
  const user = await getCurrentUser();
  const denied = reportAccessError(user);
  if (denied) {
    redirect("/?denied=reports");
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Download CSV files for Google Sheets. Importing a file does not change the inventory in this app.
        </p>
      </header>
      <ul className="flex flex-col gap-3">
        {exports.map((report) => (
          <li key={report.href} className="rounded-xl border bg-card p-4">
            <h2 className="text-base font-semibold">{report.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{report.detail}</p>
            <Button asChild className="mt-3 h-12">
              <Link href={report.href}>Download CSV</Link>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
