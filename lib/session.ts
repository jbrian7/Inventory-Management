import { isRole, type Role } from "@/lib/roles";

export const sessionCookieName = "zap_session";
export const sessionTtlSeconds = 60 * 60 * 24 * 7;

export type Session = {
  id: string;
  role: Role;
  sv: number;
  exp: number;
};

const encoder = new TextEncoder();

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) {
    throw new Error("AUTH_SECRET is not set.");
  }
  return value;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToString(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
  return atob(padded);
}

async function sign(payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return bytesToBase64Url(new Uint8Array(signature));
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

export function buildSession(
  user: { id: string; role: string; sessionVersion: number },
  now = Date.now()
): Session | null {
  if (!isRole(user.role)) {
    return null;
  }
  return {
    id: user.id,
    role: user.role,
    sv: user.sessionVersion,
    exp: now + sessionTtlSeconds * 1000,
  };
}

export async function sealSession(session: Session) {
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify(session)));
  const signature = await sign(payload);
  return `${payload}.${signature}`;
}

export async function openSession(token: string | undefined | null): Promise<Session | null> {
  if (!token) {
    return null;
  }
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) {
    return null;
  }
  const expected = await sign(payload);
  if (!safeEqual(expected, signature)) {
    return null;
  }
  try {
    const parsed = JSON.parse(base64UrlToString(payload)) as {
      id?: unknown;
      role?: unknown;
      sv?: unknown;
      exp?: unknown;
    };
    if (typeof parsed.id !== "string" || parsed.id.length === 0) {
      return null;
    }
    if (typeof parsed.role !== "string" || !isRole(parsed.role)) {
      return null;
    }
    if (typeof parsed.sv !== "number" || !Number.isInteger(parsed.sv) || parsed.sv < 0) {
      return null;
    }
    if (typeof parsed.exp !== "number" || !Number.isFinite(parsed.exp) || parsed.exp <= Date.now()) {
      return null;
    }
    return { id: parsed.id, role: parsed.role, sv: parsed.sv, exp: parsed.exp };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: sessionTtlSeconds,
};
