import { ItemCatalog } from "@/app/items/item-catalog";
import { TopMovers } from "@/app/items/top-movers";
import { balancesFromRows, locationSummary, totalQuantity } from "@/lib/balances";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { canEditInventory } from "@/lib/roles";

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const [user, items, categories, locations] = await Promise.all([
    getCurrentUser(),
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
          };
        })}
        canEdit={canEdit}
        locations={locations}
      />
    </div>
  );
}
