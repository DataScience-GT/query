// Service worker kill switch for hacklytics.io.
//
// The site no longer uses a service worker. The previous one served pages
// stale-while-revalidate from a cache that outlived deploys, so visitors from
// before the 2027 redesign kept seeing the old site. This file stays at
// /sw.js so every browser that still has the old worker installed picks this
// one up on its next update check (served no-store, see firebase.json), and
// it then removes itself: every cache is deleted, the worker unregisters, and
// open tabs reload from the network.
//
// Keep this file deployed for at least a season; deleting it would leave
// browsers that have not checked in yet with the old worker.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();

      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        // A navigate, not a reload: the page is fetched fresh now that no
        // worker sits in front of it.
        client.navigate(client.url);
      }
    })(),
  );
});

// No fetch handler: requests go straight to the network.
