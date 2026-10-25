"use client";

import { useCallback, useEffect, useState } from "react";

export interface Located {
  lat: number;
  lng: number;
  accuracy?: number;
  /** "link" = coordinates came in the URL (the Android button), "gps" = this browser. */
  source: "link" | "gps";
}

export type LocationState =
  | { status: "locating" }
  | { status: "ready"; loc: Located }
  | { status: "error"; message: string };

function describe(err: GeolocationPositionError): string {
  if (err.code === err.PERMISSION_DENIED) {
    return "Location is blocked for this site. Allow it in the browser's site settings, or open MapPal from the Android button.";
  }
  if (err.code === err.TIMEOUT) return "Timed out getting your location — try again.";
  return `Couldn't get your location: ${err.message}`;
}

// Stable contract with the Android button (android/README.md): it opens
// /?lat=..&lng=..&acc=.. — keep these names; the APK is installed once.
function fromUrl(): Located | null {
  const p = new URLSearchParams(window.location.search);
  const lat = Number(p.get("lat"));
  const lng = Number(p.get("lng"));
  if (!p.get("lat") || !p.get("lng") || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }
  const acc = Number(p.get("acc"));
  return { lat, lng, accuracy: Number.isFinite(acc) && acc > 0 ? acc : undefined, source: "link" };
}

/** Coordinates from the URL win (Android button); otherwise the browser's GPS. */
export function useLocation() {
  const [state, setState] = useState<LocationState>({ status: "locating" });

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setState({ status: "error", message: "This browser has no location support." });
      return;
    }
    setState({ status: "locating" });
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setState({
          status: "ready",
          loc: { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, source: "gps" },
        }),
      (err) => setState({ status: "error", message: describe(err) }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }, []);

  useEffect(() => {
    const linked = fromUrl();
    // Reading the URL/GPS is inherently a client-side effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (linked) setState({ status: "ready", loc: linked });
    else locate();
  }, [locate]);

  /** Drop the link's coordinates and use this device's GPS. */
  const switchToGps = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("lat");
    url.searchParams.delete("lng");
    url.searchParams.delete("acc");
    window.history.replaceState(null, "", url);
    locate();
  }, [locate]);

  return { state, refresh: locate, switchToGps };
}
