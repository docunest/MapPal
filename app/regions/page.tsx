"use client";

import dynamic from "next/dynamic";

// The original region indexer (draw an area → tile → scan). MapLibre and
// mapbox-gl-draw touch `window` at import time, so client-only.
const RegionIndexer = dynamic(() => import("@/components/RegionIndexer"), { ssr: false });

export default function RegionsPage() {
  return <RegionIndexer />;
}
