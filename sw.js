// Offline support: cache the game, Three.js and all art; serve from cache, refresh in the background.
// Bump CACHE when files are added or renamed so old phones drop the stale copy.
const CACHE = 'speedster-v20';
const FILES = ['./', 'index.html', 'game.js', 'manifest.webmanifest', 'privacy.html', 'lib/three.module.min.js',
  'assets/sign_speed.png', 'assets/sign_warning.png', 'assets/sign_gantry.png', 'assets/billboard_a.png', 'assets/billboard_b.png',
  'assets/road.png', 'assets/skyline.png',
  'assets/road_desert.png', 'assets/skyline_desert.png', 'assets/road_coast.png', 'assets/skyline_coast.png',
  'assets/road_snow.png', 'assets/skyline_snow.png', 'assets/road_mars.png', 'assets/skyline_mars.png',
  'assets/car_sedan.glb', 'assets/car_sport.glb', 'assets/car_wedge.glb', 'assets/car_f1.glb', 'assets/logo.png', 'assets/icon-192.png', 'assets/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
