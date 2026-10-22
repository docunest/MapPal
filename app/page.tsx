"use client";

import dynamic from "next/dynamic";

// MapLibre/mapbox-gl-draw touch `window` at import time, so this must stay
// client-only — no SSR for this component.
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

export default function Home() {
  return <MapView />;
}
