"use client";

import dynamic from "next/dynamic";

// Nearby: Utilities (fuel, restaurants, groceries) and Sightseeing around
// the current position — or the ?lat=&lng= the Android button opens us with.
// Location and opening hours only exist in the browser, so client-only.
const NearbyApp = dynamic(() => import("@/components/nearby/NearbyApp"), { ssr: false });

export default function Home() {
  return <NearbyApp />;
}
