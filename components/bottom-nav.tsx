"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, ScanLine, Settings } from "lucide-react";

import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/scan", label: "Scan", icon: ScanLine },
  { href: "/items", label: "Items", icon: Package },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function BottomNav({ showSettings }: { showSettings: boolean }) {
  const pathname = usePathname();
  const visible = showSettings ? items : items.filter((item) => item.href !== "/settings");

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <ul
        className={cn(
          "mx-auto grid max-w-md pb-[env(safe-area-inset-bottom)]",
          showSettings ? "grid-cols-4" : "grid-cols-3"
        )}
      >
        {visible.map((item) => {
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
