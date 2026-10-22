"use server";

import { redirect } from "next/navigation";

import { clearSession, setSession } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { isRole } from "@/lib/roles";

export async function login(pin: string) {
  const code = pin.trim();
  if (!/^\d{4}$/.test(code)) {
    return { error: "Enter a 4-digit PIN." };
  }

  const user = await prisma.user.findUnique({ where: { pin: code } });
  if (!user || !isRole(user.role)) {
    return { error: "That PIN is not recognized." };
  }

  await setSession({ id: user.id, role: user.role });
  redirect("/");
}

export async function logout() {
  await clearSession();
  redirect("/login");
}
