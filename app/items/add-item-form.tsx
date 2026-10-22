"use client";

import { useFormState } from "react-dom";

import { createItem, type ItemFormState } from "@/app/items/actions";
import { ItemForm, type ItemFormDefaults } from "@/app/items/item-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { todayDateInput } from "@/lib/item-dates";

const initialState: ItemFormState = {};

export function AddItemForm({
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
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add New Item</CardTitle>
        <CardDescription>
          Saving creates a QR value like ZAP-ITEM-[CUID].
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {state.qrCodeData ? (
          <p className="rounded-md bg-muted px-3 py-2 text-sm" role="status">
            Added {state.name}. QR code{" "}
            <span className="font-mono">{state.qrCodeData}</span>
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
      </CardContent>
    </Card>
  );
}
