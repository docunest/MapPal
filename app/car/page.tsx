"use client";

import dynamic from "next/dynamic";

// Car places on the phone without logging in: open once as /car#t=<dock
// token> (the token stays in this browser, the link can be bookmarked).
const CarPlacesApp = dynamic(() => import("@/components/nearby/CarPlacesApp"), { ssr: false });

export default function CarPage() {
  return <CarPlacesApp />;
}
