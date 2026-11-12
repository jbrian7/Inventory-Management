import { prisma } from "@/lib/prisma";
import { usingSheets } from "@/lib/storage/backend";

export const loginFailureLimit = 5;
export const loginWindowMs = 10 * 60 * 1000;

export async function loginLocked(key: string, now = new Date()) {
  if (usingSheets()) {
    const { sheetsLoginIsLocked } = await import("@/lib/storage/sheets-stock");
    return sheetsLoginIsLocked(key, now);
  }
  const existing = await prisma.loginThrottle.findUnique({ where: { key } });
  return Boolean(existing?.lockedUntil && existing.lockedUntil.getTime() > now.getTime());
}

export async function recordLoginFailure(key: string, now = new Date()) {
  if (usingSheets()) {
    const { sheetsRecordLoginFailure } = await import("@/lib/storage/sheets-stock");
    await sheetsRecordLoginFailure(key, now);
    return;
  }
  const cutoff = new Date(now.getTime() - loginWindowMs);
  const lockedUntil = new Date(now.getTime() + loginWindowMs);
  await prisma.$executeRaw`
    INSERT INTO "LoginThrottle" ("key", "failures", "windowStart", "lockedUntil")
    VALUES (${key}, 1, ${now}, NULL)
    ON CONFLICT("key") DO UPDATE SET
      "failures" = CASE
        WHEN "LoginThrottle"."windowStart" <= ${cutoff} THEN 1
        ELSE "LoginThrottle"."failures" + 1
      END,
      "windowStart" = CASE
        WHEN "LoginThrottle"."windowStart" <= ${cutoff} THEN ${now}
        ELSE "LoginThrottle"."windowStart"
      END,
      "lockedUntil" = CASE
        WHEN (
          CASE
            WHEN "LoginThrottle"."windowStart" <= ${cutoff} THEN 1
            ELSE "LoginThrottle"."failures" + 1
          END
        ) >= ${loginFailureLimit} THEN ${lockedUntil}
        ELSE NULL
      END
  `;
}

export async function clearLoginFailures(key: string) {
  if (usingSheets()) {
    const { sheetsClearLogin } = await import("@/lib/storage/sheets-stock");
    await sheetsClearLogin(key);
    return;
  }
  await prisma.loginThrottle.deleteMany({ where: { key } });
}
