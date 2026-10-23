import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";
import { isRole } from "@/lib/roles";
import {
  buildSession,
  openSession,
  sealSession,
  sessionCookieName,
  sessionCookieOptions,
  type Session,
} from "@/lib/session";

export async function readSession(): Promise<Session | null> {
  return openSession(cookies().get(sessionCookieName)?.value);
}

/** Authoritative check: the signed cookie must still match a live database user. */
export async function userFromSession(session: Session | null) {
  if (!session || session.exp <= Date.now()) {
    return null;
  }
  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user || !user.active || !isRole(user.role)) {
    return null;
  }
  if (user.sessionVersion !== session.sv || user.role !== session.role) {
    return null;
  }
  return user;
}

export async function getCurrentUser() {
  return userFromSession(await readSession());
}

export async function setSession(session: Session) {
  cookies().set(sessionCookieName, await sealSession(session), sessionCookieOptions);
}

export async function clearSession() {
  cookies().delete(sessionCookieName);
}

export { buildSession };
