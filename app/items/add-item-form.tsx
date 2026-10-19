"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { createItem, type CreateItemState } from "./actions";

const initialState: CreateItemState = {};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="h-12 w-full" disabled={pending}>
      {pending ? "Saving…" : "Add item"}
    </Button>
  );
}

export function AddItemForm() {
  const [state, formAction] = useFormState(createItem, initialState);

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
        <form
          key={state.qrCodeData ?? "new"}
          action={formAction}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required className="h-12" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sku">SKU</Label>
            <Input id="sku" name="sku" required className="h-12" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Description</Label>
            <Input id="description" name="description" className="h-12" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                name="quantity"
                type="number"
                min={0}
                step={1}
                defaultValue={0}
                required
                className="h-12"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="threshold">Low-stock threshold</Label>
              <Input
                id="threshold"
                name="threshold"
                type="number"
                min={0}
                step={1}
                defaultValue={5}
                required
                className="h-12"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              name="location"
              defaultValue="Stockroom"
              required
              className="h-12"
            />
          </div>
          {state.error ? (
            <p className="text-sm font-medium text-destructive" role="alert">
              {state.error}
            </p>
          ) : null}
          <SubmitButton />
        </form>
      </CardContent>
    </Card>
  );
}
