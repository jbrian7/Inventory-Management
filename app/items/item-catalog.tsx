"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { AddItemButton } from "@/app/items/add-item-form";
import { archiveItemAction, restoreItemAction } from "@/app/items/lifecycle-actions";
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
  locationNames: string[];
  categoryId: string;
  categoryName: string;
  qrCodeData: string;
  isManualOos: boolean;
  lifecycle: "ACTIVE" | "DEPLETED" | "ARCHIVED";
};

const fieldClass = "h-12 rounded-md border border-input bg-transparent px-3 text-base";

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
  const [locationName, setLocationName] = useState("all");
  const [lifecycle, setLifecycle] = useState<"current" | "ACTIVE" | "DEPLETED" | "ARCHIVED" | "all">("current");
  const [sort, setSort] = useState<SortKey>("name");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");

  const locationNames = useMemo(() => {
    return Array.from(new Set(items.flatMap((item) => item.locationNames))).sort((left, right) =>
      left.localeCompare(right)
    );
  }, [items]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = items.filter((item) => {
      const matchesLifecycle =
        lifecycle === "all" ||
        (lifecycle === "current" && item.lifecycle !== "ARCHIVED") ||
        item.lifecycle === lifecycle;
      const matchesCategory = categoryId === "all" || item.categoryId === categoryId;
      const matchesLocation =
        locationName === "all" || item.locationNames.includes(locationName) || item.locationName === locationName;
      const matchesText =
        needle.length === 0 ||
        item.name.toLowerCase().includes(needle) ||
        item.sku.toLowerCase().includes(needle) ||
        item.locationName.toLowerCase().includes(needle) ||
        item.locationNames.some((name) => name.toLowerCase().includes(needle)) ||
        item.categoryName.toLowerCase().includes(needle);
      return matchesLifecycle && matchesCategory && matchesLocation && matchesText;
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
  }, [categoryId, direction, items, lifecycle, locationName, query, sort]);

  const filtering = query.trim().length > 0 || categoryId !== "all" || locationName !== "all" || lifecycle !== "current";

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-30 border-b bg-background/95 py-3 backdrop-blur">
        <div className="grid gap-3 tablet:grid-cols-2 lg:!grid-cols-4">
          <div className="flex flex-col gap-2 tablet:col-span-2 lg:col-span-2">
            <Label htmlFor="item-search">Search</Label>
            <Input
              id="item-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, SKU, location, or category"
              autoCapitalize="none"
              autoCorrect="off"
              enterKeyHint="search"
              className="h-12"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="item-lifecycle">Show</Label>
            <select
              id="item-lifecycle"
              value={lifecycle}
              onChange={(event) => setLifecycle(event.target.value as typeof lifecycle)}
              className={fieldClass}
            >
              <option value="current">Active and depleted</option>
              <option value="ACTIVE">Active</option>
              <option value="DEPLETED">Depleted</option>
              <option value="ARCHIVED">Archived</option>
              <option value="all">All</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="item-category">Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="item-category" className="h-12 text-base" aria-label="Category">
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
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="item-location">Location</Label>
            <select
              id="item-location"
              value={locationName}
              onChange={(event) => setLocationName(event.target.value)}
              className={fieldClass}
            >
              <option value="all">All locations</option>
              {locationNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sort">Sort</Label>
            <select
              id="sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              className={fieldClass}
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
              className={fieldClass}
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>
          {canEdit ? (
            <div className="flex items-end tablet:col-span-2 lg:col-span-2">
              <AddItemButton locations={locations} categories={categories} className="w-full tablet:w-auto" />
            </div>
          ) : null}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {filtering
            ? "No items match this search."
            : "Nothing stocked yet. Add an item to generate its QR code."}
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {visible.length} {visible.length === 1 ? "item" : "items"}
          </p>
          <CatalogTable items={visible} canEdit={canEdit} />
          <CatalogCards items={visible} canEdit={canEdit} />
        </>
      )}
    </div>
  );
}

function stockTone(item: CatalogItem) {
  if (item.isManualOos) {
    return "out" as const;
  }
  if (item.quantity <= item.threshold) {
    return "low" as const;
  }
  return "ok" as const;
}

function StatusText({ item }: { item: CatalogItem }) {
  if (item.lifecycle === "ARCHIVED") {
    return <span className="font-medium">Archived</span>;
  }
  if (item.lifecycle === "DEPLETED") {
    return <span className="font-medium text-red-700">Depleted</span>;
  }
  const tone = stockTone(item);
  if (tone === "out") {
    return (
      <span className="inline-flex min-h-6 items-center rounded-md bg-red-600 px-2 py-0.5 text-xs font-bold tracking-wide text-white">
        OUT OF STOCK
      </span>
    );
  }
  if (tone === "low") {
    return <span className="font-medium text-red-700">Low · threshold {item.threshold}</span>;
  }
  return <span className="text-muted-foreground">In stock · threshold {item.threshold}</span>;
}

