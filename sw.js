/* PRISMBURST service worker — offline support.
 * Strategy: stale-while-revalidate. Cached files are served instantly (works
 * offline); when online, a fresh copy is fetched in the background so an update
 * pushed to GitHub appears on the next launch. Paths are relative to this file,
 * so it works under a GitHub Pages sub-path (https://<user>.github.io/<repo>/).
 * Bump VERSION to force-drop old caches. */
var VERSION = 'prismburst-v1.0.0';
var ASSETS = [
  './', './index.html', './style.css', './levels.js', './game.js', './js/core.js', './js/menus.js',
  './lib/phaser.min.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'
];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(VERSION).then(function (cache) {
    return cache.match(req, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
        return res;
      }).catch(function () { return null; });
      if (hit) { e.waitUntil(net); return hit; }
      return net.then(function (res) {
        if (res) return res;
        if (req.mode === 'navigate') return cache.match('./index.html');
        return Response.error();
      });
    });
  }));
});
