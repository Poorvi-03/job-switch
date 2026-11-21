const cacheName = "job-switch-shell-v2";
const files = ["./", "./index.html", "./app.js", "./batch.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", event => event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(files))));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys =>
  Promise.all(keys.filter(key => key.startsWith("job-switch-shell-") && key !== cacheName).map(key => caches.delete(key))))));
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.open(cacheName).then(async cache => {
    try { return await fetch(event.request); }
    catch {
      return await cache.match(event.request) ||
        (event.request.mode === "navigate" ? await cache.match("./index.html") : Response.error());
    }
  }));
});
