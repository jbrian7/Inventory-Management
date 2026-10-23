import { canEditInventory, isRole } from "@/lib/roles";

export type AccessUser = {
  role: string;
  active: boolean;
  canScan: boolean;
};

export function inventoryAccessError(user: AccessUser | null, kind: "add" | "edit") {
  if (!user || !user.active || !canEditInventory(user.role)) {
    return kind === "add"
      ? "Only admins and managers can add items."
      : "Only admins and managers can edit items.";
  }
  return null;
}

export function scanAccessError(user: AccessUser | null) {
  if (!user || !user.active || !isRole(user.role)) {
    return "Sign in to scan.";
  }
  if (!user.canScan) {
    return "Scanning is turned off for this account.";
  }
  return null;
}