function ItemActions({
  item,
  canEdit,
  stacked = false,
}: {
  item: CatalogItem;
  canEdit: boolean;
  stacked?: boolean;
}) {
  return (
    <div className={cn("grid gap-2", canEdit && !stacked && "grid-cols-2", stacked && "min-w-[8.5rem]")}>
      {canEdit ? (
        <Button asChild variant="outline" className="h-11 px-3">
          <Link href={`/items/${item.id}/edit`}>Edit</Link>
        </Button>
      ) : null}
      <Button asChild variant="secondary" className="h-11 px-3">
        <Link href={`/items/${item.id}`}>Details</Link>
      </Button>
      {canEdit && item.lifecycle === "DEPLETED" ? (
        <Button type="button" variant="outline" className="h-11 px-3" onClick={() => archiveItemAction(item.id)}>
          Archive
        </Button>
      ) : null}
      {canEdit && item.lifecycle === "ARCHIVED" ? (
        <Button type="button" variant="outline" className="h-11 px-3" onClick={() => restoreItemAction(item.id)}>
          Restore
        </Button>
      ) : null}
    </div>
  );
}

function CatalogTable({ items, canEdit }: { items: CatalogItem[]; canEdit: boolean }) {
  return (
    <div className="hidden overflow-x-auto rounded-xl border tablet:!block">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Inventory items</caption>
        <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-3 font-medium">Name</th>
            <th scope="col" className="hidden px-3 py-3 font-medium lg:table-cell">SKU</th>
            <th scope="col" className="px-3 py-3 font-medium">On hand</th>
            <th scope="col" className="px-3 py-3 font-medium">Status</th>
            <th scope="col" className="px-3 py-3 font-medium">Location</th>
            <th scope="col" className="hidden px-3 py-3 font-medium lg:table-cell">Category</th>
            <th scope="col" className="px-3 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const tone = stockTone(item);
            return (
              <tr
                key={item.id}
                className={cn(
                  "border-b last:border-b-0",
                  tone === "out" && "bg-zinc-100 text-zinc-600",
                  tone === "low" && "bg-red-50"
                )}
              >
                <th scope="row" className="px-3 py-3 font-semibold">
                  {item.name}
                </th>
                <td className="hidden px-3 py-3 lg:table-cell">{item.sku}</td>
                <td
                  className={cn(
                    "px-3 py-3 text-xl font-semibold tabular-nums",
                    tone === "low" && "text-red-700"
                  )}
                >
                  {item.quantity}
                </td>
                <td className="px-3 py-3">
                  <StatusText item={item} />
                </td>
                <td className="px-3 py-3">{item.locationName}</td>
                <td className="hidden px-3 py-3 lg:table-cell">{item.categoryName}</td>
                <td className="px-3 py-3 align-top">
                  <ItemActions item={item} canEdit={canEdit} stacked />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CatalogCards({ items, canEdit }: { items: CatalogItem[]; canEdit: boolean }) {
  return (
    <ul className="flex flex-col gap-3 tablet:!hidden">
      {items.map((item) => {
        const tone = stockTone(item);
        return (
          <li
            key={item.id}
            className={cn(
              "rounded-xl border bg-card p-4 shadow-sm",
              tone === "out" && "border-zinc-300 bg-zinc-100 text-zinc-500",
              tone === "low" && "border-red-600 bg-red-50"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2
                  className={cn(
                    "text-base font-semibold",
                    tone === "out" && "text-zinc-600",
                    tone === "low" && "text-red-800"
                  )}
                >
                  {item.name}
                </h2>
                <p
                  className={cn(
                    "text-sm text-muted-foreground",
                    tone === "out" && "text-zinc-500",
                    tone === "low" && "text-red-700"
                  )}
                >
                  {item.sku}
                </p>
              </div>
              <p
                className={cn(
                  "text-2xl font-semibold tabular-nums",
                  tone === "out" && "text-zinc-500",
                  tone === "low" && "text-red-700"
                )}
              >
                {item.quantity}
              </p>
            </div>
            <p className="mt-2 text-sm">
              <StatusText item={item} />
            </p>
            <dl className="mt-3 grid gap-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className={tone === "low" ? "text-red-800" : "text-muted-foreground"}>Location</dt>
                <dd className={tone === "low" ? "text-red-950" : undefined}>{item.locationName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className={tone === "low" ? "text-red-800" : "text-muted-foreground"}>Category</dt>
                <dd className={tone === "low" ? "text-red-950" : undefined}>{item.categoryName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className={tone === "low" ? "text-red-800" : "text-muted-foreground"}>QR code</dt>
                <dd className={cn("break-all text-right font-mono text-xs", tone === "low" && "text-red-950")}>
                  {item.qrCodeData}
                </dd>
              </div>
            </dl>
            <div className="mt-4">
              <ItemActions item={item} canEdit={canEdit} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
