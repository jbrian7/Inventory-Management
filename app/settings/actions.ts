"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { clearSession, getCurrentUser } from "@/lib/current-user";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { isRole, type Role } from "@/lib/roles";
import { guardStaffChange } from "@/lib/staff-rules";

export type ActionState = {
  error?: string;
  saved?: boolean;
};

async function requireManager() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.role !== "MANAGER")) {
    redirect("/?denied=settings");
  }
  return user;
}

function cleanName(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function duplicateName(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function createUser(_previous: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();
  const name = cleanName(formData.get("name"));
  const pin = cleanName(formData.get("pin"));
  const role = cleanName(formData.get("role"));
  if (!name) {
    return { error: "Name is required." };
  }
  if (!/^\d{4}$/.test(pin)) {
    return { error: "PIN must be 4 digits." };
  }
  if (!isRole(role)) {
    return { error: "Choose Admin, Manager, or Staff." };
  }

  try {
    await prisma.user.create({ data: { name, pin, role, canScan: true } });
  } catch (error) {
    if (duplicateName(error)) {
      return { error: "That PIN is already in use." };
    }
    throw error;
  }

  revalidatePath("/settings");
  return { saved: true };
}

export async function updateUser(_previous: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();
  const id = cleanName(formData.get("id"));
  const name = cleanName(formData.get("name"));
  const pin = cleanName(formData.get("pin"));
  const role = cleanName(formData.get("role"));
  if (!name) {
    return { error: "Name is required." };
  }
  if (!/^\d{4}$/.test(pin)) {
    return { error: "PIN must be 4 digits." };
  }
  if (!isRole(role)) {
    return { error: "Choose Admin, Manager, or Staff." };
  }

  const users = await prisma.user.findMany({ select: { id: true, role: true } });
  const blocked = guardStaffChange({ users, targetId: id, nextRole: role });
  if (blocked) {
    return { error: blocked };
  }

  try {
    await prisma.user.update({ where: { id }, data: { name, pin, role } });
  } catch (error) {
    if (duplicateName(error)) {
      return { error: "That PIN is already in use." };
    }
    throw error;
  }

  revalidatePath("/settings");
  return { saved: true };
}

export async function removeUser(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireManager();
  const id = cleanName(formData.get("id"));
  const users = await prisma.user.findMany({ select: { id: true, role: true } });
  const blocked = guardStaffChange({ users, targetId: id, remove: true });
  if (blocked) {
    return { error: blocked };
  }

  await prisma.user.delete({ where: { id } });
  revalidatePath("/settings");
  if (actor.id === id) {
    await clearSession();
    redirect("/login");
  }
  return { saved: true };
}

async function saveNamed(
  kind: "location" | "category",
  id: string | null,
  name: string
): Promise<ActionState> {
  await requireManager();
  if (!name) {
    return { error: "Name is required." };
  }
  try {
    if (kind === "location") {
      if (id) {
        await prisma.location.update({ where: { id }, data: { name } });
      } else {
        await prisma.location.create({ data: { name } });
      }
    } else if (id) {
      await prisma.category.update({ where: { id }, data: { name } });
    } else {
      await prisma.category.create({ data: { name } });
    }
  } catch (error) {
    if (duplicateName(error)) {
      return { error: "That name is already in use." };
    }
    throw error;
  }
  revalidatePath("/settings");
  revalidatePath("/items");
  return { saved: true };
}

export async function createLocation(_previous: ActionState, formData: FormData) {
  return saveNamed("location", null, cleanName(formData.get("name")));
}

export async function updateLocation(_previous: ActionState, formData: FormData) {
  return saveNamed("location", cleanName(formData.get("id")), cleanName(formData.get("name")));
}

export async function createCategory(_previous: ActionState, formData: FormData) {
  return saveNamed("category", null, cleanName(formData.get("name")));
}

export async function updateCategory(_previous: ActionState, formData: FormData) {
  return saveNamed("category", cleanName(formData.get("id")), cleanName(formData.get("name")));
}

export type { Role };
