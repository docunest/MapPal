"use client";

import { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, Popup, setWorkerUrl, type GeoJSONSource, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

setWorkerUrl("/maplibre-gl-worker.mjs");

const STYLE: StyleSpecification = {
  version: 8,
  sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors" } },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

export type Box = { s: number; w: number; n: number; e: number };
export interface DebugData {
  cells?: Array<{ geohash: string; status: string; count: number; fetchedAt?: string | null; error?: string | null; box: Box; fetchedBy?: string | null }>;
  hints?: Array<{ label: string; source: string; lat: number; lng: number; at: string; weight: number; used: boolean; note?: string }>;
  destinations?: Array<{ label: string; source: string; lat: number; lng: number }>;
  estimate?: { lat: number; lng: number; accuracyKm: number; confidence: number; label: string } | null;
  circles?: Array<{ lat: number; lng: number; radiusM: number; label: string; kind: "cafes" | "explore" | "area" }>;
  candidates?: Array<{ name: string; lat: number; lng: number; fate: string; why?: string; verdict?: string; id?: string; osmRef: string }>;
  focus?: { lat: number; lng: number; zoom?: number } | null;
}

export const FATE_COLOR: Record<string, string> = {
  kept: "#16a34a",
  "not kept": "#dc2626",
  "sent, not reviewed": "#f59e0b",
  "to check": "#2563eb",
  "over the cap (backlog)": "#94a3b8",
  "dropped by rules": "#475569",
};
const CELL_COLOR: Record<string, string> = { ok: "#16a34a", failed: "#dc2626", missing: "#9ca3af" };

const ring = (lat: number, lng: number, m: number) => {
  const pts: number[][] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    pts.push([lng + (m / 1000 / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.cos(a), lat + (m / 1000 / 110.57) * Math.sin(a)]);
  }
  return [pts];
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** One map for everything under a correlation id: index cells, location hints and the estimate, the zone, candidates by fate. */
export function DebugMap({ data, onCenter }: { data: DebugData; onCenter?: (c: { lat: number; lng: number }) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const fitted = useRef(false);

  useEffect(() => {
    if (!box.current) return;
    const m = new MapLibreMap({ container: box.current, style: STYLE, center: [-8, 40], zoom: 6, attributionControl: { compact: true } });
    map.current = m;
    m.on("load", () => {
      const empty = { type: "FeatureCollection" as const, features: [] };
      for (const id of ["cells", "circles", "candidates", "hints", "estimate", "dest"]) m.addSource(id, { type: "geojson", data: empty });
      m.addLayer({ id: "cells", type: "fill", source: "cells", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.15 } });
      m.addLayer({ id: "cells-line", type: "line", source: "cells", paint: { "line-color": ["get", "color"], "line-width": 1 } });
      m.addLayer({ id: "circles", type: "line", source: "circles", paint: { "line-color": ["match", ["get", "kind"], "cafes", "#7c3aed", "explore", "#0891b2", "#111827"], "line-width": 2, "line-dasharray": [2, 1] } });
      m.addLayer({ id: "estimate", type: "fill", source: "estimate", paint: { "fill-color": "#2563eb", "fill-opacity": 0.12, "fill-outline-color": "#1d4ed8" } });
      m.addLayer({ id: "candidates", type: "circle", source: "candidates", paint: { "circle-radius": ["match", ["get", "fate"], "dropped by rules", 3, "over the cap (backlog)", 3.5, 6], "circle-color": ["get", "color"], "circle-stroke-color": "#fff", "circle-stroke-width": 1 } });
      m.addLayer({ id: "dest", type: "circle", source: "dest", paint: { "circle-radius": 7, "circle-color": "#7c3aed", "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
      m.addLayer({ id: "hints", type: "circle", source: "hints", paint: { "circle-radius": ["case", ["get", "used"], 8, 5], "circle-color": ["case", ["get", "used"], "#1d4ed8", "#9ca3af"], "circle-stroke-color": "#fff", "circle-stroke-width": 2, "circle-opacity": ["max", 0.35, ["get", "weight"]] } });
      for (const layer of ["cells", "candidates", "hints", "dest"]) {
        m.on("click", layer, (e) => {
          const f = e.features?.[0];
          if (!f) return;
          new Popup({ maxWidth: "320px" }).setLngLat(e.lngLat).setHTML(`<div style="font-size:12px">${esc(String(f.properties?.info ?? ""))}</div>`).addTo(m);
        });
        m.on("mouseenter", layer, () => (m.getCanvas().style.cursor = "pointer"));
        m.on("mouseleave", layer, () => (m.getCanvas().style.cursor = ""));
      }
      setReady(true);
    });
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(box.current);
    return () => {
      ro.disconnect();
      m.remove();
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const set = (id: string, features: unknown[]) => (m.getSource(id) as GeoJSONSource).setData({ type: "FeatureCollection", features } as GeoJSON.FeatureCollection);
    set(
      "cells",
      (data.cells ?? []).map((c) => ({
        type: "Feature",
        properties: { color: CELL_COLOR[c.status] ?? "#9ca3af", info: `cell ${c.geohash}: ${c.status}, ${c.count} places${c.fetchedAt ? `, fetched ${c.fetchedAt.slice(0, 16)}` : ""}${c.error ? ` — ${c.error}` : ""}${c.fetchedBy ? ` (by ${c.fetchedBy})` : ""}` },
        geometry: { type: "Polygon", coordinates: [[[c.box.w, c.box.s], [c.box.e, c.box.s], [c.box.e, c.box.n], [c.box.w, c.box.n], [c.box.w, c.box.s]]] },
      })),
    );
    set("circles", (data.circles ?? []).map((c) => ({ type: "Feature", properties: { kind: c.kind }, geometry: { type: "Polygon", coordinates: ring(c.lat, c.lng, c.radiusM) } })));
    set("estimate", data.estimate ? [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: ring(data.estimate.lat, data.estimate.lng, Math.max(150, data.estimate.accuracyKm * 1000)) } }] : []);
    set(
      "candidates",
      (data.candidates ?? []).map((c) => ({
        type: "Feature",
        properties: { fate: c.fate, color: FATE_COLOR[c.fate] ?? "#2563eb", info: `${c.id ? `${c.id} ` : ""}${c.name} — ${c.fate}${c.verdict ? ` (${c.verdict}, AI)` : ""}${c.why ? ` · ${c.why}` : ""} · ${c.osmRef}` },
        geometry: { type: "Point", coordinates: [c.lng, c.lat] },
      })),
    );
    set(
      "hints",
      (data.hints ?? []).map((h) => ({
        type: "Feature",
        properties: { used: h.used, weight: h.weight, info: `${h.used ? "✓ used" : "· not used"} — ${h.label} · ${h.source} · ${String(h.at).slice(0, 16)} · weight ${h.weight}${h.note ? ` · ${h.note}` : ""}` },
        geometry: { type: "Point", coordinates: [h.lng, h.lat] },
      })),
    );
    set("dest", (data.destinations ?? []).map((d) => ({ type: "Feature", properties: { info: `destination — ${d.label} · ${d.source}` }, geometry: { type: "Point", coordinates: [d.lng, d.lat] } })));
    if (!fitted.current) {
      const pts = [
        ...(data.candidates ?? []).map((c) => [c.lng, c.lat]),
        ...(data.hints ?? []).slice(0, 10).map((h) => [h.lng, h.lat]),
        ...(data.cells ?? []).flatMap((c) => [[c.box.w, c.box.s], [c.box.e, c.box.n]]),
        ...(data.estimate ? [[data.estimate.lng, data.estimate.lat]] : []),
      ];
      if (pts.length) {
        fitted.current = true;
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        m.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 30, maxZoom: 13, duration: 0 });
      }
    }
  }, [ready, data]);

  useEffect(() => {
    if (data.focus && map.current) map.current.flyTo({ center: [data.focus.lng, data.focus.lat], zoom: data.focus.zoom ?? 14 });
  }, [data.focus]);

  return (
    <div className="relative h-full w-full">
      <div ref={box} className="h-full w-full" />
      {onCenter && (
        <button
          type="button"
          onClick={() => {
            const c = map.current?.getCenter();
            if (c) onCenter({ lat: c.lat, lng: c.lng });
          }}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-sm font-medium shadow"
        >
          📍 Index around the map centre
        </button>
      )}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xl text-neutral-700 opacity-50">+</div>
    </div>
  );
}

export function Legend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-neutral-600">
      {Object.entries(FATE_COLOR).map(([k, c]) => (
        <span key={k} className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c }} />
          {k}
        </span>
      ))}
      <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-700" />location hint used</span>
      <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-400" />hint not used</span>
      <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-violet-600" />destination</span>
      <span>▦ index cell: green ok · red failed · grey missing</span>
      <span>◌ purple = cafe circles · teal = exploration circle · blue fill = location estimate</span>
    </div>
  );
}
