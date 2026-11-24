// Offline support for the installed web app.
//
// App files and data/curriculum.json are network-first, so updates (including the monthly
// data refresh) arrive whenever the server is reachable, with the cached copy used offline.
// Fonts are cache-first and cached as pages use them (they're split by character range).
// Bump VERSION after adding or renaming app files.

const VERSION = '20';
const APP_CACHE = `kumitate-app-${VERSION}`;
const FONT_CACHE = 'kumitate-fonts';
const SHELL = [
  './',
  'index.html',
  'css/app.css',
  'css/fonts.css',
  'manifest.webmanifest',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'js/main.js',
  'js/data.js',
  'js/state.js',
  'js/store.js',
  'js/srs.js',
  'js/answer.js',
  'js/usage.js',
  'js/quiz.js',
  'js/speech.js',
  'js/wanikani.js',
  'js/share.js',
  'js/ui.js',
  'js/views/info.js',
  'js/views/today.js',
  'js/views/lessons.js',
  'js/views/reviews.js',
  'js/views/practice.js',
  'js/views/peek.js',
  'js/views/browse.js',
  'js/views/itempage.js',
  'js/views/settings.js',
  'js/views/welcome.js',
  'vendor/ts-fsrs.js',
  'vendor/wanakana.js',
  'data/curriculum.json',
  'data/mnemonics.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== APP_CACHE && k !== FONT_CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function cacheFirst(req) {
  const cache = await caches.open(FONT_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(APP_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const shell = await cache.match('index.html');
      if (shell) return shell;
    }
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(url.pathname.includes('/fonts/') ? cacheFirst(req) : networkFirst(req));
});
