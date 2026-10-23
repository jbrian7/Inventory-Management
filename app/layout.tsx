import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { BottomNav, SideNav } from "@/components/bottom-nav";
import { SessionBar } from "@/components/session-bar";
import { getCurrentUser } from "@/lib/current-user";
import { canManageSettings, isRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Zap Zone Inventory",
  description:
    "Mobile inventory for Zap Zone prizes, novelties, and arcade parts.",
  applicationName: "Zap Zone Inventory",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = headers().get("x-pathname") ?? "";
  const onLogin = pathname === "/login";
  const user = onLogin ? null : await getCurrentUser();
  if (!onLogin && pathname && !user) {
    redirect("/login?reauth=1");
  }
  const showSettings = user ? canManageSettings(user.role) : false;

  return (
    <html lang="en">
      <body className={`${geistSans.className} antialiased`}>
        <div
          className={cn(
            "mx-auto flex min-h-dvh w-full flex-col bg-background",
            onLogin ? "max-w-md" : "max-w-md tablet:max-w-3xl lg:!max-w-6xl lg:flex-row"
          )}
        >
          {onLogin ? null : <SideNav showSettings={showSettings} />}
          <div className="flex min-w-0 flex-1 flex-col">
            <main
              className={cn(
                "flex-1 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] tablet:px-6 lg:!px-8",
                onLogin
                  ? "pb-[max(1.25rem,env(safe-area-inset-bottom))]"
                  : "pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:pb-8 lg:pr-[max(2rem,env(safe-area-inset-right))]"
              )}
            >
              {user && isRole(user.role) ? <SessionBar name={user.name} role={user.role} /> : null}
              {children}
            </main>
            {onLogin ? null : <BottomNav showSettings={showSettings} />}
          </div>
        </div>
      </body>
    </html>
  );
}
