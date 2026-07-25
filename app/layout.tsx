import type { Metadata, Viewport } from "next";

import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Family Hub",
  description: "Shared memos, schedule, groceries and anniversaries.",
  manifest: "/manifest.webmanifest",
  applicationName: "Family Hub",
  // Makes iOS treat the installed app as standalone (no Safari chrome).
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Family Hub",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  // A private family app has no business showing up in search results.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // "cover" lets the app draw into the notch/home-bar area; globals.css then
  // pads content back out with env(safe-area-inset-*).
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0e11" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
