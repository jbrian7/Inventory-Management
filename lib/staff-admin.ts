import { Prisma } from "@/lib/generated/prisma/client";
import { pinCredential } from "@/lib/pin";
import { prisma } from "@/lib/prisma";
import { isRole } from "@/lib/roles";
import { guardManagerPrivilege, guardStaffChange } from "@/lib/staff-rules";

type Actor = { id: string; role: string };
type StaffTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function duplicate(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function actorRecord(actor: Actor) {
  const row = await prisma.user.findUnique({ where: { id: actor.id } });
  if (!row || !row.active || (row.role !== "ADMIN" && row.role !== "MANAGER")) {
    return { error: "Only admins and managers can change staff." as const };
  }
  return { row };
}

async function withStaffLock<T>(run: (tx: StaffTx) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE "User" SET "sessionVersion" = "sessionVersion"`;
    return run(tx);
  });
}

export async function createStaffMember(
  actor: Actor,
  input: { name: string; pin: string; role: string }
) {
  const acting = await actorRecord(actor);
  if ("error" in acting) {
    return acting;
  }
  const denied = guardManagerPrivilege({ actorRole: acting.row.role, nextRole: input.role });
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
  const acting = await actorRecord(actor);
  if ("error" in acting) {
    return acting;
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

  try {
    return await withStaffLock(async (tx) => {
      const users = await tx.user.findMany({
        select: { id: true, role: true, active: true, pinLookup: true, sessionVersion: true },
      });
      const target = users.find((user) => user.id === input.id);
      const privilege = guardManagerPrivilege({
        actorRole: acting.row.role,
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
      const changed = await tx.user.updateMany({
        where: { id: input.id, sessionVersion: target.sessionVersion },
        data: {
          name: input.name.trim(),
          role: input.role,
          active: input.active,
          canScan: input.canScan,
          ...(nextPin ? nextPin : {}),
          ...(invalidate ? { sessionVersion: { increment: 1 } } : {}),
        },
      });
      if (changed.count !== 1) {
        return { error: "That person changed on another device. Reload and try again." };
      }
      return { saved: true as const };
    });
  } catch (error) {
    if (duplicate(error)) {
      return { error: "That PIN is already in use." };
    }
    throw error;
  }
}

export async function removeStaffMember(actor: Actor, id: string) {
  const acting = await actorRecord(actor);
  if ("error" in acting) {
    return acting;
  }

  return withStaffLock(async (tx) => {
    const users = await tx.user.findMany({
      select: { id: true, role: true, active: true, canScan: true, name: true },
    });
    const target = users.find((user) => user.id === id);
    const privilege = guardManagerPrivilege({
      actorRole: acting.row.role,
      targetRole: target?.role,
    });
    if (privilege) {
      return { error: privilege };
    }
    const blocked = guardStaffChange({ users, targetId: id, active: false });
    if (blocked) {
      return { error: blocked };
    }
    if (!target) {
      return { error: "That person is no longer on the staff list." };
    }
    if (!target.active) {
      return { saved: true as const, deactivatedSelf: false };
    }
    await tx.user.update({
      where: { id },
      data: { active: false, sessionVersion: { increment: 1 } },
    });
    return { saved: true as const, deactivatedSelf: actor.id === id };
  });
}
