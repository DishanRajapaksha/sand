const CACHE = 'sand-v6';
const APP_FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "privacy.html",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "src/app.js",
  "src/audio.js",
  "src/gl.js",
  "src/glsl-common.js",
  "src/input.js",
  "src/main.js",
  "src/presets.js",
  "src/render-shaders.js",
  "src/render.js",
  "src/sand-worklet.js",
  "src/screens.js",
  "src/sim-shaders.js",
  "src/sim.js",
  "src/view.js"
];

// Publish a complete app version together. A failed download leaves the
// currently active version intact, rather than mixing incompatible modules.
self.addEventListener('install', (e) => e.waitUntil(
  caches.open(CACHE)
    .then((cache) => cache.addAll(APP_FILES.map((url) => new Request(url, { cache: 'reload' }))))
    .then(() => self.skipWaiting())
));
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('sand-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim())
));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(e.request, { ignoreSearch: true });
    return cached || fetch(e.request);
  }));
});
