export function guardStaffChange(input: {
  users: { id: string; role: string }[];
  targetId: string;
  nextRole?: string;
  remove?: boolean;
}) {
  const target = input.users.find((user) => user.id === input.targetId);
  if (!target) {
    return "That person is no longer on the staff list.";
  }
  const adminCount = input.users.filter((user) => user.role === "ADMIN").length;
  const dropsLastAdmin =
    target.role === "ADMIN" &&
    adminCount <= 1 &&
    (input.remove || (input.nextRole !== undefined && input.nextRole !== "ADMIN"));
  if (dropsLastAdmin) {
    return "Keep at least one admin.";
  }
  return null;
}
