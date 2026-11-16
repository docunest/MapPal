// MapPal service worker — lets the Home Screen app open with no signal (owner 2026-11-16).
// Pages: network first (fresh when online), the last good copy when not. Built JS/CSS (hashed
// names): cache first. API calls are never cached here — offline places live in IndexedDB.
const CACHE = "mappal-shell-v1";
const SHELL = ["/", "/offline"];
const NAV_TIMEOUT_MS = 6000;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.all(SHELL.map((u) => fetch(u, { credentials: "same-origin" }).then((r) => (r.ok && !r.redirected ? c.put(u, r) : null)).catch(() => null)))),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || /^\/(icon-\d+\.png|apple-touch-icon\.png|manifest\.webmanifest|favicon\.ico)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((r) => {
            if (r.ok) {
              const copy = r.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return r;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    const key = url.pathname; // ?lat=&lng= etc. don't make a different page
    e.respondWith(
      Promise.race([fetch(req), timeout(NAV_TIMEOUT_MS)])
        .then((r) => {
          // Don't keep the login redirect as "the page".
          if (r.ok && !r.redirected) {
            const copy = r.clone();
            caches.open(CACHE).then((c) => c.put(key, copy));
          }
          return r;
        })
        .catch(async () => (await caches.match(key)) || (await caches.match("/offline")) || (await caches.match("/")) || Response.error()),
    );
  }
});
