import Link from "next/link";
import { notFound } from "next/navigation";

import { PrintLabelButton } from "@/app/items/print-label-button";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

export default async function ItemDetailsPage({
  params,
}: {
  params: { id: string };
}) {
  const item = await prisma.item.findUnique({
    where: { id: params.id },
    include: { location: true, category: true },
  });
  if (!item) {
    notFound();
  }

  const lowStock = item.quantity <= item.threshold;

  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">Item details</p>
        <h1 className="text-2xl font-semibold tracking-tight">{item.name}</h1>
        <p className="text-sm text-muted-foreground">{item.sku}</p>
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

      <PrintLabelButton
        item={{ name: item.name, sku: item.sku, qrCodeData: item.qrCodeData }}
      />

      <Button asChild variant="secondary" className="h-12">
        <Link href="/items">Back to items</Link>
      </Button>
    </div>
  );
}
