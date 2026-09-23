// Minimal service worker -- exists only to satisfy the browser's PWA
// installability check (Chrome/Android requires one to show the "Install
// app" prompt). Deliberately does no caching: this app is a live
// conversation against a real API, so serving stale JS/data offline would
// cause more harm than an install prompt is worth.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
