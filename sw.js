// Offline support. Caches the app itself (never your writing, which lives in
// your own file) so Writers Blocks opens and works with no connection.
//
// App files: network first, so you always get the latest version when online,
// falling back to the cache when offline or when the network is too slow.
// Fonts: cache first, since they never change once published.
// Anything else (the optional AI assistant) goes straight to the network.

const VERSION = 'wb-v11';
const APP = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icon.svg',
  'css/styles.css',
  'css/themes.css',
  'js/app.js',
  'js/core/dom.js',
  'js/core/state.js',
  'js/core/undo.js',
  'js/lib/ai.js',
  'js/lib/celebrate.js',
  'js/lib/echoes.js',
  'js/lib/export.js',
  'js/lib/format.js',
  'js/lib/help.js',
  'js/lib/import.js',
  'js/lib/model.js',
  'js/lib/prompts.js',
  'js/lib/sound.js',
  'js/lib/storage.js',
  'js/project/backups.js',
  'js/project/commands.js',
  'js/project/files.js',
  'js/project/flow.js',
  'js/project/progress.js',
  'js/project/sync.js',
  'js/ui/binder.js',
  'js/ui/brainstorm.js',
  'js/ui/drag-drop.js',
  'js/ui/export-dialog.js',
  'js/ui/formatting.js',
  'js/ui/help-tour.js',
  'js/ui/import-dialog.js',
  'js/ui/inspector.js',
  'js/ui/menus.js',
  'js/ui/settings.js',
  'js/ui/shell.js',
  'js/ui/theme.js',
  'js/ui/tools.js',
  'js/ui/topbar.js',
  'js/ui/writing-aids.js',
  'js/views/board.js',
  'js/views/desk.js',
  'js/views/map.js',
  'js/views/notebook.js',
  'js/views/outline.js',
  'js/views/read.js',
  'js/views/share.js',
  'js/views/trash.js',
  'js/views/welcome.js',
  'js/views/write.js',
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
