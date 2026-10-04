import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "SalesOS — The Sales House", template: "%s · SalesOS" },
  description: "Sales operations platform for The Sales House (UI prototype).",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

const themeInit = `try{var t=localStorage.getItem("salesos.theme");if(!t)t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><Script id="theme-init" strategy="beforeInteractive">{themeInit}</Script></head>
      <body>{children}</body>
    </html>
  );
}
