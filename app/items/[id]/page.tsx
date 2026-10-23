import Link from "next/link";
import { notFound } from "next/navigation";

import { PrintLabelButton } from "@/app/items/print-label-button";
import { StockCorrection } from "@/app/items/stock-correction";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/current-user";
import { formatItemDate } from "@/lib/item-dates";
import {
  formatMovementTime,
  movementActorLabel,
  movementQuantityLine,
  movementTitle,
} from "@/lib/movement";
import { prisma } from "@/lib/prisma";
import { canEditInventory } from "@/lib/roles";
import { cn } from "@/lib/utils";

export default async function ItemDetailsPage({
  params,
}: {
  params: { id: string };
}) {
  const [user, item, movements] = await Promise.all([
    getCurrentUser(),
    prisma.item.findUnique({
      where: { id: params.id },
      include: { location: true, category: true },
    }),
    prisma.history.findMany({
      where: { itemId: params.id },
      include: { user: { select: { name: true } } },
      orderBy: { timestamp: "desc" },
      take: 30,
    }),
  ]);
  if (!item) {
    notFound();
  }

  const canEdit = user ? canEditInventory(user.role) : false;
  const lowStock = !item.isManualOos && item.quantity <= item.threshold;
  const received = formatItemDate(item.receivedAt);
  const outOfStock = formatItemDate(item.outOfStockAt);

  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">Item details</p>
        <h1 className="text-2xl font-semibold tracking-tight">{item.name}</h1>
        <p className="text-sm text-muted-foreground">{item.sku}</p>
        {item.isManualOos ? (
          <p>
            <span className="inline-flex rounded-md bg-red-600 px-2.5 py-1 text-xs font-bold tracking-wide text-white">
              OUT OF STOCK
            </span>
          </p>
        ) : null}
      </header>

      <dl className="grid gap-3 rounded-xl border bg-card p-4 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">In stock</dt>
          <dd
            className={cn(
              "text-3xl font-semibold tabular-nums",
              lowStock && "text-red-700"
            )}
          >
            {item.quantity}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Threshold</dt>
          <dd>{item.threshold}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Location</dt>
          <dd>{item.location.name}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Category</dt>
          <dd>{item.category.name}</dd>
        </div>
        {received ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Received</dt>
            <dd>{received}</dd>
          </div>
        ) : null}
        {outOfStock ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Out of stock</dt>
            <dd>{outOfStock}</dd>
          </div>
        ) : null}
        {item.description ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Description</dt>
            <dd className="text-right">{item.description}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">QR code</dt>
          <dd className="break-all text-right font-mono text-xs">{item.qrCodeData}</dd>
        </div>
      </dl>

      {lowStock ? (
        <p className="text-sm font-medium text-red-700">
          Low stock · threshold {item.threshold}
        </p>
      ) : null}

      {canEdit ? (
        <Button asChild className="h-12">
          <Link href={`/items/${item.id}/edit`}>Edit</Link>
        </Button>
      ) : null}

      {canEdit ? <StockCorrection itemId={item.id} quantity={item.quantity} /> : null}

      <section className="flex flex-col gap-2" aria-label="Movements">
        <h2 className="text-base font-semibold">Movements</h2>
        {movements.length === 0 ? (
          <p className="text-sm text-muted-foreground">No movements yet.</p>
        ) : (
          <ul className="rounded-xl border bg-card px-4">
            {movements.map((entry) => (
              <li key={entry.id} className="border-b py-3 text-sm last:border-b-0">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium">{movementTitle(entry)}</p>
                  <p className="text-muted-foreground">{movementActorLabel(entry.user)}</p>
                </div>
                <p className="text-muted-foreground">{movementQuantityLine(entry)}</p>
                {entry.reason ? <p>{entry.reason}</p> : null}
                <p className="text-xs text-muted-foreground">{formatMovementTime(entry.timestamp)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <PrintLabelButton itemId={item.id} />

      <Button asChild variant="secondary" className="h-12">
        <Link href="/items">Back to items</Link>
      </Button>
    </div>
  );
}
