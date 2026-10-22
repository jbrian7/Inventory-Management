import { AddItemForm } from "@/app/items/add-item-form";
import { ItemCatalog } from "@/app/items/item-catalog";
import { TopMovers } from "@/app/items/top-movers";
import { prisma } from "@/lib/prisma";

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const [items, categories] = await Promise.all([
    prisma.item.findMany({
      include: { location: true, category: true },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

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
        items={items.map((item) => ({
          id: item.id,
          name: item.name,
          sku: item.sku,
          quantity: item.quantity,
          threshold: item.threshold,
          locationName: item.location.name,
          categoryId: item.categoryId,
          categoryName: item.category.name,
          qrCodeData: item.qrCodeData,
          isManualOos: item.isManualOos,
        }))}
      />

      <AddItemForm categories={categories} />
    </div>
  );
}
