"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Map as MapLibreMap, Popup, type GeoJSONSource } from "maplibre-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "maplibre-gl/dist/maplibre-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";

interface Region {
  id: string;
  name: string;
  _count?: { tiles: number };
}

interface Category {
  id: string;
  slug: string;
  label: string;
}

interface Place {
  id: string;
  name: string;
  lat: number;
  lng: number;
  description: string | null;
  category: Category;
  confidence: number | null;
}

interface Tile {
  id: string;
  h3Index: string;
  boundary: GeoJSON.Feature<GeoJSON.Polygon>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const OSM_STYLE: any = {
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

const CATEGORY_COLORS: Record<string, string> = {
  waterfalls: "#1d7fd4",
  factories: "#c75c1f",
};

export default function MapView() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);

  const [regions, setRegions] = useState<Region[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());
  const [places, setPlaces] = useState<Place[]>([]);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [coverage, setCoverage] = useState<{ total: number; byStatus: Record<string, number> } | null>(
    null,
  );
  const [drawing, setDrawing] = useState(false);
  const [pendingBoundary, setPendingBoundary] = useState<GeoJSON.Polygon | null>(null);
  const [regionName, setRegionName] = useState("");
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRegions = useCallback(async () => {
    const res = await fetch("/api/regions");
    const data = await res.json();
    setRegions(data.regions ?? []);
  }, []);

  const loadCategories = useCallback(async () => {
    const res = await fetch("/api/categories");
    const data = await res.json();
    setCategories(data.categories ?? []);
    setActiveCategories(new Set((data.categories ?? []).map((c: Category) => c.slug)));
  }, []);

  const loadRegionData = useCallback(async (regionId: string) => {
    const [regionRes, placesRes, coverageRes] = await Promise.all([
      fetch(`/api/regions/${regionId}`),
      fetch(`/api/places?regionId=${regionId}`),
      fetch(`/api/coverage?regionId=${regionId}`),
    ]);
    const regionData = await regionRes.json();
    const placesData = await placesRes.json();
    const coverageData = await coverageRes.json();
    setTiles(regionData.region?.tiles ?? []);
    setPlaces(placesData.places ?? []);
    setCoverage(coverageData.summary ?? null);
  }, []);

