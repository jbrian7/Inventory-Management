export const roles = ["ADMIN", "MANAGER", "STAFF"] as const;

export type Role = (typeof roles)[number];

export const roleLabels: Record<Role, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  STAFF: "Staff",
};

export function isRole(value: string): value is Role {
  return (roles as readonly string[]).includes(value);
}

export function canManageSettings(role: string) {
  return role === "ADMIN" || role === "MANAGER";
}

export function canEditInventory(role: string) {
  return role === "ADMIN" || role === "MANAGER";
}
