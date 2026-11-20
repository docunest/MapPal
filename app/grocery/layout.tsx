import type { Metadata, Viewport } from "next";
import "./grocery.css";

// Grocery list module (AGENTS.md G6). Its own token auth (lib/grocery/auth.ts),
// not the MapPal login — proxy.ts lets /grocery and /api/grocery through.
export const metadata: Metadata = {
  title: "Pirkiniai",
  description: "Family grocery list",
  appleWebApp: { capable: true, title: "Pirkiniai", statusBarStyle: "default" },
  icons: { apple: "/grocery/apple-touch-icon.png", icon: "/grocery/icon-192.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#141614" },
  ],
};

export default function GroceryLayout({ children }: LayoutProps<"/grocery">) {
  return <div className="grocery-root">{children}</div>;
}
