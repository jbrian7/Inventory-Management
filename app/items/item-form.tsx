"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { type ItemFormState } from "@/app/items/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { todayDateInput } from "@/lib/item-dates";

export type ItemFormDefaults = {
  id?: string;
  name: string;
  sku: string;
  description: string;
  quantity: number;
  threshold: number;
  locationId: string;
  categoryId: string;
  receivedAt: string;
  outOfStockAt: string;
  isManualOos: boolean;
};

const selectClass =
  "h-12 w-full rounded-md border border-input bg-transparent px-3 text-base";

export function ItemForm({
  action,
  state,
  defaults,
  locations,
  categories,
  submitLabel,
  lockQuantity = false,
  includeLocation = true,
}: {
  action: (payload: FormData) => void;
  state: ItemFormState;
  defaults: ItemFormDefaults;
  locations: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  submitLabel: string;
  lockQuantity?: boolean;
  includeLocation?: boolean;
}) {
  const [receivedAt, setReceivedAt] = useState(defaults.receivedAt);
  const [outOfStockAt, setOutOfStockAt] = useState(defaults.outOfStockAt);
  const [manualOos, setManualOos] = useState(defaults.isManualOos);
  const [requestId] = useState(() => crypto.randomUUID());
  const ready = categories.length > 0 && (!includeLocation || locations.length > 0);

  function onManualOos(checked: boolean) {
    setManualOos(checked);
    setOutOfStockAt(checked ? todayDateInput() : "");
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="isManualOos" value={manualOos ? "true" : "false"} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required defaultValue={defaults.name} className="h-12" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="sku">SKU</Label>
        <Input id="sku" name="sku" required defaultValue={defaults.sku} className="h-12" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          name="description"
          defaultValue={defaults.description}
          className="h-12"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="quantity">{lockQuantity ? "Total on hand" : "Opening quantity"}</Label>
          {lockQuantity ? (
            <p id="quantity" className="flex h-12 items-center text-2xl font-semibold tabular-nums">
              {defaults.quantity}
            </p>
          ) : (
            <Input
              id="quantity"
              name="quantity"
              type="number"
              min={0}
              step={1}
              required
              defaultValue={defaults.quantity}
              className="h-12"
            />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="threshold">Low-stock threshold</Label>
          <Input
            id="threshold"
            name="threshold"
            type="number"
            min={0}
            step={1}
            required
            defaultValue={defaults.threshold}
            className="h-12"
          />
        </div>
      </div>
      {includeLocation ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="locationId">Opening location</Label>
          <select
            id="locationId"
            name="locationId"
            required
            defaultValue={defaults.locationId}
            disabled={locations.length === 0}
            className={selectClass}
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="categoryId">Category</Label>
        <select
          id="categoryId"
          name="categoryId"
          required
          defaultValue={defaults.categoryId}
          disabled={categories.length === 0}
          className={selectClass}
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="receivedAt">Received</Label>
          <Input
            id="receivedAt"
            name="receivedAt"
            type="date"
            required
            value={receivedAt}
            onChange={(event) => setReceivedAt(event.target.value)}
            className="h-12"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="outOfStockAt">Out of stock</Label>
          <Input
            id="outOfStockAt"
            name="outOfStockAt"
            type="date"
            value={outOfStockAt}
            onChange={(event) => setOutOfStockAt(event.target.value)}
            className="h-12"
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-4">
        <div className="space-y-1">
          <Label htmlFor="manual-oos" className="text-base text-red-950">
            Manual out of stock
          </Label>
          <p className="text-sm text-red-800">Sets the out-of-stock date to today.</p>
        </div>
        <Switch
          id="manual-oos"
          checked={manualOos}
          onCheckedChange={onManualOos}
          aria-label="Manual out of stock"
        />
      </div>
      {!ready ? (
        <p className="text-sm text-muted-foreground">
          Add a location and a category in Settings before saving an item.
        </p>
      ) : null}
      {state.error ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <SubmitButton label={submitLabel} disabled={!ready} />
    </form>
  );
}

function SubmitButton({ label, disabled }: { label: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="h-12 w-full" disabled={disabled || pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}
