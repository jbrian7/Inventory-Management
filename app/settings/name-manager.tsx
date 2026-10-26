"use client";

import { Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { type ActionState } from "@/app/settings/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const idle: ActionState = {};

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function NameManager({
  label,
  addLabel,
  placeholder,
  items,
  createAction,
  updateAction,
  deleteAction,
}: {
  label: string;
  addLabel: string;
  placeholder: string;
  items: { id: string; name: string }[];
  createAction: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  updateAction: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  deleteAction: (previous: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() => {
            setFormKey((key) => key + 1);
            setOpen(true);
          }}
        >
          {addLabel}
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <CreateForm
            key={formKey}
            label={label}
            placeholder={placeholder}
            action={createAction}
            onDone={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
      <ul className="divide-y">
        {items.map((item) => (
          <NamedRow key={item.id} item={item} label={label} updateAction={updateAction} deleteAction={deleteAction} />
        ))}
      </ul>
    </div>
  );
}

function CreateForm({
  label,
  placeholder,
  action,
  onDone,
}: {
  label: string;
  placeholder: string;
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  onDone: () => void;
}) {
  const [state, formAction] = useFormState(action, idle);
  useEffect(() => {
    if (state.saved) {
      onDone();
    }
  }, [onDone, state.saved]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <DialogHeader>
        <DialogTitle>Add {label.toLowerCase()}</DialogTitle>
        <DialogDescription>This name shows up on items.</DialogDescription>
      </DialogHeader>
      <Label htmlFor={`new-${label}`}>{label}</Label>
      <Input id={`new-${label}`} name="name" placeholder={placeholder} required />
      {state.error ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <SaveButton label="Add" />
    </form>
  );
}

function NamedRow({
  item,
  label,
  updateAction,
  deleteAction,
}: {
  item: { id: string; name: string };
  label: string;
  updateAction: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  deleteAction: (previous: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className="truncate font-medium">{item.name}</span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          setFormKey((key) => key + 1);
          setOpen(true);
        }}
      >
        <Pencil aria-hidden="true" />
        Edit
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <EditNamedForm
            key={formKey}
            item={item}
            label={label}
            updateAction={updateAction}
            deleteAction={deleteAction}
            onDone={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </li>
  );
}

function EditNamedForm({
  item,
  label,
  updateAction,
  deleteAction,
  onDone,
}: {
  item: { id: string; name: string };
  label: string;
  updateAction: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  deleteAction: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  onDone: () => void;
}) {
  const [updateState, update] = useFormState(updateAction, idle);
  const [deleteState, remove] = useFormState(deleteAction, idle);
  useEffect(() => {
    if (updateState.saved || deleteState.saved) {
      onDone();
    }
  }, [deleteState.saved, onDone, updateState.saved]);

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Edit {label.toLowerCase()}</DialogTitle>
        <DialogDescription>Rename {item.name}, or delete it when nothing uses it.</DialogDescription>
      </DialogHeader>
      <form action={update} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={item.id} />
        <Label htmlFor={`name-${item.id}`}>Name</Label>
        <Input id={`name-${item.id}`} name="name" defaultValue={item.name} required />
        {updateState.error ? (
          <p className="text-sm font-medium text-destructive" role="alert">
            {updateState.error}
          </p>
        ) : null}
        <SaveButton label="Save" />
      </form>
      <form action={remove}>
        <input type="hidden" name="id" value={item.id} />
        {deleteState.error ? (
          <p className="mb-2 text-sm font-medium text-destructive" role="alert">
            {deleteState.error}
          </p>
        ) : null}
        <Button type="submit" variant="destructive" className="w-full">
          Delete
        </Button>
      </form>
    </div>
  );
}
