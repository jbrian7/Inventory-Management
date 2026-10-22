import { isRole, type Role } from "@/lib/roles";

export const sessionCookieName = "zap_session";

export type Session = {
  id: string;
  role: Role;
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
    const parsed = JSON.parse(base64UrlToString(payload)) as { id?: unknown; role?: unknown };
    if (typeof parsed.id !== "string" || parsed.id.length === 0) {
      return null;
    }
    if (typeof parsed.role !== "string" || !isRole(parsed.role)) {
      return null;
    }
    return { id: parsed.id, role: parsed.role };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};
