"use client";

import { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, Marker, setWorkerUrl, type GeoJSONSource, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { VOTE_UI, type ReviewPlace } from "./shared";

// Turbopack can't bundle MapLibre's worker; it's served from public/ (scripts/copy-maplibre-worker.mjs).
setWorkerUrl("/maplibre-gl-worker.mjs");

const STYLE: StyleSpecification = {
  version: 8,
  sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors" } },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

export interface MapLayers {
  sent: Array<{ id: string; title: string; lat: number; lng: number; at: string }>;
  tiles: Array<{ geohash: string; category: string; status: string; count?: number; ageDays?: number | null; box: { s: number; w: number; n: number; e: number } }>;
}

export interface MapShow {
  nope: boolean;
  never: boolean;
  sent: boolean;
  tiles: boolean;
}

/** Place-index cells (≈ 30 × 20 km boxes of stored OpenStreetMap places): colour and label by status. */
const CELL = { ok: "#16a34a", indexed: "#16a34a", stale: "#d97706", failed: "#dc2626", missing: "#6b7280" } as Record<string, string>;
const cellLabel = (t: MapLayers["tiles"][number]) =>
  t.status === "missing" ? "not indexed" : t.status === "failed" ? "✗ failed" : `${t.status === "stale" ? "⟳ old · " : "✓ "}${(t.count ?? 0).toLocaleString()} places${t.ageDays != null ? ` · ${t.ageDays} d` : ""}`;

const UNVOTED = "#2563eb";
const UNCHECKED = "#94a3b8";

function circle(lat: number, lng: number, km: number) {
  const pts: number[][] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    pts.push([lng + (km / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.cos(a), lat + (km / 110.57) * Math.sin(a)]);
  }
  return { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [pts] } };
}

/**
 * All places in the scope on one map, coloured by your vote (blue = not
 * voted yet, grey = not checked by the agent); links sent to the car in
 * purple; the agent's indexed tiles as shaded squares; the scope circle.
 */
export function ReviewMap({
  places,
  voter,
  me,
  scope,
  layers,
  show,
  categories,
  onSelect,
  onCenter,
}: {
  places: ReviewPlace[];
  voter: string;
  me?: { lat: number; lng: number } | null;
  scope: { lat: number; lng: number; radiusKm: number | null };
  layers: MapLayers | null;
  show: MapShow;
  categories: string[];
  onSelect: (p: ReviewPlace | null) => void;
  onCenter: (c: { lat: number; lng: number }) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const meMarker = useRef<Marker | null>(null);
  const cellMarkers = useRef<Marker[]>([]);
  const placesRef = useRef(places);
  const centerCb = useRef(onCenter);
  const selectCb = useRef(onSelect);
  const fitted = useRef(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    placesRef.current = places;
    centerCb.current = onCenter;
    selectCb.current = onSelect;
  });

  useEffect(() => {
    if (!box.current) return;
    const m = new MapLibreMap({ container: box.current, style: STYLE, center: [scope.lng, scope.lat], zoom: 10, attributionControl: { compact: true } });
    map.current = m;
    m.on("load", () => {
      const empty = { type: "FeatureCollection" as const, features: [] };
      m.addSource("scope", { type: "geojson", data: empty });
      m.addSource("tiles", { type: "geojson", data: empty });
      m.addSource("sent", { type: "geojson", data: empty });
      m.addSource("places", { type: "geojson", data: empty });
      const cellColor = ["match", ["get", "status"], "ok", CELL.ok, "indexed", CELL.ok, "stale", CELL.stale, "failed", CELL.failed, CELL.missing] as unknown as string;
      m.addLayer({ id: "tiles", type: "fill", source: "tiles", paint: { "fill-color": cellColor, "fill-opacity": ["match", ["get", "status"], "missing", 0.06, 0.14] } });
      m.addLayer({ id: "tiles-line", type: "line", source: "tiles", filter: ["!=", ["get", "status"], "missing"], paint: { "line-color": cellColor, "line-width": 2 } });
      m.addLayer({ id: "tiles-missing", type: "line", source: "tiles", filter: ["==", ["get", "status"], "missing"], paint: { "line-color": CELL.missing, "line-width": 1.5, "line-dasharray": [3, 2] } });
      m.addLayer({ id: "scope", type: "line", source: "scope", paint: { "line-color": "#2563eb", "line-width": 2, "line-dasharray": [2, 2] } });
      m.addLayer({ id: "sent", type: "circle", source: "sent", paint: { "circle-radius": 7, "circle-color": "#7c3aed", "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
      m.addLayer({ id: "sent-label", type: "symbol", source: "sent", layout: { "text-field": "🚐", "text-size": 10, "text-allow-overlap": true } });
      m.addLayer({ id: "places", type: "circle", source: "places", paint: { "circle-radius": ["case", ["get", "visited"], 9, 7], "circle-color": ["get", "color"], "circle-stroke-color": ["case", ["get", "visited"], "#1d4ed8", "#ffffff"], "circle-stroke-width": ["case", ["get", "visited"], 3, 2] } });
      m.on("click", "places", (e) => {
        const key = e.features?.[0]?.properties?.key;
        selectCb.current(placesRef.current.find((p) => p.key === key) ?? null);
      });
      m.on("mouseenter", "places", () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", "places", () => (m.getCanvas().style.cursor = ""));
      setReady(true);
    });
    // The map may start hidden (phone: Cards tab) — redraw at the right size when it shows.
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(box.current);
    return () => {
      ro.disconnect();
      m.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const draw = () => {
      const visible = places.filter((p) => {
        const v = p.votes?.[voter];
        return !(v === "nope" && !show.nope) && !(v === "never" && !show.never);
      });
      (m.getSource("places") as GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: visible.map((p) => {
          const v = p.votes?.[voter];
          return {
            type: "Feature",
            properties: { key: p.key, color: v ? VOTE_UI[v].color : p.checked ? UNVOTED : UNCHECKED, visited: !!p.visitedAt },
            geometry: { type: "Point", coordinates: [p.lng, p.lat] },
          };
        }),
      });
      (m.getSource("sent") as GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: show.sent ? (layers?.sent ?? []).map((s) => ({ type: "Feature", properties: { title: s.title }, geometry: { type: "Point", coordinates: [s.lng, s.lat] } })) : [],
      });
      (m.getSource("tiles") as GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: show.tiles
          ? (layers?.tiles ?? [])
              .filter((t) => !t.category || !categories.length || categories.includes(t.category))
              .map((t) => ({
                type: "Feature",
                properties: { status: t.status },
                geometry: { type: "Polygon", coordinates: [[[t.box.w, t.box.s], [t.box.e, t.box.s], [t.box.e, t.box.n], [t.box.w, t.box.n], [t.box.w, t.box.s]]] },
              }))
          : [],
      });
      // Cell labels as small HTML tags (the map style has no font for text layers).
      for (const mk of cellMarkers.current) mk.remove();
      cellMarkers.current = show.tiles
        ? (layers?.tiles ?? []).map((t) => {
            const el = document.createElement("div");
            el.textContent = cellLabel(t);
            el.style.cssText = `pointer-events:none;font:600 11px system-ui,sans-serif;color:${CELL[t.status] ?? CELL.missing};background:rgba(255,255,255,.85);padding:1px 6px;border-radius:9px;white-space:nowrap`;
            return new Marker({ element: el }).setLngLat([(t.box.w + t.box.e) / 2, (t.box.s + t.box.n) / 2]).addTo(m);
          })
        : [];
      (m.getSource("scope") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: scope.radiusKm ? [circle(scope.lat, scope.lng, scope.radiusKm)] : [] });
      if (!fitted.current && visible.length) {
        fitted.current = true;
        const lats = visible.map((p) => p.lat).concat(scope.lat);
        const lngs = visible.map((p) => p.lng).concat(scope.lng);
        m.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 40, maxZoom: 14, duration: 0 });
      }
    };
    if (ready) draw();
  }, [ready, places, voter, layers, show, scope, categories]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    meMarker.current?.remove();
    if (me) {
      const el = document.createElement("div");
      el.style.cssText = "width:16px;height:16px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 4px rgba(37,99,235,.3)";
      meMarker.current = new Marker({ element: el }).setLngLat([me.lng, me.lat]).addTo(m);
    }
  }, [me]);

  return (
    <div className="relative h-full w-full">
      <div ref={box} className="h-full w-full" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl text-neutral-700 opacity-60">+</div>
      <button
        type="button"
        onClick={() => {
          const c = map.current?.getCenter();
          if (c) centerCb.current({ lat: c.lat, lng: c.lng });
        }}
        className="absolute bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-4 py-2 text-sm font-medium shadow"
      >
        📍 Search here
      </button>
    </div>
  );
}
