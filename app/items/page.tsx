import Link from "next/link";

import { AddItemForm } from "@/app/items/add-item-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

const sorts = {
  name: "Name",
  sku: "SKU",
  quantity: "Quantity",
  location: "Location",
} as const;

type SortKey = keyof typeof sorts;

function sortKey(value: string | undefined): SortKey {
  if (value && value in sorts) {
    return value as SortKey;
  }
  return "name";
}

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: { q?: string; sort?: string; dir?: string };
}) {
  const query = searchParams.q?.trim() ?? "";
  const sort = sortKey(searchParams.sort);
  const direction = searchParams.dir === "desc" ? "desc" : "asc";
  const items = await prisma.item.findMany({
    orderBy: { [sort]: direction },
  });
  const needle = query.toLowerCase();
  const visible = needle
    ? items.filter((item) =>
        [item.name, item.sku, item.location, item.qrCodeData, item.description ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(needle)
      )
    : items;

  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Items</h1>
        <p className="text-sm text-muted-foreground">
          Novelties, prizes, and arcade parts.
        </p>
      </header>

      <AddItemForm />

      <form action="/items" className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="q">Search</Label>
          <Input
            id="q"
            name="q"
            defaultValue={query}
            placeholder="Name, SKU, location, or QR code"
            className="h-12"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="sort">Sort</Label>
            <select
              id="sort"
              name="sort"
              defaultValue={sort}
              className="h-12 rounded-md border border-input bg-transparent px-3 text-base"
            >
              {Object.entries(sorts).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="dir">Order</Label>
            <select
              id="dir"
              name="dir"
              defaultValue={direction}
              className="h-12 rounded-md border border-input bg-transparent px-3 text-base"
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>
        </div>
        <Button type="submit" variant="secondary" className="h-12">
          Apply
        </Button>
      </form>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {query
            ? `No items match “${query}”.`
            : "Nothing stocked yet. Add an item to generate its QR code."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((item) => {
            const lowStock = item.quantity <= item.threshold;
            return (
              <li
                key={item.id}
                className={cn(
                  "rounded-xl border bg-card p-4 shadow-sm",
                  lowStock && "border-red-600 bg-red-50"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2
                      className={cn(
                        "text-base font-semibold",
                        lowStock && "text-red-800"
                      )}
                    >
                      {item.name}
                    </h2>
                    <p
                      className={cn(
                        "text-sm text-muted-foreground",
                        lowStock && "text-red-700"
                      )}
                    >
                      {item.sku}
                    </p>
                  </div>
                  <p
                    className={cn(
                      "text-2xl font-semibold tabular-nums",
                      lowStock && "text-red-700"
                    )}
                  >
                    {item.quantity}
                  </p>
                </div>
                {lowStock ? (
                  <p className="mt-2 text-sm font-medium text-red-700">
                    Low stock · threshold {item.threshold}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Threshold {item.threshold}
                  </p>
                )}
                <dl className="mt-3 grid gap-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className={lowStock ? "text-red-800" : "text-muted-foreground"}>
                      Location
                    </dt>
                    <dd className={lowStock ? "text-red-950" : undefined}>
                      {item.location}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className={lowStock ? "text-red-800" : "text-muted-foreground"}>
                      QR code
                    </dt>
                    <dd
                      className={cn(
                        "break-all text-right font-mono text-xs",
                        lowStock && "text-red-950"
                      )}
                    >
                      {item.qrCodeData}
                    </dd>
                  </div>
                </dl>
                <Button asChild variant="secondary" className="mt-4 h-12 w-full">
                  <Link href={`/items/${item.id}`}>Details</Link>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
