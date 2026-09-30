// Offline support. Caches the app itself (never your writing, which lives in
// your own file) so Writers Blocks opens and works with no connection.
//
// App files: network first, so you always get the latest version when online,
// falling back to the cache when offline or when the network is too slow.
// Fonts: cache first, since they never change once published.
// Anything else (the optional AI assistant) goes straight to the network.

const VERSION = 'wb-v5';
const APP = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icon.svg',
  'css/styles.css',
  'css/themes.css',
  'js/app.js',
  'js/model.js',
  'js/storage.js',
  'js/ai.js',
  'js/prompts.js',
  'js/sound.js',
  'js/celebrate.js',
  'js/help.js',
  'js/export.js',
  'examples/sample.wblocks.json',
];
const FONTS = 'wb-fonts'; // kept across app versions; fonts never change
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const NETWORK_TIMEOUT = 3000;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION)
    .then((c) => c.addAll(APP.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION && key !== FONTS) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) e.respondWith(networkFirst(req));
  else if (FONT_HOSTS.includes(url.hostname)) e.respondWith(cacheFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  // no-cache: revalidate with the server rather than trusting the browser's HTTP cache,
  // so a new version arrives on the next load (unchanged files cost only a 304).
  const fromNetwork = fetch(req, { cache: 'no-cache' }).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT));
  try {
    const res = await Promise.race([fromNetwork, timeout]);
    if (res) return res;
  } catch { /* offline: fall through to the cache */ }
  const cached = await cache.match(req, { ignoreSearch: true })
    || (req.mode === 'navigate' && await cache.match('index.html'));
  return cached || fromNetwork; // nothing cached: let the network answer (or fail) as it would have
}

async function cacheFirst(req) {
  const cache = await caches.open(FONTS);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}
