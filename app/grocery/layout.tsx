import type { Metadata, Viewport } from "next";
import "@/domains/grocery/ui/grocery.css";

// Grocery list module (AGENTS.md G6). Its own token auth (domains/grocery/infrastructure/auth.ts),
// not the MapPal login — proxy.ts lets /grocery and /api/grocery through.
export const metadata: Metadata = {
  title: "Pirkiniai",
  description: "Family grocery list",
  // No manifest here (MapPal's would make the Home Screen icon open "/" and
  // its login). Without one, iPhone Safari saves the current address —
  // /grocery?t=<token> — as the Home Screen app's start page.
  manifest: null,
  appleWebApp: { capable: true, title: "Pirkiniai", statusBarStyle: "default" },
  other: { "apple-mobile-web-app-capable": "yes" },
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
