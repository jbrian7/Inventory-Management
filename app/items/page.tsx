import { ItemCatalog } from "@/app/items/item-catalog";
import { TopMovers } from "@/app/items/top-movers";
import { archiveDepletedAction } from "@/app/items/lifecycle-actions";
import { balancesFromRows, locationSummary, totalQuantity } from "@/lib/balances";
import { lifecycleOf } from "@/lib/lifecycle";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { canEditInventory } from "@/lib/roles";
import { usingSheets } from "@/lib/storage/backend";

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const user = await getCurrentUser();
  if (usingSheets()) {
    const { readSheetWorkspace } = await import("@/lib/storage/sheets-stock");
    const sheet = await readSheetWorkspace();
    const canEdit = user ? canEditInventory(user.role) : false;
    return (
      <div className="flex flex-col gap-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Items</h1>
          <p className="text-sm text-muted-foreground">Novelties, prizes, and arcade parts.</p>
        </header>
        {canEdit ? (
          <form action={archiveDepletedAction}>
            <button type="submit" className="h-12 rounded-md border px-4 text-sm font-medium">
              Archive all depleted
            </button>
          </form>
        ) : null}
        <ItemCatalog
          initialQuery={searchParams.q?.trim() ?? ""}
          categories={sheet.categories}
          items={sheet.items.map((item) => ({
            id: item.id,
            name: item.name,
            sku: item.sku,
            quantity: item.quantity,
            threshold: item.threshold,
            locationName: locationSummary(item.balances),
            locationNames: item.balances.map((balance) => balance.name),
            categoryId: item.categoryId,
            categoryName: item.categoryName,
            qrCodeData: item.qrCodeData,
            isManualOos: item.isManualOos,
            lifecycle: item.lifecycle,
          }))}
          canEdit={canEdit}
          locations={sheet.locations}
        />
      </div>
    );
  }
  const [items, categories, locations] = await Promise.all([
    prisma.item.findMany({
      include: { category: true, balances: { include: { location: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.location.findMany({ orderBy: { name: "asc" } }),
  ]);
  const canEdit = user ? canEditInventory(user.role) : false;

  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Items</h1>
        <p className="text-sm text-muted-foreground">
          Novelties, prizes, and arcade parts.
        </p>
      </header>

      <TopMovers />
      {canEdit ? (
        <form action={archiveDepletedAction}>
          <button type="submit" className="h-12 rounded-md border px-4 text-sm font-medium">
            Archive all depleted
          </button>
        </form>
      ) : null}

      <ItemCatalog
        initialQuery={searchParams.q?.trim() ?? ""}
        categories={categories.map((category) => ({ id: category.id, name: category.name }))}
        items={items.map((item) => {
          const balances = balancesFromRows(item.balances);
          return {
          id: item.id,
          name: item.name,
          sku: item.sku,
          quantity: totalQuantity(balances),
          threshold: item.threshold,
          locationName: locationSummary(balances),
          locationNames: balances.map((balance) => balance.name),
          categoryId: item.categoryId,
          categoryName: item.category.name,
          qrCodeData: item.qrCodeData,
          isManualOos: item.isManualOos,
          lifecycle: lifecycleOf({ archivedAt: item.archivedAt, quantity: totalQuantity(balances) }),
          };
        })}
        canEdit={canEdit}
        locations={locations}
      />
    </div>
  );
}
