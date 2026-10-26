import Link from "next/link";
import { notFound } from "next/navigation";

import { PrintLabelButton } from "@/app/items/print-label-button";
import { StockCorrection } from "@/app/items/stock-correction";
import { TransferForm } from "@/app/items/transfer-form";
import { Button } from "@/components/ui/button";
import { locationSummary, totalQuantity } from "@/lib/balances";
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
import { scanAccessError } from "@/lib/access";
import { cn } from "@/lib/utils";

export default async function ItemDetailsPage({
  params,
}: {
  params: { id: string };
}) {
  const [user, item, places, movements] = await Promise.all([
    getCurrentUser(),
    prisma.item.findUnique({
      where: { id: params.id },
      include: { category: true, balances: { include: { location: true } } },
    }),
    prisma.location.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
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
  const canTransfer = user ? scanAccessError(user) === null : false;
  const balances = item.balances
    .map((balance) => ({
      locationId: balance.locationId,
      name: balance.location.name,
      quantity: balance.quantity,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const quantity = totalQuantity(balances);
  const lowStock = !item.isManualOos && quantity <= item.threshold;
  const shownPlaces = places.map((place) => {
    const balance = balances.find((row) => row.locationId === place.id);
    return { locationId: place.id, name: place.name, quantity: balance?.quantity ?? 0 };
  });
  const received = formatItemDate(item.receivedAt);
  const outOfStock = formatItemDate(item.outOfStockAt);

  return (
    <div className="grid items-start gap-6 tablet:grid-cols-2">
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
          <dt className="text-muted-foreground">Total inventory</dt>
          <dd
            className={cn(
              "text-3xl font-semibold tabular-nums",
              lowStock && "text-red-700"
            )}
          >
            {quantity}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Threshold</dt>
          <dd>{item.threshold}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Locations</dt>
          <dd>{locationSummary(balances)}</dd>
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

      <section aria-label="Location balances" className="rounded-xl border bg-card">
        <h2 className="border-b px-4 py-3 text-base font-semibold">By location</h2>
        <ul>
          {shownPlaces.map((place) => (
            <li key={place.locationId} className="flex items-baseline justify-between gap-3 border-b px-4 py-3 text-sm last:border-b-0">
              <span>{place.name}</span>
              <span className="text-lg font-semibold tabular-nums">{place.quantity}</span>
            </li>
          ))}
        </ul>
      </section>

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

      {canTransfer ? (
        <TransferForm itemId={item.id} itemName={item.name} places={places} balances={balances} />
      ) : null}

      {canEdit ? <StockCorrection itemId={item.id} locations={balances} /> : null}

      <PrintLabelButton itemId={item.id} />

      <Button asChild variant="secondary" className="h-12">
        <Link href="/items">Back to items</Link>
      </Button>
      </div>

      <section className="flex flex-col gap-2" aria-label="Movements">
        <h2 className="text-base font-semibold">Movements</h2>
        {movements.length === 0 ? (
          <p className="text-sm text-muted-foreground">No movements yet.</p>
        ) : (
          <ul className="rounded-xl border bg-card px-4">
            {movements.map((entry) => (
              <li key={entry.id} className="border-b py-3 text-sm last:border-b-0">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium">
                    {entry.action === "TRANSFER"
                      ? `${movementActorLabel(entry)} transferred ${entry.amount} ${item.name}`
                      : movementTitle(entry)}
                  </p>
                  {entry.action === "TRANSFER" ? null : (
                    <p className="text-muted-foreground">{movementActorLabel(entry)}</p>
                  )}
                </div>
                <p className="text-muted-foreground">{movementQuantityLine(entry)}</p>
                {entry.reason ? <p>{entry.reason}</p> : null}
                <p className="text-xs text-muted-foreground">{formatMovementTime(entry.timestamp)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
