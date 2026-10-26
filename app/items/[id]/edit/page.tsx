import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EditItemForm } from "@/app/items/edit-item-form";
import { Button } from "@/components/ui/button";
import { totalQuantity } from "@/lib/balances";
import { getCurrentUser } from "@/lib/current-user";
import { toDateInput } from "@/lib/item-dates";
import { prisma } from "@/lib/prisma";
import { canEditInventory } from "@/lib/roles";

export default async function EditItemPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  if (!user || !canEditInventory(user.role)) {
    redirect(`/items/${params.id}`);
  }

  const [item, categories] = await Promise.all([
    prisma.item.findUnique({
      where: { id: params.id },
      include: { balances: { select: { quantity: true } } },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!item) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">Edit item</p>
        <h1 className="text-2xl font-semibold tracking-tight">{item.name}</h1>
        <p className="text-sm text-muted-foreground">{item.sku}</p>
      </header>
      <EditItemForm
        categories={categories}
        defaults={{
          id: item.id,
          name: item.name,
          sku: item.sku,
          description: item.description ?? "",
          quantity: totalQuantity(item.balances),
          threshold: item.threshold,
          locationId: "",
          categoryId: item.categoryId,
          receivedAt: toDateInput(item.receivedAt),
          outOfStockAt: toDateInput(item.outOfStockAt),
          isManualOos: item.isManualOos,
        }}
      />
      <Button asChild variant="secondary" className="h-12">
        <Link href={`/items/${item.id}`}>Back to details</Link>
      </Button>
    </div>
  );
}
