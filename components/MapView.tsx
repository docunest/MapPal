"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Map as MapLibreMap, Marker, Popup, type GeoJSONSource } from "maplibre-gl";
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
  const myLocationMarkerRef = useRef<Marker | null>(null);

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  // Default the sidebar open on desktop-sized screens, closed on mobile —
  // only known client-side, so set it after mount rather than in render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSidebarOpen(window.innerWidth >= 768);
  }, []);

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

  function locateMe() {
    const map = mapRef.current;
    if (!map || !navigator.geolocation) {
      setLocateError("Geolocation isn't available in this browser.");
      return;
    }

    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const lngLat: [number, number] = [pos.coords.longitude, pos.coords.latitude];

        if (!myLocationMarkerRef.current) {
          const el = document.createElement("div");
          el.style.width = "16px";
          el.style.height = "16px";
          el.style.borderRadius = "50%";
          el.style.background = "#1d7fd4";
          el.style.border = "3px solid #fff";
          el.style.boxShadow = "0 0 0 2px rgba(29,127,212,0.4)";
          myLocationMarkerRef.current = new Marker({ element: el }).setLngLat(lngLat).addTo(map);
        } else {
          myLocationMarkerRef.current.setLngLat(lngLat);
        }

        map.flyTo({ center: lngLat, zoom: Math.max(map.getZoom(), 13), duration: 800 });
      },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setLocateError(
            "Location access is blocked for this site. On iPhone: Settings → Privacy & Security → Location Services → make sure it's on, then find this browser in the list and set it to \"Ask Next Time\" or \"While Using\". If you already denied it once, tap the \"AA\" icon in the address bar → Website Settings → Location → Ask.",
          );
        } else if (err.code === err.TIMEOUT) {
          setLocateError("Timed out getting your location — try again, ideally outdoors or near a window.");
        } else {
          setLocateError(`Couldn't get your location: ${err.message}`);
        }
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
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
    <div className="relative flex h-screen w-full overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-10 bg-black/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-20 w-80 max-w-[85vw] transform overflow-y-auto border-r bg-white p-4 space-y-5 text-sm transition-transform duration-200 md:static md:z-auto md:translate-x-0 md:shrink-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold">MapPal</h1>
            <p className="text-neutral-500">Local points-of-interest indexer</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => signOut()} className="text-xs text-neutral-400 underline">
              Sign out
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
              className="rounded border px-2 py-1 text-neutral-500 md:hidden"
            >
              ✕
            </button>
          </div>
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

      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Open sidebar"
          className="fixed top-3 left-3 z-20 flex h-10 w-10 items-center justify-center rounded bg-white border shadow md:hidden"
        >
          ☰
        </button>
      )}

      {locateError && (
        <div
          role="alert"
          className="fixed bottom-20 right-4 left-4 z-20 max-w-sm rounded-lg border border-red-200 bg-white p-3 text-sm text-red-700 shadow-lg md:left-auto"
        >
          <div className="flex items-start justify-between gap-2">
            <p>{locateError}</p>
            <button
              onClick={() => setLocateError(null)}
              aria-label="Dismiss"
              className="shrink-0 text-red-400"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <button
        onClick={locateMe}
        disabled={locating}
        aria-label="Use my location"
        title="Use my location"
        className="fixed bottom-6 right-4 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white border shadow-lg disabled:opacity-50"
      >
        {locating ? "…" : "📍"}
      </button>

      <div ref={mapContainer} className="flex-1" />
    </div>
  );
}
