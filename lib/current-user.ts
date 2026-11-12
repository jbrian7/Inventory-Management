import { cookies, headers } from "next/headers";

import { prisma } from "@/lib/prisma";
import { isRole } from "@/lib/roles";
import { usingSheets } from "@/lib/storage/backend";
import {
  buildSession,
  openSession,
  sealSession,
  sessionCookieAttributes,
  sessionCookieName,
  sessionCookieSecure,
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
  const user = usingSheets()
    ? await (await import("@/lib/storage/sheets-stock")).readSheetUserById(session.id)
    : await prisma.user.findUnique({ where: { id: session.id } });
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

function cookieAttributes() {
  const headerList = headers();
  const secure = sessionCookieSecure({
    nodeEnv: process.env.NODE_ENV,
    cookieSecure: process.env.COOKIE_SECURE,
    trustProxy: process.env.TRUST_PROXY,
    forwardedProto: process.env.TRUST_PROXY === "1" ? headerList.get("x-forwarded-proto") : null,
    host:
      process.env.TRUST_PROXY === "1"
        ? headerList.get("x-forwarded-host") || headerList.get("host")
        : headerList.get("host"),
  });
  return sessionCookieAttributes(secure);
}

export async function setSession(session: Session) {
  cookies().set(sessionCookieName, await sealSession(session), cookieAttributes());
}

export async function clearSession() {
  const attributes = cookieAttributes();
  cookies().set(sessionCookieName, "", { ...attributes, maxAge: 0 });
}

export { buildSession };
