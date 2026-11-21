"use client";

import { useEffect, useRef, useState } from "react";

// A small static map (OSM tiles, no map library): the place, and you if we
// know where you are, both in view.
const TILE = 256;
const project = (lat: number, lng: number, z: number) => {
  const s = TILE * 2 ** z;
  const r = (lat * Math.PI) / 180;
  return { x: ((lng + 180) / 360) * s, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * s };
};

/** Fills its container's width (measured), fixed height. */
export function MiniMap({ place, me, height = 150 }: { place: { lat: number; lng: number }; me?: { lat: number; lng: number } | null; height?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(120, Math.round(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pad = 28;
  let z = 15;
  if (me) {
    for (z = 16; z > 3; z--) {
      const a = project(place.lat, place.lng, z);
      const b = project(me.lat, me.lng, z);
      if (Math.abs(a.x - b.x) + pad * 2 <= width && Math.abs(a.y - b.y) + pad * 2 <= height) break;
    }
  }
  const p = project(place.lat, place.lng, z);
  const m = me ? project(me.lat, me.lng, z) : null;
  const cx = m ? (p.x + m.x) / 2 : p.x;
  const cy = m ? (p.y + m.y) / 2 : p.y;
  const left = cx - width / 2;
  const top = cy - height / 2;
  const tiles: Array<{ x: number; y: number }> = [];
  const max = 2 ** z;
  for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + width) / TILE); tx++)
    for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + height) / TILE); ty++) if (ty >= 0 && ty < max) tiles.push({ x: tx, y: ty });
  const dot = (q: { x: number; y: number }, color: string, size: number) => (
    <span
      className="absolute rounded-full border-2 border-white shadow"
      style={{ left: q.x - left - size / 2, top: q.y - top - size / 2, width: size, height: size, background: color }}
    />
  );
  return (
    <div ref={box} className="relative w-full overflow-hidden rounded-lg bg-neutral-200" style={{ height }} aria-label="Map: the place (red) and you (blue)">
      {tiles.map((t) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${t.x}-${t.y}`}
          src={`https://tile.openstreetmap.org/${z}/${((t.x % max) + max) % max}/${t.y}.png`}
          alt=""
          draggable={false}
          className="absolute max-w-none select-none"
          style={{ left: t.x * TILE - left, top: t.y * TILE - top, width: TILE, height: TILE }}
        />
      ))}
      {m && dot(m, "#2563eb", 14)}
      {dot(p, "#dc2626", 18)}
      <span className="absolute bottom-0 right-0 bg-white/80 px-1 text-[9px] text-neutral-600">© OpenStreetMap</span>
    </div>
  );
}
