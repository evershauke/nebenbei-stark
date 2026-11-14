importScripts('version.js');
const CACHE = `ns-v${self.APP_VERSION}`;
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'logic.js', 'version.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const nav = e.request.mode === 'navigate';
  // Netz zuerst (no-cache: am HTTP-Cache vorbei nachfragen, damit Updates sofort ankommen), offline aus dem Cache.
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((r) => {
    if (r.ok && new URL(e.request.url).origin === location.origin) {
      const copy = r.clone();
      caches.open(CACHE).then((c) => c.put(nav ? 'index.html' : e.request, copy));
    }
    return r;
  }).catch(() => caches.match(nav ? 'index.html' : e.request, { ignoreSearch: nav })));
});
