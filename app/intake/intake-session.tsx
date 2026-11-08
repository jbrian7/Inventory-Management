"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { submitIntake, submitMove, submitRemoval, type IntakeState } from "@/app/intake/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { queuedIntakeLines, queuedRowDetail } from "@/lib/intake-lines";
import { suggestProducts } from "@/lib/product-match";
import { nextTransferRequestId } from "@/lib/transfer-request";

type Product = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  quantity: number;
  byLocation: Record<string, number>;
};

type Place = { id: string; name: string };

type Row = {
  key: string;
  itemId: string | null;
  createNew: boolean;
  name: string;
  quantity: string;
  locationId: string;
  toLocationId: string;
  categoryName: string;
  description: string;
  barcode: string;
};

export function IntakeSession({
  mode,
  canCreate,
  locationId,
  places,
  products,
}: {
  mode: "add" | "remove" | "move";
  canCreate: boolean;
  locationId: string;
  places: Place[];
  products: Product[];
}) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [quantity, setQuantity] = useState("1");
  const [placeId, setPlaceId] = useState(locationId);
  const [toPlaceId, setToPlaceId] = useState(places.find((place) => place.id !== locationId)?.id ?? "");
  const [categoryName, setCategoryName] = useState("");
  const [description, setDescription] = useState("");
  const [barcode, setBarcode] = useState("");
  const [state, setState] = useState<IntakeState>({});
  const [confirming, setConfirming] = useState(false);
  const retryId = useRef<string | null>(null);
  const submitting = useRef(false);
  const matches = suggestProducts(products, query);
  const here = mode === "remove" || mode === "move" ? placeId : "";
  const stockedHere = products.filter((product) => (product.byLocation[placeId] ?? 0) > 0);

  function addExisting(product: Product) {
    setRows((current) => [
      ...current,
      {
        key: `${product.id}-${current.length}`,
        itemId: product.id,
        createNew: false,
        name: product.name,
        quantity,
        locationId: placeId,
        toLocationId: toPlaceId,
        categoryName: "",
        description: "",
        barcode: "",
      },
    ]);
    setQuery("");
    setConfirming(false);
  }

  function addNew() {
    const name = query.trim();
    if (!name) {
      return;
    }
    setRows((current) => [
      ...current,
      {
        key: `new-${current.length}-${name}`,
        itemId: null,
        createNew: true,
        name,
        quantity,
        locationId: placeId,
        toLocationId: toPlaceId,
        categoryName,
        description,
        barcode,
      },
    ]);
    setQuery("");
    setCategoryName("");
    setDescription("");
    setBarcode("");
    setConfirming(false);
  }

  async function onSubmit() {
    if (submitting.current || rows.length === 0) {
      return;
    }
    submitting.current = true;
    const requestId = nextTransferRequestId(retryId.current);
    const formData = new FormData();
    formData.set("requestId", requestId);
    formData.set(
      "lines",
      JSON.stringify(
        queuedIntakeLines(rows)
      )
    );
    try {
      const result =
        mode === "remove" ? await submitRemoval({}, formData) : mode === "move" ? await submitMove({}, formData) : await submitIntake({}, formData);
      retryId.current = null;
      setState(result);
      if (result.saved) {
        setRows([]);
        setConfirming(false);
      }
    } catch {
      retryId.current = requestId;
      setState({ error: "The save did not finish. Submit it again." });
    } finally {
      submitting.current = false;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 tablet:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="intake-place">{mode === "add" ? "Put stock in" : "From"}</Label>
          <select id="intake-place" className="h-12 rounded-md border border-input bg-transparent px-3 text-base" value={placeId} onChange={(event) => setPlaceId(event.target.value)}>
            {places.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </select>
        </div>
        {mode === "move" ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="intake-to">To</Label>
            <select id="intake-to" className="h-12 rounded-md border border-input bg-transparent px-3 text-base" value={toPlaceId} onChange={(event) => setToPlaceId(event.target.value)}>
              {places.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="flex flex-col gap-2">
          <Label htmlFor="intake-qty">Quantity</Label>
          <Input id="intake-qty" inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="h-12" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="intake-search">Product</Label>
        <Input id="intake-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, SKU, or barcode" className="h-12" />
      </div>
      {matches.length > 0 ? (
        <ul className="rounded-xl border bg-card">
          {matches.map((product) => (
            <li key={product.id} className="flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0">
              <span>
                <span className="font-medium">{product.name}</span>
                <span className="block text-sm text-muted-foreground">
                  {product.sku} · {mode === "add" ? product.quantity : product.byLocation[placeId] ?? 0} on hand
                </span>
              </span>
              <Button type="button" className="h-11" onClick={() => addExisting(product)}>
                Use
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {mode === "add" && canCreate && query.trim() ? (
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
          <p className="text-sm">Create “{query.trim()}” as a new product. Existing matches stay separate.</p>
          <Input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Category (optional)" className="h-12" />
          <Input value={barcode} onChange={(event) => setBarcode(event.target.value)} placeholder="Barcode (optional)" className="h-12" />
          <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description (optional)" className="h-12" />
          <Button type="button" variant="secondary" className="h-12" onClick={addNew}>
            Add as new product
          </Button>
        </div>
      ) : null}
      {mode !== "add" && query.trim().length === 0 ? (
        <ul className="rounded-xl border bg-card">
          {stockedHere.slice(0, 12).map((product) => (
            <li key={product.id} className="flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0">
              <span>
                <span className="font-medium">{product.name}</span>
                <span className="block text-sm text-muted-foreground">{product.byLocation[here] ?? product.byLocation[placeId] ?? 0} here</span>
              </span>
              <Button type="button" className="h-11" onClick={() => addExisting(product)}>
                {mode === "move" ? "Move" : "Remove"}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <section className="rounded-xl border bg-card">
        <h2 className="border-b px-4 py-3 text-base font-semibold">This session · {rows.length}</h2>
        {rows.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">Nothing queued yet.</p>
        ) : (
          <ul>
            {rows.map((row) => (
              <li key={row.key} className="flex items-center justify-between gap-3 border-b px-4 py-3 text-sm last:border-b-0">
                <span>
                  <span className="font-medium">{row.name}</span>
                  <span className="block text-muted-foreground">{queuedRowDetail(row, places, mode)}</span>
                </span>
                <Button type="button" variant="outline" className="h-11" onClick={() => setRows((current) => current.filter((entry) => entry.key !== row.key))}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {state.error ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.saved && state.message ? (
        <p className="rounded-md bg-muted px-3 py-2 text-sm" role="status">
          {state.message}
        </p>
      ) : null}
      {confirming ? (
        <div className="rounded-xl border bg-card p-4">
          <p className="font-medium">Save {rows.length} {rows.length === 1 ? "line" : "lines"}?</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Button type="button" variant="secondary" className="h-12" onClick={() => setConfirming(false)}>
              Back
            </Button>
            <SaveButton onClick={onSubmit} />
          </div>
        </div>
      ) : (
        <Button type="button" className="h-12" disabled={rows.length === 0} onClick={() => setConfirming(true)}>
          Review and save
        </Button>
      )}
    </div>
  );
}

function SaveButton({ onClick }: { onClick: () => void }) {
  const status = useFormStatus();
  return (
    <Button type="button" className="h-12" disabled={status.pending} onClick={onClick}>
      Confirm
    </Button>
  );
}
