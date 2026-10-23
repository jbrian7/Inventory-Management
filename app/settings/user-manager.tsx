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
import { isRole, roleLabels, rolesAssignableBy, type Role } from "@/lib/roles";

const idle: ActionState = {};

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

function RoleSelect({
  id,
  defaultValue,
  choices,
}: {
  id: string;
  defaultValue: Role;
  choices: readonly Role[];
}) {
  return (
    <select
      id={id}
      name="role"
      defaultValue={defaultValue}
      className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"
    >
      {choices.map((role) => (
        <option key={role} value={role}>
          {roleLabels[role]}
        </option>
      ))}
    </select>
  );
}

function AddUserDialog({ choices }: { choices: readonly Role[] }) {
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
          <AddUserForm key={formKey} choices={choices} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddUserForm({ choices, onDone }: { choices: readonly Role[]; onDone: () => void }) {
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
      <RoleSelect id="new-role" defaultValue="STAFF" choices={choices} />
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
  choices,
  onDone,
}: {
  user: { id: string; name: string; role: Role; canScan: boolean; active: boolean };
  choices: readonly Role[];
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
        <DialogDescription>Set a new PIN or role, or remove this person.</DialogDescription>
      </DialogHeader>
      <form action={updateAction} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={user.id} />
        <input type="hidden" name="name" value={user.name} />
        <Label htmlFor={`pin-${user.id}`}>New PIN</Label>
        <Input
          id={`pin-${user.id}`}
          name="pin"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Leave blank to keep the current PIN"
          pattern="[0-9]{4}"
          maxLength={4}
        />
        <Label htmlFor={`role-${user.id}`}>Role</Label>
        <RoleSelect id={`role-${user.id}`} defaultValue={user.role} choices={choices} />
        <label className="flex items-center gap-2 text-sm" htmlFor={`scan-${user.id}`}>
          <input
            id={`scan-${user.id}`}
            type="checkbox"
            name="canScan"
            value="true"
            defaultChecked={user.canScan}
          />
          Can scan
        </label>
        <label className="flex items-center gap-2 text-sm" htmlFor={`active-${user.id}`}>
          <input
            id={`active-${user.id}`}
            type="checkbox"
            name="active"
            value="true"
            defaultChecked={user.active}
          />
          Active
        </label>
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
  actorRole,
}: {
  user: { id: string; name: string; role: Role; canScan: boolean; active: boolean };
  actorRole: Role;
}) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="truncate font-medium">{user.name}</span>
        <span className="shrink-0 text-sm text-muted-foreground">{roleLabels[user.role]}</span>
        {user.active ? null : (
          <span className="shrink-0 text-xs text-muted-foreground">Inactive</span>
        )}
      </div>
      {actorRole === "MANAGER" && user.role === "ADMIN" ? null : (
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
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <UserEditForm
            key={formKey}
            user={user}
            choices={rolesAssignableBy(actorRole)}
            onDone={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </li>
  );
}

export function UserManager({
  actorRole,
  users,
}: {
  actorRole: Role;
  users: { id: string; name: string; role: string; canScan: boolean; active: boolean }[];
}) {
  const choices = rolesAssignableBy(actorRole);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <AddUserDialog choices={choices} />
      </div>
      <ul className="divide-y">
        {users.map((user) =>
          isRole(user.role) ? (
            <UserRow key={user.id} actorRole={actorRole} user={{ ...user, role: user.role }} />
          ) : null
        )}
      </ul>
    </div>
  );
}
