"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { clearSession, getCurrentUser } from "@/lib/current-user";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/roles";
import { createStaffMember, removeStaffMember, updateStaffMember } from "@/lib/staff-admin";

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
  const actor = await requireManager();
  const result = await createStaffMember(actor, {
    name: cleanName(formData.get("name")),
    pin: cleanName(formData.get("pin")),
    role: cleanName(formData.get("role")),
  });
  if ("error" in result && result.error) {
    return { error: result.error };
  }
  revalidatePath("/settings");
  return { saved: true };
}

export async function updateUser(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireManager();
  const result = await updateStaffMember(actor, {
    id: cleanName(formData.get("id")),
    name: cleanName(formData.get("name")),
    pin: cleanName(formData.get("pin")),
    role: cleanName(formData.get("role")),
    active: formData.get("active") === "true",
    canScan: formData.get("canScan") === "true",
  });
  if ("error" in result && result.error) {
    return { error: result.error };
  }
  revalidatePath("/settings");
  return { saved: true };
}

export async function removeUser(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireManager();
  const result = await removeStaffMember(actor, cleanName(formData.get("id")));
  if ("error" in result && result.error) {
    return { error: result.error };
  }
  revalidatePath("/settings");
  if ("deactivatedSelf" in result && result.deactivatedSelf) {
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

export async function deleteLocation(_previous: ActionState, formData: FormData) {
  return deleteNamed("location", cleanName(formData.get("id")));
}

export async function deleteCategory(_previous: ActionState, formData: FormData) {
  return deleteNamed("category", cleanName(formData.get("id")));
}

async function deleteNamed(kind: "location" | "category", id: string): Promise<ActionState> {
  await requireManager();
  if (!id) {
    return { error: "That record is missing." };
  }
  const inUse =
    kind === "location"
      ? await prisma.item.count({ where: { locationId: id } })
      : await prisma.item.count({ where: { categoryId: id } });
  if (inUse > 0) {
    return {
      error:
        kind === "location"
          ? "Move the items in this location before deleting it."
          : "Move the items in this category before deleting it.",
    };
  }
  if (kind === "location") {
    await prisma.location.delete({ where: { id } });
  } else {
    await prisma.category.delete({ where: { id } });
  }
  revalidatePath("/settings");
  revalidatePath("/items");
  return { saved: true };
}

export type { Role };
