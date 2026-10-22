"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { AddItemButton } from "@/app/items/add-item-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const sorts = {
  name: "Name",
  sku: "SKU",
  quantity: "Quantity",
  location: "Location",
} as const;

type SortKey = keyof typeof sorts;

export type CatalogItem = {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  threshold: number;
  locationName: string;
  categoryId: string;
  categoryName: string;
  qrCodeData: string;
  isManualOos: boolean;
};

export function ItemCatalog({
  items,
  categories,
  locations = [],
  initialQuery = "",
  canEdit = false,
}: {
  items: CatalogItem[];
  categories: { id: string; name: string }[];
  locations?: { id: string; name: string }[];
  initialQuery?: string;
  canEdit?: boolean;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [categoryId, setCategoryId] = useState("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = items.filter((item) => {
      const matchesCategory = categoryId === "all" || item.categoryId === categoryId;
      const matchesText =
        needle.length === 0 ||
        item.name.toLowerCase().includes(needle) ||
        item.sku.toLowerCase().includes(needle);
      return matchesCategory && matchesText;
    });
    const factor = direction === "asc" ? 1 : -1;
    return filtered.sort((left, right) => {
      if (sort === "quantity") {
        return (left.quantity - right.quantity) * factor;
      }
      const leftValue =
        sort === "sku" ? left.sku : sort === "location" ? left.locationName : left.name;
      const rightValue =
        sort === "sku" ? right.sku : sort === "location" ? right.locationName : right.name;
      return leftValue.localeCompare(rightValue) * factor;
    });
  }, [categoryId, direction, items, query, sort]);

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-30 -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <Label htmlFor="item-search" className="sr-only">
            Search by name or SKU
          </Label>
          <Input
            id="item-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name or SKU"
            autoCapitalize="none"
            autoCorrect="off"
            className="h-10"
          />
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="h-10 w-36 shrink-0" aria-label="Category">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canEdit ? <AddItemButton locations={locations} categories={categories} /> : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="sort">Sort</Label>
          <select
            id="sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
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
            value={direction}
            onChange={(event) => setDirection(event.target.value === "desc" ? "desc" : "asc")}
            className="h-12 rounded-md border border-input bg-transparent px-3 text-base"
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {query.trim() || categoryId !== "all"
            ? "No items match this search."
            : "Nothing stocked yet. Add an item to generate its QR code."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((item) => {
            const lowStock = !item.isManualOos && item.quantity <= item.threshold;
            return (
              <li
                key={item.id}
                className={cn(
                  "rounded-xl border bg-card p-4 shadow-sm",
                  item.isManualOos && "border-zinc-300 bg-zinc-100 text-zinc-500",
                  lowStock && "border-red-600 bg-red-50"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2
                      className={cn(
                        "text-base font-semibold",
                        item.isManualOos && "text-zinc-600",
                        lowStock && "text-red-800"
                      )}
                    >
                      {item.name}
                    </h2>
                    <p
                      className={cn(
                        "text-sm text-muted-foreground",
                        item.isManualOos && "text-zinc-500",
                        lowStock && "text-red-700"
                      )}
                    >
                      {item.sku}
                    </p>
                  </div>
                  <p
                    className={cn(
                      "text-2xl font-semibold tabular-nums",
                      item.isManualOos && "text-zinc-500",
                      lowStock && "text-red-700"
                    )}
                  >
                    {item.quantity}
                  </p>
                </div>
                {item.isManualOos ? (
                  <p className="mt-3">
                    <span className="inline-flex rounded-md bg-red-600 px-2.5 py-1 text-xs font-bold tracking-wide text-white">
                      OUT OF STOCK
                    </span>
                  </p>
                ) : lowStock ? (
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
                    <dd className={lowStock ? "text-red-950" : undefined}>{item.locationName}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className={lowStock ? "text-red-800" : "text-muted-foreground"}>
                      Category
                    </dt>
                    <dd className={lowStock ? "text-red-950" : undefined}>{item.categoryName}</dd>
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
                <div className={cn("mt-4 grid gap-2", canEdit && "grid-cols-2")}>
                  {canEdit ? (
                    <Button asChild variant="outline" className="h-12">
                      <Link href={`/items/${item.id}/edit`}>Edit</Link>
                    </Button>
                  ) : null}
                  <Button asChild variant="secondary" className="h-12">
                    <Link href={`/items/${item.id}`}>Details</Link>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
