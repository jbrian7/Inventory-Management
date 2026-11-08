"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { authenticatePin } from "@/lib/authenticate-pin";
import { buildSession, clearSession, setSession } from "@/lib/current-user";
import { publicClientKey } from "@/lib/public-client";

function throttleKey() {
  return publicClientKey(headers());
}

export async function login(pin: string) {
  try {
    const result = await authenticatePin(pin, throttleKey());
    if ("error" in result) {
      return result;
    }

    const session = buildSession(result.user);
    if (!session) {
      return { error: "That PIN is not recognized." };
    }
    await setSession(session);
    return { ok: true as const };
  } catch {
    return { error: "Sign-in is not configured. Check the server environment and try again." };
  }
}

export async function logout() {
  await clearSession();
  redirect("/login");
}
