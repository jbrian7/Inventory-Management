"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, History, LayoutDashboard, Package, ScanLine, Settings } from "lucide-react";

import { ProductLockup } from "@/components/product-lockup";
import { navColumns, primaryNav, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

const icons = {
  "/": LayoutDashboard,
  "/scan": ScanLine,
  "/items": Package,
  "/totes": Archive,
  "/history": History,
  "/settings": Settings,
} as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function BottomNav({ showSettings }: { showSettings: boolean }) {
  const pathname = usePathname();
  const visible = primaryNav(showSettings);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 px-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur supports-[backdrop-filter]:bg-background/80 print:hidden lg:hidden"
    >
      <ul
        className={cn(
          "mx-auto grid w-full max-w-md pb-[env(safe-area-inset-bottom)] tablet:max-w-3xl",
          navColumns(visible.length)
        )}
      >
        {visible.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} variant="bottom" />
        ))}
      </ul>
    </nav>
  );
}

export function SideNav({
  showSettings,
  product,
  business,
}: {
  showSettings: boolean;
  product: string;
  business: string;
}) {
  const pathname = usePathname();
  const visible = primaryNav(showSettings);

  return (
    <nav
      aria-label="Primary"
      className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r bg-background py-6 pl-[max(0.75rem,env(safe-area-inset-left))] pr-3 print:hidden lg:flex"
    >
      <div className="px-3 pb-4">
        <ProductLockup product={product} business={business} />
      </div>
      <ul className="flex flex-col gap-1">
        {visible.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} variant="side" />
        ))}
      </ul>
    </nav>
  );
}

function NavLink({
  item,
  pathname,
  variant,
}: {
  item: NavItem;
  pathname: string;
  variant: "bottom" | "side";
}) {
  const active = isActive(pathname, item.href);
  const Icon = icons[item.href as keyof typeof icons];

  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "font-medium",
          variant === "bottom" &&
            "flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[11px]",
          variant === "side" && "flex min-h-12 items-center gap-3 rounded-md px-3 text-sm",
          active ? "text-primary" : "text-muted-foreground",
          variant === "side" && active && "bg-secondary text-foreground"
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
        {item.label}
      </Link>
    </li>
  );
}
