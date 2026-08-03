// Service Worker for Hacklytics 2027 — Digital Bloom
// Implements cache-first for static assets, stale-while-revalidate for pages

const CACHE_VERSION = "hacklytics-v2";

// Shell routes worth having offline. 404 is included so a bad link still
// renders the themed page instead of the browser's offline error.
const PRECACHE_URLS = ["/", "/404.html"];

// Cap the runtime cache so it can't grow without bound across deploys.
const MAX_ENTRIES = 120;

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  // keys() is insertion-ordered, so the oldest entries are at the front
  await Promise.all(
    keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)),
  );
}

// ---------- Install: precache critical resources ----------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      // individual failures must not abort the whole install
      .then((cache) =>
        Promise.all(
          PRECACHE_URLS.map((url) =>
            cache.add(new Request(url, { cache: "reload" })).catch(() => undefined),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

// ---------- Activate: purge stale caches, enable navigation preload ----------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Lets the browser start the network request for a navigation in
      // parallel with the service worker booting, instead of after it.
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }

      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)),
      );

      await self.clients.claim();
    })(),
  );
});

// ---------- Fetch strategies ----------

/**
 * Determine whether a request targets a static asset that changes rarely.
 * Matches _next/static bundles, images, fonts, and stylesheets.
 */
function isStaticAsset(url) {
  if (url.pathname.includes("/_next/static/")) return true;

  const staticExtensions =
    /\.(js|css|woff2?|ttf|otf|eot|png|jpe?g|gif|svg|webp|avif|ico)$/i;
  return staticExtensions.test(url.pathname);
}

/**
 * Determine whether the request is a navigation / HTML page request.
 */
function isNavigationRequest(request, url) {
  return (
    request.mode === "navigate" ||
    request.headers.get("accept")?.includes("text/html")
  );
}

/**
 * Cache-first: serve from cache immediately, fall back to network.
 * Used for fingerprinted / immutable static assets.
 */
async function cacheFirst(request) {
  try {
    const cached = await caches.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

/**
 * Stale-while-revalidate: return cached version instantly while
 * fetching a fresh copy in the background for the next visit.
 */
async function staleWhileRevalidate(request, preloadResponse) {
  const cache = await caches.open(CACHE_VERSION);

  const cached = await cache.match(request);

  // Kick off a background revalidation regardless of cache hit. If the browser
  // already started a navigation preload, reuse that in-flight response
  // instead of issuing a second request.
  const networkPromise = (preloadResponse ? Promise.resolve(preloadResponse) : fetch(request))
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
        trimCache(CACHE_VERSION, MAX_ENTRIES);
      }
      return response;
    })
    .catch(() => undefined);

  // If we have a cached response, return it immediately
  if (cached) return cached;

  // No cache — wait for the network
  const networkResponse = await networkPromise;
  if (networkResponse) return networkResponse;

  // Nothing available
  return new Response("Offline", {
    status: 503,
    statusText: "Service Unavailable",
    headers: { "Content-Type": "text/plain" },
  });
}

/**
 * Network-first: try the network and fall back to cache on failure.
 * Used for API calls and other dynamic requests.
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

// ---------- Main fetch handler ----------
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Skip non-GET requests (form submissions, etc.)
  if (event.request.method !== "GET") return;

  // Never cache the worker itself — that is how a bad SW becomes permanent.
  if (url.pathname === "/sw.js") return;

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(event.request));
  } else if (isNavigationRequest(event.request, url)) {
    event.respondWith(
      event.preloadResponse
        .then((preload) => staleWhileRevalidate(event.request, preload))
        .catch(() => staleWhileRevalidate(event.request)),
    );
  } else {
    event.respondWith(networkFirst(event.request));
  }
});
