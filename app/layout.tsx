import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "SalesOS — The Sales House", template: "%s · SalesOS" },
  description: "Sales operations for The Sales House (UI prototype).",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0a0a0d" };

const themeInit = `try{var t=localStorage.getItem("salesos.theme")||"dark";document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head><Script id="theme-init" strategy="beforeInteractive">{themeInit}</Script></head>
      <body>{children}</body>
    </html>
  );
}
