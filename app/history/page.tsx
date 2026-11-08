import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCurrentUser } from "@/lib/current-user";
import {
  filtersActive,
  firstParam,
  historyAccessError,
  historyEmptyMessage,
  historyHref,
  loadHistory,
  parseHistoryQuery,
} from "@/lib/history-query";
import { actionFilterLabels, stockActions } from "@/lib/movement";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const selectClass = "h-12 w-full rounded-md border border-input bg-transparent px-3 text-base";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: {
    item?: string | string[];
    action?: string | string[];
    staff?: string | string[];
    from?: string | string[];
    to?: string | string[];
    page?: string | string[];
  };
}) {
  const user = await getCurrentUser();
  const denied = historyAccessError(user);
  if (denied) {
    return (
      <div className="flex flex-col gap-3" role="alert">
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="text-sm text-muted-foreground">{denied}</p>
      </div>
    );
  }

  const query = parseHistoryQuery({
    item: firstParam(searchParams.item),
    action: firstParam(searchParams.action),
    staff: firstParam(searchParams.staff),
    from: firstParam(searchParams.from),
    to: firstParam(searchParams.to),
    page: firstParam(searchParams.page),
  });
  const [items, staff, result] = await Promise.all([
    prisma.item.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({
      select: { id: true, name: true, active: true },
      orderBy: { name: "asc" },
    }),
    query.error ? Promise.resolve(null) : loadHistory(query),
  ]);
  const active = filtersActive(query);

  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="text-sm text-muted-foreground">
          Stock movements, newest first. Dates use Eastern Time.
        </p>
      </header>

      <form method="get" className="grid gap-3 tablet:grid-cols-2 xl:!grid-cols-3" aria-label="Filter movements">
        <div className="flex flex-col gap-2">
          <Label htmlFor="history-item">Item</Label>
          <select id="history-item" name="item" defaultValue={query.itemId} className={selectClass}>
            <option value="">All items</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="history-action">Action</Label>
          <select
            id="history-action"
            name="action"
            defaultValue={query.action}
            className={selectClass}
          >
            <option value="">All actions</option>
            {stockActions.map((action) => (
              <option key={action} value={action}>
                {actionFilterLabels[action]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="history-staff">Staff</Label>
          <select id="history-staff" name="staff" defaultValue={query.staff} className={selectClass}>
            <option value="">All staff</option>
            <option value="unknown">Unknown</option>
            {staff.map((person) => (
              <option key={person.id} value={person.id}>
                {person.active ? person.name : `${person.name} (inactive)`}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3 tablet:col-span-2 xl:!col-span-1">
          <div className="flex flex-col gap-2">
            <Label htmlFor="history-from">From</Label>
            <Input
              id="history-from"
              name="from"
              type="date"
              defaultValue={query.from}
              className="h-12"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="history-to">To</Label>
            <Input id="history-to" name="to" type="date" defaultValue={query.to} className="h-12" />
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row tablet:col-span-2 xl:!col-span-3">
          <Button type="submit" className="h-12 sm:min-w-40">
            Apply filters
          </Button>
          {active ? (
            <Button asChild variant="secondary" className="h-12 sm:min-w-40">
              <Link href="/history">Clear filters</Link>
            </Button>
          ) : null}
        </div>
      </form>

      {query.error ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {query.error}
        </p>
      ) : null}

      {result && result.total === 0 ? (
        <p className="text-sm text-muted-foreground">{historyEmptyMessage(active)}</p>
      ) : null}

      {result && result.rows.length > 0 ? (
        <>
          <p className="text-sm text-muted-foreground">
            {result.window.start}–{result.window.end} of {result.total}
          </p>
          <div className="hidden overflow-x-auto rounded-xl border tablet:!block">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption className="sr-only">Stock movements</caption>
              <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-3 font-medium">Item</th>
                  <th scope="col" className="px-3 py-3 font-medium">Action</th>
                  <th scope="col" className="px-3 py-3 font-medium">Change</th>
                  <th scope="col" className="px-3 py-3 font-medium">Staff</th>
                  <th scope="col" className="px-3 py-3 font-medium">When</th>
                  <th scope="col" className="px-3 py-3 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((entry) => (
                  <tr key={entry.id} className="border-b last:border-b-0">
                    <th scope="row" className="px-3 py-3 font-medium">
                      {entry.itemId ? (
                        <Link href={`/items/${entry.itemId}`} className="underline-offset-2 hover:underline">
                          {entry.itemName}
                        </Link>
                      ) : (
                        entry.itemName
                      )}
                    </th>
                    <td className="px-3 py-3">{entry.title}</td>
                    <td className="px-3 py-3">{entry.quantityLine}</td>
                    <td className="px-3 py-3">{entry.actor}</td>
                    <td className="px-3 py-3">{entry.time}</td>
                    <td className="px-3 py-3">{entry.reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="rounded-xl border bg-card px-4 tablet:!hidden">
            {result.rows.map((entry) => (
              <li key={entry.id} className="border-b py-3 text-sm last:border-b-0">
                <div className="flex items-baseline justify-between gap-3">
                  {entry.itemId ? (
                    <Link href={`/items/${entry.itemId}`} className="font-medium">
                      {entry.itemName}
                    </Link>
                  ) : (
                    <p className="font-medium">{entry.itemName}</p>
                  )}
                  <p className="text-muted-foreground">{entry.actor}</p>
                </div>
                <p>{entry.sentence ?? entry.title}</p>
                <p className="text-muted-foreground">{entry.quantityLine}</p>
                {entry.reason ? <p>{entry.reason}</p> : null}
                <p className="text-xs text-muted-foreground">{entry.time}</p>
              </li>
            ))}
          </ul>
          {result.window.pages > 1 ? (
            <nav aria-label="History pages" className="grid grid-cols-2 gap-3">
              {result.window.current > 1 ? (
                <Button asChild variant="secondary" className="h-12">
                  <Link href={historyHref(query, result.window.current - 1)}>Previous</Link>
                </Button>
              ) : (
                <span />
              )}
              {result.window.current < result.window.pages ? (
                <Button asChild className="h-12">
                  <Link href={historyHref(query, result.window.current + 1)}>Next</Link>
                </Button>
              ) : null}
            </nav>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
