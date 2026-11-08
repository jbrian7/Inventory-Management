import Link from "next/link";

import { totalQuantity } from "@/lib/balances";
import { lifecycleOf } from "@/lib/lifecycle";
import { prisma } from "@/lib/prisma";

const windowDays = 30;

export async function FastInventory() {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const [items, received, totes] = await Promise.all([
    prisma.item.findMany({
      include: {
        balances: { select: { quantity: true } },
        History: { where: { timestamp: { gte: since } }, select: { id: true }, orderBy: { timestamp: "desc" }, take: 1 },
      },
    }),
    prisma.item.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, name: true, sku: true },
    }),
    prisma.tote.findMany({
      include: { location: { include: { balances: { select: { quantity: true } } } } },
      orderBy: { name: "asc" },
      take: 5,
    }),
  ]);
  const counted = items.map((item) => ({
    ...item,
    quantity: totalQuantity(item.balances),
    status: lifecycleOf({ archivedAt: item.archivedAt, quantity: totalQuantity(item.balances) }),
    moved: item.History.length > 0,
  }));
  const counts = {
    active: counted.filter((item) => item.status === "ACTIVE").length,
    depleted: counted.filter((item) => item.status === "DEPLETED").length,
    archived: counted.filter((item) => item.status === "ARCHIVED").length,
  };
  const depleted = counted.filter((item) => item.quantity <= 0 && item.moved).slice(0, 5);
  const stale = counted.filter((item) => item.status === "ACTIVE" && !item.moved).slice(0, 5);

  return (
    <section className="flex flex-col gap-4" aria-label="Fast-moving inventory">
      <div className="grid grid-cols-3 gap-2">
        {[
          ["Active", counts.active],
          ["Depleted", counts.depleted],
          ["Archived", counts.archived],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border bg-card p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 tablet:grid-cols-2">
        <List title="Recently received" empty="No new products in 30 days." rows={received.map((item) => ({ id: item.id, name: item.name, detail: item.sku }))} />
        <List title="Recently depleted" empty="No products ran out in 30 days." rows={depleted.map((item) => ({ id: item.id, name: item.name, detail: item.status === "ARCHIVED" ? "Archived" : "0 on hand" }))} />
        <List title="No recent movement" empty="Every in-stock product moved in the last 30 days." rows={stale.map((item) => ({ id: item.id, name: item.name, detail: `${item.quantity} on hand` }))} />
        <List title="Totes" empty="No totes yet." rows={totes.map((tote) => ({ id: tote.id, href: `/totes/${tote.id}`, name: tote.name, detail: `${totalQuantity(tote.location.balances)} pieces` }))} />
      </div>
    </section>
  );
}

function List({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: { id: string; name: string; detail: string; href?: string }[];
}) {
  return (
    <section className="rounded-xl border bg-card">
      <h2 className="border-b px-4 py-3 text-base font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul>
          {rows.map((row) => (
            <li key={row.id} className="border-b px-4 py-3 text-sm last:border-b-0">
              <Link href={row.href ?? `/items/${row.id}`} className="font-medium">
                {row.name}
              </Link>
              <p className="text-muted-foreground">{row.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
