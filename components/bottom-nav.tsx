"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, LayoutDashboard, Package, ScanLine } from "lucide-react";

import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/items", label: "Items", icon: Package },
  { href: "/scan", label: "Scan", icon: ScanLine },
  { href: "/history", label: "History", icon: History },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4 pb-[env(safe-area-inset-bottom)]">
        {items.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
