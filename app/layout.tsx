import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { BottomNav } from "@/components/bottom-nav";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.className} antialiased`}>
        <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background">
          <main className="flex-1 px-4 pb-24 pt-5">{children}</main>
          <BottomNav />
        </div>
      </body>
    </html>
  );
}
