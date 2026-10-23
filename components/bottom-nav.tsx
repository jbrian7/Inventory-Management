"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, LayoutDashboard, Package, ScanLine, Settings } from "lucide-react";

import { navColumns, primaryNav } from "@/lib/nav";
import { cn } from "@/lib/utils";

const icons = {
  "/": LayoutDashboard,
  "/scan": ScanLine,
  "/items": Package,
  "/history": History,
  "/settings": Settings,
} as const;

export function BottomNav({ showSettings }: { showSettings: boolean }) {
  const pathname = usePathname();
  const visible = primaryNav(showSettings);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <ul
        className={cn(
          "mx-auto grid max-w-md pb-[env(safe-area-inset-bottom)]",
          navColumns(visible.length)
        )}
      >
        {visible.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = icons[item.href as keyof typeof icons];

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
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
