"use client";

import { useFormState, useFormStatus } from "react-dom";

import { type ActionState } from "@/app/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const idle: ActionState = {};

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="h-12 shrink-0" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function NameManager({
  label,
  placeholder,
  items,
  createAction,
  updateAction,
}: {
  label: string;
  placeholder: string;
  items: { id: string; name: string }[];
  createAction: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  updateAction: (previous: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [createState, create] = useFormState(createAction, idle);

  return (
    <div className="flex flex-col gap-3">
      <form key={createState.saved ? "saved" : "new"} action={create} className="flex flex-col gap-3 rounded-xl border p-4">
        <Label htmlFor={`new-${label}`}>{label}</Label>
        <Input id={`new-${label}`} name="name" placeholder={placeholder} required className="h-12" />
        {createState.error ? (
          <p className="text-sm font-medium text-destructive" role="alert">
            {createState.error}
          </p>
        ) : null}
        {createState.saved ? (
          <p className="text-sm text-muted-foreground" role="status">
            Added.
          </p>
        ) : null}
        <SaveButton label="Add" />
      </form>
      {items.map((item) => (
        <NamedRow key={`${item.id}-${item.name}`} item={item} updateAction={updateAction} />
      ))}
    </div>
  );
}

function NamedRow({
  item,
  updateAction,
}: {
  item: { id: string; name: string };
  updateAction: (previous: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, action] = useFormState(updateAction, idle);

  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl border p-4">
      <input type="hidden" name="id" value={item.id} />
      <Label htmlFor={`name-${item.id}`}>Name</Label>
      <Input id={`name-${item.id}`} name="name" defaultValue={item.name} required className="h-12" />
      {state.error ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.saved ? (
        <p className="text-sm text-muted-foreground" role="status">
          Saved.
        </p>
      ) : null}
      <SaveButton label="Save" />
    </form>
  );
}
