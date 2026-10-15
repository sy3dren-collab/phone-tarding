'use strict';
// Bump this version when changing the offline shell or bundled market data.
const CACHE_PREFIX = 'mobile-k-replay-offline-';
const CACHE_NAME = CACHE_PREFIX + 'v2';
const SHELL = ['./', './index.html', './style.css?v=20', './app.js?v=20',
  './csv.js', './storage.js?v=7', './pwa.js?v=2', './manifest.webmanifest',
  './icon-180.png', './icon-192.png', './icon-512.png', './data/index.json'];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const response = await fetch('./data/index.json', {cache: 'reload'});
    if (!response.ok) throw new Error('Market index unavailable');
    const index = await response.json();
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll([...SHELL, ...index.months.map(month => './data/' + month + '.json')]);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin ||
      !url.href.startsWith(self.registration.scope)) return;
  // Only serve bundled files; never cache arbitrary requests or private imports.
  const relative = url.href.slice(self.registration.scope.length);
  const isShell = SHELL.some(path => path.slice(2) === relative);
  const isMonth = /^data\/\d{4}-\d{2}\.json$/.test(relative);
  if (!isShell && !isMonth) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(event.request, {cache: 'no-cache'});
      if (response.ok) {
        await cache.put(event.request, response.clone());
        return response;
      }
      return (await cache.match(event.request)) || response;
    } catch (error) {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      throw error;
    }
  })());
});
