import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { BottomNav } from "@/components/bottom-nav";
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
        <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background">
          <main className={cn("flex-1 px-4 pt-5", onLogin ? "pb-5" : "pb-24")}>
            {user && isRole(user.role) ? <SessionBar name={user.name} role={user.role} /> : null}
            {children}
          </main>
          {onLogin ? null : <BottomNav showSettings={showSettings} />}
        </div>
      </body>
    </html>
  );
}
