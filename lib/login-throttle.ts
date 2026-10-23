import { prisma } from "@/lib/prisma";

export const loginFailureLimit = 5;
export const loginWindowMs = 10 * 60 * 1000;

export async function loginLocked(key: string, now = new Date()) {
  const existing = await prisma.loginThrottle.findUnique({ where: { key } });
  return Boolean(existing?.lockedUntil && existing.lockedUntil.getTime() > now.getTime());
}

export async function recordLoginFailure(key: string, now = new Date()) {
  const existing = await prisma.loginThrottle.findUnique({ where: { key } });
  let failures = 1;
  let windowStart = now;
  if (existing && now.getTime() - existing.windowStart.getTime() < loginWindowMs) {
    failures = existing.failures + 1;
    windowStart = existing.windowStart;
  }
  const lockedUntil =
    failures >= loginFailureLimit ? new Date(now.getTime() + loginWindowMs) : null;
  await prisma.loginThrottle.upsert({
    where: { key },
    create: {
      key,
      failures,
      windowStart,
      lockedUntil,
    },
    update: {
      failures,
      windowStart,
      lockedUntil,
    },
  });
}

export async function clearLoginFailures(key: string) {
  await prisma.loginThrottle.deleteMany({ where: { key } });
}
