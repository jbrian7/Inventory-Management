"use client";

import { Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { createUser, removeUser, updateUser, type ActionState } from "@/app/settings/actions";
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
import { isRole, roleLabels, roles, type Role } from "@/lib/roles";

const idle: ActionState = {};

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

function RoleSelect({ id, defaultValue }: { id: string; defaultValue: Role }) {
  return (
    <select
      id={id}
      name="role"
      defaultValue={defaultValue}
      className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"
    >
      {roles.map((role) => (
        <option key={role} value={role}>
          {roleLabels[role]}
        </option>
      ))}
    </select>
  );
}

function AddUserDialog() {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  return (
    <>
      <Button
        type="button"
        onClick={() => {
          setFormKey((key) => key + 1);
          setOpen(true);
        }}
      >
        Add staff
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <AddUserForm key={formKey} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddUserForm({ onDone }: { onDone: () => void }) {
  const [state, action] = useFormState(createUser, idle);
  useEffect(() => {
    if (state.saved) {
      onDone();
    }
  }, [onDone, state.saved]);

  return (
    <form action={action} className="flex flex-col gap-3">
      <DialogHeader>
        <DialogTitle>Add staff</DialogTitle>
        <DialogDescription>Name, 4-digit PIN, and role.</DialogDescription>
      </DialogHeader>
      <Label htmlFor="new-name">Name</Label>
      <Input id="new-name" name="name" required />
      <Label htmlFor="new-pin">PIN</Label>
      <Input
        id="new-pin"
        name="pin"
        inputMode="numeric"
        autoComplete="off"
        pattern="[0-9]{4}"
        maxLength={4}
        required
      />
      <Label htmlFor="new-role">Role</Label>
      <RoleSelect id="new-role" defaultValue="STAFF" />
      {state.error ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <SaveButton label="Add staff" />
    </form>
  );
}

function UserEditForm({
  user,
  onDone,
}: {
  user: { id: string; name: string; pin: string; role: Role };
  onDone: () => void;
}) {
  const [updateState, updateAction] = useFormState(updateUser, idle);
  const [removeState, removeAction] = useFormState(removeUser, idle);
  useEffect(() => {
    if (updateState.saved || removeState.saved) {
      onDone();
    }
  }, [onDone, removeState.saved, updateState.saved]);

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Edit {user.name}</DialogTitle>
        <DialogDescription>Change the PIN or role, or remove this person.</DialogDescription>
      </DialogHeader>
      <form action={updateAction} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={user.id} />
        <input type="hidden" name="name" value={user.name} />
        <Label htmlFor={`pin-${user.id}`}>PIN</Label>
        <Input
          id={`pin-${user.id}`}
          name="pin"
          inputMode="numeric"
          autoComplete="off"
          defaultValue={user.pin}
          pattern="[0-9]{4}"
          maxLength={4}
          required
        />
        <Label htmlFor={`role-${user.id}`}>Role</Label>
        <RoleSelect id={`role-${user.id}`} defaultValue={user.role} />
        {updateState.error ? (
          <p className="text-sm font-medium text-destructive" role="alert">
            {updateState.error}
          </p>
        ) : null}
        <SaveButton label="Save" />
      </form>
      <form action={removeAction}>
        <input type="hidden" name="id" value={user.id} />
        {removeState.error ? (
          <p className="mb-2 text-sm font-medium text-destructive" role="alert">
            {removeState.error}
          </p>
        ) : null}
        <Button type="submit" variant="destructive" className="w-full">
          Delete user
        </Button>
      </form>
    </div>
  );
}

function UserRow({
  user,
}: {
  user: { id: string; name: string; pin: string; role: Role };
}) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="truncate font-medium">{user.name}</span>
        <span className="shrink-0 text-sm text-muted-foreground">{roleLabels[user.role]}</span>
      </div>
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
          <UserEditForm key={formKey} user={user} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </li>
  );
}

export function UserManager({
  users,
}: {
  users: { id: string; name: string; pin: string; role: string }[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <AddUserDialog />
      </div>
      <ul className="divide-y">
        {users.map((user) =>
          isRole(user.role) ? (
            <UserRow key={user.id} user={{ ...user, role: user.role }} />
          ) : null
        )}
      </ul>
    </div>
  );
}
