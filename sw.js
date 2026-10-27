const CACHE_NAME = "zoz-pro-shell-v21";
const APP_FILES = [
  "./",
  "./index.html",
  "./production-center.html",
  "./production-workbench.html",
  "./production-workbench.js?v=20261027-workbench-2",
  "./production-workbench.html",
  "./production-workbench.js?v=20261027-workbench-1",
  "./analysis-production.html",
  "./channel-control.html",
  "./youtube-analytics.html",
  "./youtube-manager.html",
  "./studio.css?v=20261022-4",
  "./studio.js?v=20261027-login-runtime-fix-4",
  "./visual-production.js?v=20261026-close-loop-1",
  "./pwa.js?v=20261022-4",
  "./production-handoff.js?v=20261026-integrated-shell-1",
  "./production-workbench.js?v=20261027-workbench-2",
  "./manifest.webmanifest",
  "./zoz-icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith("zoz-pro-shell-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // Network first, and cache each route under its own request. Never overwrite
    // index.html with production-center.html or another page.
    event.respondWith(
      fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(async () => {
        return (await caches.match(request, { ignoreSearch: true })) ||
          (await caches.match("./index.html")) ||
          (await caches.match("./"));
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
