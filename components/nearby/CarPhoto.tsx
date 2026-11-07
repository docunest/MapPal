"use client";

import { useEffect, useRef, useState } from "react";

// A car place's photo (Wikipedia, else Google) with its credit. Fetched only
// once the card is on screen; the browser keeps it 30 days (the server says
// so), so scrolling back and forth never downloads it again.
export function CarPhoto({ id }: { id: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [photo, setPhoto] = useState<{ url: string; credit: string } | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setVisible(true), { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let url: string | null = null;
    let live = true;
    fetch(`/api/dock/items/${id}/photo`)
      .then(async (r) => {
        if (!r.ok || !live) return;
        url = URL.createObjectURL(await r.blob());
        setPhoto({ url, credit: decodeURIComponent(r.headers.get("X-Photo-Credit") ?? "") });
      })
      .catch(() => undefined);
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, visible]);

  return (
    <div ref={box}>
      {photo && (
        <figure className="-mx-3 -mt-3 mb-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- a blob URL from our own API */}
          <img src={photo.url} alt="" className="h-36 w-full rounded-t-lg object-cover" />
          {photo.credit && <figcaption className="px-3 pt-1 text-[10px] text-neutral-400">📷 {photo.credit}</figcaption>}
        </figure>
      )}
    </div>
  );
}
