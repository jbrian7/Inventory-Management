"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { authenticatePin } from "@/lib/authenticate-pin";
import { buildSession, clearSession, setSession } from "@/lib/current-user";

function throttleKey() {
  const forwarded = headers().get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || headers().get("x-real-ip")?.trim() || "local";
  return `ip:${ip}`;
}

export async function login(pin: string) {
  const result = await authenticatePin(pin, throttleKey());
  if ("error" in result) {
    return result;
  }

  const session = buildSession(result.user);
  if (!session) {
    return { error: "That PIN is not recognized." };
  }
  await setSession(session);
  redirect("/");
}

export async function logout() {
  await clearSession();
  redirect("/login");
}
