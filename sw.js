const CACHE = 'miniracer-v1';
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/src/main.js',
  '/src/config/cars/porsche_gt3.js',
  '/src/track/monza.json',
  '/src/track/trackBuilder.js',
  '/src/physics/aero.js',
  '/src/physics/drivetrain.js',
  '/src/physics/car.js',
  '/src/input/gyro.js',
  '/src/input/keyboard.js',
  '/src/rendering/renderer.js',
  '/src/hud/hud.js',
  '/screens/lobby.js',
  '/screens/race.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Network-first for CDN (three.js), cache-first for local files
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(cached =>
        cached || fetch(e.request).then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
      )
    );
  }
});