  useEffect(() => {
    // Initial data load on mount — fetched data feeds state by design here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRegions();
    loadCategories();
  }, [loadRegions, loadCategories]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selectedRegionId) loadRegionData(selectedRegionId);
  }, [selectedRegionId, loadRegionData]);

  // Init map once.
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: mapContainer.current,
      style: OSM_STYLE,
      center: [-3.7, 40.4], // Madrid-ish default
      zoom: 5,
    });
    mapRef.current = map;

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true },
    });
    // @ts-expect-error -- mapbox-gl-draw types target mapbox-gl, maplibre-gl's IControl is compatible at runtime
    map.addControl(draw);
    drawRef.current = draw;

    // mapbox-gl-draw emits custom events MapLibre's types don't know about.
    (map as unknown as { on: (event: string, cb: () => void) => void }).on("draw.create", () => {
      const data = draw.getAll();
      const feature = data.features[0];
      if (feature && feature.geometry.type === "Polygon") {
        setPendingBoundary(feature.geometry as GeoJSON.Polygon);
      }
    });

    map.on("load", () => {
      map.addSource("tiles", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "tiles-outline",
        type: "line",
        source: "tiles",
        paint: { "line-color": "#888", "line-width": 1, "line-opacity": 0.6 },
      });

      map.addSource("places", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "places-points",
        type: "circle",
        source: "places",
        paint: {
          "circle-radius": 6,
          "circle-color": ["get", "color"],
          "circle-stroke-width": 1,
          "circle-stroke-color": "#fff",
        },
      });

      map.on("click", "places-points", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as Record<string, string>;
        new Popup()
          .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
          .setHTML(`<strong>${p.name}</strong><br/>${p.categoryLabel}<br/>${p.description ?? ""}`)
          .addTo(map);
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Push tiles to the map whenever they change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("tiles")) return;
    const source = map.getSource("tiles") as GeoJSONSource;
    source.setData({
      type: "FeatureCollection",
      features: tiles.map((t) => t.boundary),
    });

    if (tiles.length > 0) {
      const lats = tiles.map((t) => t.boundary.geometry.coordinates[0].map((c) => c[1])).flat();
      const lngs = tiles.map((t) => t.boundary.geometry.coordinates[0].map((c) => c[0])).flat();
      map.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: 40, duration: 500 },
      );
    }
  }, [tiles]);

  // Push places to the map whenever they or the category filter change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("places")) return;
    const source = map.getSource("places") as GeoJSONSource;
    const filtered = places.filter((p) => activeCategories.has(p.category.slug));
    source.setData({
      type: "FeatureCollection",
      features: filtered.map((p) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        properties: {
          name: p.name,
          categoryLabel: p.category.label,
          description: p.description,
          color: CATEGORY_COLORS[p.category.slug] ?? "#444",
        },
      })),
    });
  }, [places, activeCategories]);

  function toggleDrawing() {
    if (!drawRef.current) return;
    if (drawing) {
      drawRef.current.changeMode("simple_select");
      setDrawing(false);
    } else {
      drawRef.current.changeMode("draw_polygon");
      setDrawing(true);
    }
  }

  async function submitNewRegion() {
    if (!pendingBoundary || !regionName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/regions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: regionName.trim(), boundary: pendingBoundary }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ? JSON.stringify(data.error) : "Failed to create region");

      drawRef.current?.deleteAll();
      setPendingBoundary(null);
      setRegionName("");
      setDrawing(false);
      await loadRegions();
      setSelectedRegionId(data.region.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function scanPendingJobs() {
    if (!selectedRegionId) return;
    setScanning(true);
    try {
      let totalRan = 0;
      // Keep running batches until nothing's left pending, so one click
      // scans the whole region instead of just the first few tiles.
      for (let i = 0; i < 50; i++) {
        const res = await fetch("/api/jobs/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 10 }),
        });
        const data = await res.json();
        totalRan += data.ran ?? 0;
        if (!data.ran) break;
      }
      await loadRegionData(selectedRegionId);
      if (totalRan === 0) setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  }

  function toggleCategory(slug: string) {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  return (
    <div className="flex h-screen w-full">
      <aside className="w-80 shrink-0 border-r bg-white overflow-y-auto p-4 space-y-5 text-sm">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold">MapPal</h1>
            <p className="text-neutral-500">Local points-of-interest indexer</p>
          </div>
          <button onClick={() => signOut()} className="text-xs text-neutral-400 underline">
            Sign out
          </button>
        </div>

        <section className="space-y-2">
          <h2 className="font-medium">Region</h2>
          <select
            className="w-full border rounded px-2 py-1"
            value={selectedRegionId ?? ""}
            onChange={(e) => setSelectedRegionId(e.target.value || null)}
          >
            <option value="">Select a region…</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r._count?.tiles ?? 0} tiles)
              </option>
            ))}
          </select>

          <button
            onClick={toggleDrawing}
            className={`w-full rounded px-2 py-1 border ${drawing ? "bg-neutral-900 text-white" : ""}`}
          >
            {drawing ? "Drawing… click to finish polygon" : "Draw new region on map"}
          </button>

          {pendingBoundary && (
            <div className="space-y-2 border rounded p-2 bg-neutral-50">
              <input
                className="w-full border rounded px-2 py-1"
                placeholder="Region name, e.g. Galicia"
                value={regionName}
                onChange={(e) => setRegionName(e.target.value)}
              />
              <button
                disabled={busy || !regionName.trim()}
                onClick={submitNewRegion}
                className="w-full rounded bg-blue-600 text-white py-1 disabled:opacity-50"
              >
                {busy ? "Creating…" : "Create region + tiles"}
              </button>
            </div>
          )}
        </section>

        {selectedRegionId && (
          <>
            <section className="space-y-2">
              <h2 className="font-medium">Categories</h2>
              {categories.map((c) => (
                <label key={c.slug} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={activeCategories.has(c.slug)}
                    onChange={() => toggleCategory(c.slug)}
                  />
                  <span
                    className="inline-block w-3 h-3 rounded-full"
                    style={{ background: CATEGORY_COLORS[c.slug] ?? "#444" }}
                  />
                  {c.label}
                </label>
              ))}
            </section>

            <section className="space-y-2">
              <h2 className="font-medium">Scan</h2>
              <button
                onClick={scanPendingJobs}
                disabled={scanning}
                className="w-full rounded bg-emerald-600 text-white py-1 disabled:opacity-50"
              >
                {scanning ? "Scanning tiles…" : "Scan pending tiles"}
              </button>
              {coverage && (
                <div className="text-xs text-neutral-600 space-y-0.5">
                  <div>Total jobs: {coverage.total}</div>
                  {Object.entries(coverage.byStatus).map(([status, count]) => (
                    <div key={status}>
                      {status}: {count}
                    </div>
                  ))}
                  <Link href={`/coverage?regionId=${selectedRegionId}`} className="text-blue-600 underline">
                    Full coverage ledger →
                  </Link>
                </div>
              )}
            </section>

            <section>
              <p className="text-xs text-neutral-500">{places.length} places indexed in this region</p>
            </section>
          </>
        )}

        {error && <p className="text-red-600 text-xs">{error}</p>}
      </aside>

      <div ref={mapContainer} className="flex-1" />
    </div>
  );
}
