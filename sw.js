/* PRISMBURST service worker — offline support.
 * Strategy: stale-while-revalidate. Cached files are served instantly (works
 * offline); when online, a fresh copy is fetched in the background so an update
 * pushed to GitHub appears on the next launch. Paths are relative to this file,
 * so it works under a GitHub Pages sub-path (https://<user>.github.io/<repo>/).
 * Bump VERSION to force-drop old caches. */
var VERSION = 'prismburst-v1.4.2-bridge2';
var ASSETS = [
  './', './index.html', './style.css', './levels.js', './game.js', './config.js', './privacy.html', './privacy-policy.html', './delete-account.html',
  './js/save-plain.js', './js/build-flags.js', './js/core.js', './js/home.js', './js/achievements.js', './js/shop.js', './js/ads.js', './js/home-ui.js', './js/menus.js', './js/save-sync.js', './js/profile.js', './js/delete-core.js', './js/delete-page.js', './js/cloud.js', './js/account.js',
  './lib/phaser.min.js', './lib/supabase.min.js', './manifest.webmanifest',
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
function isSupabaseHost(hostname) {
  return /(^|\.)supabase\.co$/i.test(hostname) || /(^|\.)supabase\.in$/i.test(hostname);
}
function isAuthReturn(url) {
  var q = url.search || '';
  var h = url.hash || '';
  return /(?:^|[?&])code=/.test(q) || /access_token=/.test(q) || /access_token=/.test(h) || /(?:^|[?&])error=/.test(q);
}
function isAuthBridge(url) {
  try {
    var path = String(url.pathname || '');
    return /auth-bridge\.html$/i.test(path);
  } catch (e) { return false; }
}
self.addEventListener('fetch', function (e) {
  var req = e.request;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  // Supabase auth and REST stay network-only. Never write them into the Cache API.
  if (isSupabaseHost(url.hostname)) {
    e.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }
  // Android Google auth-bridge must always hit the network (never Cache API / ignoreSearch).
  if (isAuthBridge(url)) {
    e.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }
  // OAuth returns (?code=, ?error=, access_token) must not be served from a cached shell.
  if (req.mode === 'navigate' && isAuthReturn(url)) {
    e.respondWith(fetch(req, { cache: 'no-store' }).catch(function () {
      return caches.match('./index.html');
    }));
    return;
  }
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(caches.open(VERSION).then(function (cache) {
    return cache.match(req, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic' && !isAuthBridge(url)) cache.put(req, res.clone());
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
