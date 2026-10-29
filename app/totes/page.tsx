import Link from "next/link";

import { ToteForm } from "@/app/totes/tote-form";
import { Button } from "@/components/ui/button";
import { totalQuantity } from "@/lib/balances";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { canEditInventory, canExportReports } from "@/lib/roles";

export default async function TotesPage({ searchParams }: { searchParams: { q?: string } }) {
  const user = await getCurrentUser();
  const canEdit = user ? canEditInventory(user.role) : false;
  const canExport = user ? canExportReports(user.role) : false;
  const query = searchParams.q?.trim() ?? "";
  const totes = await prisma.tote.findMany({
    where: query
      ? {
          OR: [
            { name: { contains: query } },
            { storageLabel: { contains: query } },
          ],
        }
      : undefined,
    include: { location: { include: { balances: { select: { quantity: true } } } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Totes</h1>
        <p className="text-sm text-muted-foreground">Each tote has its own location. Scan its public label to see what is inside.</p>
      </header>
      <form method="get" className="flex flex-col gap-3 tablet:flex-row">
        <label className="sr-only" htmlFor="tote-search">
          Find a tote
        </label>
        <input
          id="tote-search"
          name="q"
          defaultValue={query}
          placeholder="Name or shelf"
          className="h-12 flex-1 rounded-md border border-input bg-transparent px-3 text-base"
        />
        <Button type="submit" className="h-12 tablet:w-40">
          Search
        </Button>
      </form>
      {canExport ? (
        <Button asChild variant="secondary" className="h-12">
          <Link href="/reports">Download reports</Link>
        </Button>
      ) : null}
      {canEdit ? <ToteForm /> : null}
      {totes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{query ? "No totes match this search." : "No totes yet."}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {totes.map((tote) => {
            const pieces = totalQuantity(tote.location.balances);
            return (
              <li key={tote.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{tote.name}</h2>
                    <p className="text-sm text-muted-foreground">{tote.storageLabel || "No shelf label"}</p>
                  </div>
                  <p className="text-2xl font-semibold tabular-nums">{pieces}</p>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {tote.publicEnabled ? "Public link on" : "Public link off"}
                </p>
                <Button asChild className="mt-3 h-12">
                  <Link href={`/totes/${tote.id}`}>Open</Link>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
