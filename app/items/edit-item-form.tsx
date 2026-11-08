"use client";

import { useFormState } from "react-dom";

import { updateItem, type ItemFormState } from "@/app/items/actions";
import { ItemForm, type ItemFormDefaults } from "@/app/items/item-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const initialState: ItemFormState = {};

export function EditItemForm({
  defaults,
  categories,
}: {
  defaults: ItemFormDefaults;
  categories: { id: string; name: string }[];
}) {
  const [state, formAction] = useFormState(updateItem, initialState);

  return (
    <Card id="edit">
      <CardHeader>
        <CardTitle className="text-base">Edit item</CardTitle>
        <CardDescription>Name, category, threshold, and dates.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {state.saved ? (
          <p className="rounded-md bg-muted px-3 py-2 text-sm" role="status">
            Saved {state.name}.
          </p>
        ) : null}
        <ItemForm
          action={formAction}
          state={state}
          defaults={defaults}
          locations={[]}
          categories={categories}
          submitLabel="Save changes"
          lockQuantity
          includeLocation={false}
        />
        <p className="text-sm text-muted-foreground">
          Saving does not change on-hand quantity. Move stock with Transfer stock, or correct one location from the item details page.
        </p>
      </CardContent>
    </Card>
  );
}
