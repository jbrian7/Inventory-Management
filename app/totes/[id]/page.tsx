import Link from "next/link";
import { notFound } from "next/navigation";

import { ToteControls } from "@/app/totes/[id]/tote-controls";
import { ToteTransfer } from "@/app/totes/tote-transfer";
import { Button } from "@/components/ui/button";
import { balancesFromRows, totalQuantity } from "@/lib/balances";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { scanAccessError } from "@/lib/access";
import { canEditInventory } from "@/lib/roles";

export default async function TotePage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  const [tote, places, items] = await Promise.all([
    prisma.tote.findUnique({
      where: { id: params.id },
      include: {
        location: {
          include: {
            balances: { where: { quantity: { gt: 0 } }, include: { item: true } },
          },
        },
      },
    }),
    prisma.location.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.item.findMany({
      orderBy: { name: "asc" },
      include: { balances: { include: { location: true } } },
    }),
  ]);
  if (!tote) {
    notFound();
  }
  const canEdit = user ? canEditInventory(user.role) : false;
  const canTransfer = user ? scanAccessError(user) === null : false;
  const contents = tote.location.balances
    .map((balance) => ({ name: balance.item.name, sku: balance.item.sku, quantity: balance.quantity }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const pieces = totalQuantity(contents);

  return (
    <div className="grid items-start gap-6 tablet:grid-cols-2">
      <div className="flex flex-col gap-6">
        <header className="space-y-1">
          <p className="text-sm text-muted-foreground">Tote</p>
          <h1 className="text-2xl font-semibold tracking-tight">{tote.name}</h1>
          <p className="text-sm text-muted-foreground">{tote.storageLabel || "No shelf label"}</p>
        </header>
        <dl className="grid gap-3 rounded-xl border bg-card p-4 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">Total pieces</dt>
            <dd className="text-3xl font-semibold tabular-nums">{pieces}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Distinct items</dt>
            <dd>{contents.length}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Public link</dt>
            <dd>{tote.publicEnabled ? "On" : "Off"}</dd>
          </div>
        </dl>
        <section aria-label="Contents" className="rounded-xl border bg-card">
          <h2 className="border-b px-4 py-3 text-base font-semibold">Contents</h2>
          {contents.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">This tote is empty.</p>
          ) : (
            <ul>
              {contents.map((item) => (
                <li key={item.sku} className="flex items-baseline justify-between gap-3 border-b px-4 py-3 text-sm last:border-b-0">
                  <span>
                    <span className="font-medium">{item.name}</span>
                    <span className="mt-0.5 block text-muted-foreground">{item.sku}</span>
                  </span>
                  <span className="text-lg font-semibold tabular-nums">{item.quantity}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <Button asChild className="h-12">
          <Link href={`/totes/${tote.id}/label`}>Tote label</Link>
        </Button>
        <Button asChild variant="secondary" className="h-12">
          <Link href="/totes">Back to totes</Link>
        </Button>
      </div>
      <div className="flex flex-col gap-6">
        {canTransfer ? (
          <ToteTransfer
            toteLocationId={tote.locationId}
            places={places}
            items={items.map((item) => ({
              id: item.id,
              name: item.name,
              balances: balancesFromRows(item.balances),
            }))}
          />
        ) : null}
        {canEdit ? (
          <ToteControls
            toteId={tote.id}
            name={tote.name}
            storageLabel={tote.storageLabel ?? ""}
            publicEnabled={tote.publicEnabled}
          />
        ) : null}
      </div>
    </div>
  );
}
