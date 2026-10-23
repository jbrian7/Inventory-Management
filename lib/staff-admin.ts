import { Prisma } from "@/lib/generated/prisma/client";
import { pinCredential } from "@/lib/pin";
import { prisma } from "@/lib/prisma";
import { isRole } from "@/lib/roles";
import { guardManagerPrivilege, guardStaffChange } from "@/lib/staff-rules";

type Actor = { id: string; role: string };

function duplicate(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function actorError(actor: Actor) {
  if (actor.role !== "ADMIN" && actor.role !== "MANAGER") {
    return "Only admins and managers can change staff.";
  }
  return null;
}

export async function createStaffMember(
  actor: Actor,
  input: { name: string; pin: string; role: string }
) {
  const denied = actorError(actor) ?? guardManagerPrivilege({ actorRole: actor.role, nextRole: input.role });
  if (denied) {
    return { error: denied };
  }
  if (!input.name.trim()) {
    return { error: "Name is required." };
  }
  if (!/^\d{4}$/.test(input.pin)) {
    return { error: "PIN must be 4 digits." };
  }
  if (!isRole(input.role)) {
    return { error: "Choose Admin, Manager, or Staff." };
  }

  try {
    await prisma.user.create({
      data: {
        name: input.name.trim(),
        role: input.role,
        canScan: true,
        active: true,
        ...pinCredential(input.pin),
      },
    });
  } catch (error) {
    if (duplicate(error)) {
      return { error: "That PIN is already in use." };
    }
    throw error;
  }
  return { saved: true as const };
}

export async function updateStaffMember(
  actor: Actor,
  input: { id: string; name: string; pin: string; role: string; active: boolean; canScan: boolean }
) {
  const deniedActor = actorError(actor);
  if (deniedActor) {
    return { error: deniedActor };
  }
  if (!input.name.trim()) {
    return { error: "Name is required." };
  }
  if (input.pin && !/^\d{4}$/.test(input.pin)) {
    return { error: "PIN must be 4 digits." };
  }
  if (!isRole(input.role)) {
    return { error: "Choose Admin, Manager, or Staff." };
  }

  const users = await prisma.user.findMany({ select: { id: true, role: true, active: true, pinLookup: true, sessionVersion: true } });
  const target = users.find((user) => user.id === input.id);
  const privilege = guardManagerPrivilege({
    actorRole: actor.role,
    targetRole: target?.role,
    nextRole: input.role,
  });
  if (privilege) {
    return { error: privilege };
  }
  const blocked = guardStaffChange({
    users,
    targetId: input.id,
    nextRole: input.role,
    active: input.active,
  });
  if (blocked) {
    return { error: blocked };
  }
  if (!target) {
    return { error: "That person is no longer on the staff list." };
  }

  const nextPin = input.pin ? pinCredential(input.pin) : null;
  const pinChanged = nextPin !== null && nextPin.pinLookup !== target.pinLookup;
  const roleChanged = input.role !== target.role;
  const activeChanged = input.active !== target.active;
  const invalidate = pinChanged || roleChanged || activeChanged;

  try {
    await prisma.user.update({
      where: { id: input.id },
      data: {
        name: input.name.trim(),
        role: input.role,
        active: input.active,
        canScan: input.canScan,
        ...(nextPin ? nextPin : {}),
        ...(invalidate ? { sessionVersion: { increment: 1 } } : {}),
      },
    });
  } catch (error) {
    if (duplicate(error)) {
      return { error: "That PIN is already in use." };
    }
    throw error;
  }
  return { saved: true as const };
}

export async function removeStaffMember(actor: Actor, id: string) {
  const deniedActor = actorError(actor);
  if (deniedActor) {
    return { error: deniedActor };
  }
  const users = await prisma.user.findMany({ select: { id: true, role: true, active: true } });
  const target = users.find((user) => user.id === id);
  const privilege = guardManagerPrivilege({ actorRole: actor.role, targetRole: target?.role });
  if (privilege) {
    return { error: privilege };
  }
  const blocked = guardStaffChange({ users, targetId: id, remove: true });
  if (blocked) {
    return { error: blocked };
  }

  await prisma.history.updateMany({ where: { userId: id }, data: { userId: null } });
  await prisma.user.delete({ where: { id } });
  return { saved: true as const, deletedSelf: actor.id === id };
}
