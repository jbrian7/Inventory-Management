import Link from "next/link";
import { redirect } from "next/navigation";

import { IntakeSession } from "@/app/intake/intake-session";
import { Button } from "@/components/ui/button";
import { totalQuantity } from "@/lib/balances";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { canEditInventory } from "@/lib/roles";
import { scanAccessError } from "@/lib/access";
import { usingSheets } from "@/lib/storage/backend";

export default async function IntakePage({
  searchParams,
}: {
  searchParams: { location?: string; mode?: string };
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (scanAccessError(user)) {
    return <p className="text-sm text-muted-foreground">Scanning is turned off for this account.</p>;
  }
  const sheet = usingSheets() ? await (await import("@/lib/storage/sheets-stock")).readSheetWorkspace() : null;
  const [items, locations, totes] = sheet
    ? [sheet.items, sheet.locations, sheet.totes]
    : await Promise.all([
    prisma.item.findMany({
      where: { archivedAt: null },
      include: { balances: { select: { quantity: true, locationId: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.location.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.tote.findMany({ select: { name: true, locationId: true }, orderBy: { name: "asc" } }),
  ]);
  const mode = searchParams.mode === "remove" || searchParams.mode === "move" ? searchParams.mode : "add";
  const locationId = locations.some((place) => place.id === searchParams.location) ? searchParams.location ?? "" : locations[0]?.id ?? "";

  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">Receive</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {mode === "remove" ? "Remove contents" : mode === "move" ? "Move contents" : "Add contents"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Search for a product or add a new one, then save the whole list at once.
        </p>
      </header>
      <IntakeSession
        mode={mode}
        canCreate={canEditInventory(user.role)}
        locationId={locationId}
        places={locations.map((place) => ({
          id: place.id,
          name: totes.find((tote) => tote.locationId === place.id)?.name ?? place.name,
        }))}
        products={items.map((item) => ({
          id: item.id,
          name: item.name,
          sku: item.sku,
          barcode: item.barcode,
          quantity: totalQuantity(item.balances),
          byLocation: Object.fromEntries(item.balances.map((balance) => [balance.locationId, balance.quantity])),
        }))}
      />
      <Button asChild variant="secondary" className="h-12">
        <Link href="/items">Back to items</Link>
      </Button>
    </div>
  );
}
