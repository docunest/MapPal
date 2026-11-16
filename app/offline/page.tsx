"use client";

import dynamic from "next/dynamic";

// Offline places: download the monthly OSM packs to the phone, look them up with no signal.
const OfflineApp = dynamic(() => import("@/components/offline/OfflineApp"), { ssr: false });

export default function OfflinePage() {
  return <OfflineApp />;
}
