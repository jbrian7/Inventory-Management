export function guardManagerPrivilege(input: {
  actorRole: string;
  targetRole?: string;
  nextRole?: string;
}) {
  if (input.actorRole === "ADMIN") {
    return null;
  }
  if (input.actorRole !== "MANAGER") {
    return "Only admins and managers can change staff.";
  }
  if (input.targetRole === "ADMIN") {
    return "Only an admin can change an admin.";
  }
  if (input.nextRole === "ADMIN") {
    return "Only an admin can grant admin access.";
  }
  return null;
}

export function guardStaffChange(input: {
  users: { id: string; role: string; active?: boolean }[];
  targetId: string;
  nextRole?: string;
  remove?: boolean;
  active?: boolean;
}) {
  const target = input.users.find((user) => user.id === input.targetId);
  if (!target) {
    return "That person is no longer on the staff list.";
  }
  const adminCount = input.users.filter(
    (user) => user.role === "ADMIN" && user.active !== false
  ).length;
  const deactivates = input.active === false && target.active !== false;
  const dropsLastAdmin =
    target.role === "ADMIN" &&
    adminCount <= 1 &&
    (input.remove ||
      deactivates ||
      (input.nextRole !== undefined && input.nextRole !== "ADMIN"));
  if (dropsLastAdmin) {
    return "Keep at least one admin.";
  }
  return null;
}
