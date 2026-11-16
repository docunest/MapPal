import type { MetadataRoute } from "next";

// Home Screen app (owner 2026-11-16): opens full screen and, with the service worker
// (public/sw.js), with no signal — for the offline places (/offline).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MapPal",
    short_name: "MapPal",
    description: "Nearby essentials for the camper — also offline",
    start_url: "/",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#171717",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
