import type { Metadata } from "next";

// Own icon and Home Screen name (owner 2026-11-20: each app has a unique icon).
// No manifest: MapPal's would make a Home Screen icon open "/" (the login);
// without one, iPhone saves this page's address as the start page.
export const metadata: Metadata = {
  title: "Camper",
  description: "Camper status and controls",
  manifest: null,
  appleWebApp: { capable: true, title: "Camper", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/app-icons/camper-32.png", sizes: "32x32", type: "image/png" },
      { url: "/app-icons/camper-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/app-icons/camper-180.png",
  },
};

export default function CamperLayout({ children }: LayoutProps<"/camper">) {
  return children;
}
