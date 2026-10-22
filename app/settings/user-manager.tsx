"use client";

import { useFormState, useFormStatus } from "react-dom";

import { createUser, removeUser, updateUser, type ActionState } from "@/app/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isRole, roleLabels, roles, type Role } from "@/lib/roles";

const idle: ActionState = {};

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="h-12" disabled={pending}>
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
      className="h-12 w-full rounded-md border border-input bg-transparent px-3 text-base"
    >
      {roles.map((role) => (
        <option key={role} value={role}>
          {roleLabels[role]}
        </option>
      ))}
    </select>
  );
}

function AddUserForm() {
  const [state, action] = useFormState(createUser, idle);

  return (
    <form key={state.saved ? "saved" : "new"} action={action} className="flex flex-col gap-3 rounded-xl border p-4">
      <h2 className="text-sm font-semibold">Add staff</h2>
      <Label htmlFor="new-name">Name</Label>
      <Input id="new-name" name="name" required className="h-12" />
      <Label htmlFor="new-pin">PIN</Label>
      <Input
        id="new-pin"
        name="pin"
        inputMode="numeric"
        autoComplete="off"
        pattern="[0-9]{4}"
        maxLength={4}
        required
        className="h-12"
      />
      <Label htmlFor="new-role">Role</Label>
      <RoleSelect id="new-role" defaultValue="STAFF" />
      {state.error ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.saved ? (
        <p className="text-sm text-muted-foreground" role="status">
          Staff member added.
        </p>
      ) : null}
      <SaveButton label="Add staff" />
    </form>
  );
}

function UserRow({
  user,
}: {
  user: { id: string; name: string; pin: string; role: Role };
}) {
  const [updateState, updateAction] = useFormState(updateUser, idle);
  const [removeState, removeAction] = useFormState(removeUser, idle);

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      <form action={updateAction} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={user.id} />
        <Label htmlFor={`name-${user.id}`}>Name</Label>
        <Input id={`name-${user.id}`} name="name" defaultValue={user.name} required className="h-12" />
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
          className="h-12"
        />
        <Label htmlFor={`role-${user.id}`}>Role</Label>
        <RoleSelect id={`role-${user.id}`} defaultValue={user.role} />
        {updateState.error ? (
          <p className="text-sm font-medium text-destructive" role="alert">
            {updateState.error}
          </p>
        ) : null}
        {updateState.saved ? (
          <p className="text-sm text-muted-foreground" role="status">
            Saved.
          </p>
        ) : null}
        <SaveButton label="Save" />
      </form>
      <form action={removeAction}>
        <input type="hidden" name="id" value={user.id} />
        {removeState.error ? (
          <p className="mb-3 text-sm font-medium text-destructive" role="alert">
            {removeState.error}
          </p>
        ) : null}
        <Button type="submit" variant="outline" className="h-12 w-full">
          Remove
        </Button>
      </form>
    </div>
  );
}

export function UserManager({
  users,
}: {
  users: { id: string; name: string; pin: string; role: string }[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <AddUserForm />
      {users.map((user) =>
        isRole(user.role) ? <UserRow key={`${user.id}-${user.pin}-${user.role}-${user.name}`} user={{ ...user, role: user.role }} /> : null
      )}
    </div>
  );
}
