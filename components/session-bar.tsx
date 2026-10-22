import { logout } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { roleLabels, type Role } from "@/lib/roles";

export function SessionBar({ name, role }: { name: string; role: Role }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <p className="truncate text-sm text-muted-foreground">
        {name} · {roleLabels[role]}
      </p>
      <form action={logout}>
        <Button type="submit" variant="ghost" className="h-10 px-3">
          Sign out
        </Button>
      </form>
    </div>
  );
}
