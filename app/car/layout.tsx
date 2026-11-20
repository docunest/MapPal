import type { Metadata } from "next";

// Own icon and Home Screen name (owner 2026-11-20: each app has a unique icon).
// No manifest: MapPal's would make a Home Screen icon open "/" (the login);
// without one, iPhone saves this page's address as the start page.
export const metadata: Metadata = {
  title: "Car",
  description: "Car places",
  manifest: null,
  appleWebApp: { capable: true, title: "Car", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/app-icons/car-32.png", sizes: "32x32", type: "image/png" },
      { url: "/app-icons/car-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/app-icons/car-180.png",
  },
};

export default function CarLayout({ children }: LayoutProps<"/car">) {
  return children;
}
