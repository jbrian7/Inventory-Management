import { logout } from "@/app/login/actions";
import { ProductLockup } from "@/components/product-lockup";
import { Button } from "@/components/ui/button";
import { businessName, productName } from "@/lib/brand";
import { roleLabels, type Role } from "@/lib/roles";

export function SessionBar({ name, role }: { name: string; role: Role }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="lg:hidden">
          <ProductLockup product={productName} business={businessName()} />
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {name} · {roleLabels[role]}
        </p>
      </div>
      <form action={logout}>
        <Button type="submit" variant="ghost" className="h-11 px-3">
          Sign out
        </Button>
      </form>
    </div>
  );
}
