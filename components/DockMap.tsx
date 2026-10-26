"use client";

import { useEffect, useRef } from "react";
import { Map as MapLibreMap, Marker, Popup, LngLatBounds, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export interface DockMapItem {
  id: string;
  kind: "link" | "bookmark";
  title: string;
  lat: number | null;
  lng: number | null;
  locatedBy: "link" | "search" | "gps" | "none";
  address: string | null;
  seenAt: string | null;
}

const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

// Same colours the head unit uses: amber = not in the car yet, blue = sent
// link, green = bookmark saved in the car.
function colorFor(i: DockMapItem): string {
  if (i.kind === "bookmark") return "#16a34a";
  return i.seenAt ? "#2563eb" : "#f59e0b";
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function wazeUrl(i: { lat: number | null; lng: number | null; title: string }) {
  return i.lat != null && i.lng != null
    ? `https://waze.com/ul?ll=${i.lat},${i.lng}&navigate=yes`
    : `https://waze.com/ul?q=${encodeURIComponent(i.title)}&navigate=yes`;
}

export function gmapsUrl(i: { lat: number | null; lng: number | null; title: string }) {
  return i.lat != null && i.lng != null
    ? `https://www.google.com/maps/search/?api=1&query=${i.lat},${i.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(i.title)}`;
}

/**
 * Preview of every shared link / bookmark on a map — what the car will
 * drive to. Approximate pins (found by name search, not in the link) are
 * drawn faded and say so, so a wrong guess is easy to spot before driving.
 */
export default function DockMap({
  items,
  selectedId,
  onSelect,
}: {
  items: DockMapItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const fitted = useRef(false);

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    mapRef.current = new MapLibreMap({ container: container.current, style: OSM_STYLE, center: [-4, 40.2], zoom: 5 });
    const placed = markers.current;
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      placed.clear();
      fitted.current = false;
    };
  }, []);

  // Markers follow the item list.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const placed = items.filter((i) => i.lat != null && i.lng != null);
    const keep = new Set(placed.map((i) => i.id));
    for (const [id, m] of markers.current) {
      if (!keep.has(id)) {
        m.remove();
        markers.current.delete(id);
      }
    }
    for (const i of placed) {
      markers.current.get(i.id)?.remove();
      const approx = i.locatedBy === "search";
      const how =
        i.locatedBy === "search"
          ? "Approximate — found by name search, not in the link"
          : i.locatedBy === "gps"
            ? "Saved from the car's GPS"
            : "Exact — coordinates were in the link";
      const popup = new Popup({ offset: 24, maxWidth: "280px" }).setHTML(
        `<div style="font:14px system-ui;color:#111">
          <b>${escapeHtml(i.title)}</b>
          ${i.address ? `<div style="font-size:12px;color:#555">${escapeHtml(i.address)}</div>` : ""}
          <div style="font-size:12px;color:${approx ? "#b45309" : "#555"};margin-top:2px">${how}</div>
          <div style="margin-top:6px;display:flex;gap:8px">
            <a href="${wazeUrl(i)}" target="_blank" rel="noreferrer" style="color:#0284c7">Waze</a>
            <a href="${gmapsUrl(i)}" target="_blank" rel="noreferrer" style="color:#16a34a">Google Maps</a>
          </div>
        </div>`,
      );
      const marker = new Marker({ color: colorFor(i), opacity: approx ? "0.55" : "1" })
        .setLngLat([i.lng!, i.lat!])
        .setPopup(popup)
        .addTo(map);
      marker.getElement().addEventListener("click", () => onSelect(i.id));
      marker.getElement().style.cursor = "pointer";
      markers.current.set(i.id, marker);
    }
    if (!fitted.current && placed.length) {
      fitted.current = true;
      const bounds = new LngLatBounds();
      placed.slice(0, 30).forEach((i) => bounds.extend([i.lng!, i.lat!]));
      map.fitBounds(bounds, { padding: 50, maxZoom: 13, duration: 0 });
    }
  }, [items, onSelect]);

  // Selecting a row flies there and opens its card.
  useEffect(() => {
    const map = mapRef.current;
    const m = selectedId ? markers.current.get(selectedId) : undefined;
    if (!map || !m) return;
    map.flyTo({ center: m.getLngLat(), zoom: Math.max(map.getZoom(), 13) });
    for (const other of markers.current.values()) if (other !== m && other.getPopup()?.isOpen()) other.togglePopup();
    if (!m.getPopup()?.isOpen()) m.togglePopup();
  }, [selectedId, items]);

  return <div ref={container} className="h-72 w-full overflow-hidden rounded border md:h-[28rem]" />;
}
