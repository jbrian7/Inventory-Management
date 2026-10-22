"use client";

import { useState } from "react";
import { useFormState } from "react-dom";

import { createItem, type ItemFormState } from "@/app/items/actions";
import { ItemForm, type ItemFormDefaults } from "@/app/items/item-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { todayDateInput } from "@/lib/item-dates";

const initialState: ItemFormState = {};

export function AddItemButton({
  locations,
  categories,
}: {
  locations: { id: string; name: string }[];
  categories: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  return (
    <>
      <Button
        type="button"
        className="shrink-0"
        onClick={() => {
          setFormKey((key) => key + 1);
          setOpen(true);
        }}
      >
        Add item
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <AddItemBody key={formKey} locations={locations} categories={categories} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddItemBody({
  locations,
  categories,
}: {
  locations: { id: string; name: string }[];
  categories: { id: string; name: string }[];
}) {
  const [state, formAction] = useFormState(createItem, initialState);
  const defaultLocation =
    locations.find((location) => location.name === "Stockroom")?.id ?? locations[0]?.id ?? "";
  const defaultCategory =
    categories.find((category) => category.name === "Stuffed Animals")?.id ??
    categories[0]?.id ??
    "";
  const defaults: ItemFormDefaults = {
    name: "",
    sku: "",
    description: "",
    quantity: 0,
    threshold: 5,
    locationId: defaultLocation,
    categoryId: defaultCategory,
    receivedAt: todayDateInput(),
    outOfStockAt: "",
    isManualOos: false,
  };

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Add item</DialogTitle>
        <DialogDescription>Saving creates a QR value like ZAP-ITEM-[CUID].</DialogDescription>
      </DialogHeader>
      {state.qrCodeData ? (
        <p className="rounded-md bg-muted px-3 py-2 text-sm" role="status">
          Added {state.name}. QR code <span className="font-mono">{state.qrCodeData}</span>
        </p>
      ) : null}
      <ItemForm
        key={state.qrCodeData ?? "new"}
        action={formAction}
        state={state}
        defaults={defaults}
        locations={locations}
        categories={categories}
        submitLabel="Add item"
      />
    </div>
  );
}
