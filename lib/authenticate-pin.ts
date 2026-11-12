import { hashPin, pinLookup, verifyPin } from "@/lib/pin";
import { clearLoginFailures, loginLocked, recordLoginFailure } from "@/lib/login-throttle";
import { prisma } from "@/lib/prisma";
import { isRole, type Role } from "@/lib/roles";
import { usingSheets } from "@/lib/storage/backend";

const dummyHash = hashPin("000000");

type AuthenticatedUser = {
  id: string;
  name: string;
  role: Role;
  sessionVersion: number;
  active: boolean;
  canScan: boolean;
  pinHash: string;
  pinLookup: string;
};

export async function authenticatePin(
  pin: string,
  throttleKey: string,
  now = new Date()
): Promise<{ error: string } | { user: AuthenticatedUser }> {
  if (await loginLocked(throttleKey, now)) {
    return { error: "Too many attempts. Try again later." };
  }

  const code = pin.trim();
  if (!/^\d{4}$/.test(code)) {
    await recordLoginFailure(throttleKey, now);
    return { error: "Enter a 4-digit PIN." };
  }

  const lookup = pinLookup(code);
  const user = usingSheets()
    ? await (await import("@/lib/storage/sheets-stock")).readSheetUserByLookup(lookup)
    : await prisma.user.findUnique({ where: { pinLookup: lookup } });
  const matches = user ? verifyPin(code, user.pinHash) : verifyPin(code, dummyHash);
  if (!user || !matches || !user.active || !isRole(user.role)) {
    await recordLoginFailure(throttleKey, now);
    return { error: "That PIN is not recognized." };
  }

  await clearLoginFailures(throttleKey);
  return {
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      sessionVersion: user.sessionVersion,
      active: user.active,
      canScan: user.canScan,
      pinHash: user.pinHash,
      pinLookup: user.pinLookup,
    },
  };
}
