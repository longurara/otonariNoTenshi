// Offline reading.
//
// The page shell and data/index.json go network-first, so a new deploy shows
// up straight away, with the cached copy as the fallback when offline.
// Chapter text (data/vol-N.<hash>.json) and pictures never change under a
// given URL, so they come from the cache once fetched: every chapter opened
// and picture seen stays readable offline. app.js uses the same cache names
// for "Tải về đọc offline".

const SHELL_CACHE = "tenshi-shell-v1";
const TEXT_CACHE = "tenshi-text-v1";
const IMAGE_CACHE = "tenshi-img-v1";
const FONT_CACHE = "tenshi-fonts-v1";
const OWN_CACHES = [SHELL_CACHE, TEXT_CACHE, IMAGE_CACHE, FONT_CACHE];

const SHELL = [
  "/",
  "/style.css",
  "/app.js",
  "/data/index.json",
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon-192.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("tenshi-") && !OWN_CACHES.includes(key))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/data/vol-")) {
      event.respondWith(cacheFirst(request, TEXT_CACHE));
    } else if (url.pathname.startsWith("/img/") || url.pathname.startsWith("/icons/")) {
      event.respondWith(cacheFirst(request, IMAGE_CACHE));
    } else if (url.pathname === "/data/index.json") {
      // Once a fresh index arrives, drop text files it no longer names.
      const fetched = networkFirst(request, SHELL_CACHE).then((response) => [response, response.clone()]);
      event.respondWith(fetched.then(([response]) => response));
      event.waitUntil(fetched.then(([, copy]) => pruneText(copy)).catch(() => {}));
    } else if (request.mode === "navigate" && (url.pathname === "/" || url.pathname === "/index.html")) {
      event.respondWith(networkFirst(request, SHELL_CACHE, "/"));
    } else if (SHELL.includes(url.pathname)) {
      event.respondWith(networkFirst(request, SHELL_CACHE));
    }
    return;
  }

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
  }
});

async function networkFirst(request, cacheName, key = request) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(key, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(key, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok || response.type === "opaque") cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

async function pruneText(indexResponse) {
  const volumes = await indexResponse.json();
  const keep = new Set(volumes.map((volume) => new URL(volume.text, self.location.origin).href));
  const cache = await caches.open(TEXT_CACHE);
  const requests = await cache.keys();
  await Promise.all(requests.filter((req) => !keep.has(req.url)).map((req) => cache.delete(req)));
}
