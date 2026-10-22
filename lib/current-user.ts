import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";
import { isRole } from "@/lib/roles";
import { openSession, sealSession, sessionCookieName, sessionCookieOptions, type Session } from "@/lib/session";

export async function readSession(): Promise<Session | null> {
  return openSession(cookies().get(sessionCookieName)?.value);
}

export async function getCurrentUser() {
  const session = await readSession();
  if (!session) {
    return null;
  }
  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user || !isRole(user.role)) {
    return null;
  }
  return user;
}

export async function setSession(session: Session) {
  cookies().set(sessionCookieName, await sealSession(session), sessionCookieOptions);
}

export async function clearSession() {
  cookies().delete(sessionCookieName);
}
