// Офлайн-режим: сначала сеть (чтобы обновления приходили сразу), без сети — из кэша
const CACHE = 'ilya-planner-v4';
const SHELL = [
  './', 'index.html', 'css/styles.css', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/app.js', 'js/utils.js', 'js/const.js', 'js/store.js', 'js/ui.js', 'js/agenda.js', 'js/components.js', 'js/forms.js', 'js/demo.js', 'js/theme.js', 'js/nutrition.js', 'js/scanner.js', 'js/bodyfat-ai.js',
  'js/views/today.js', 'js/views/work.js', 'js/views/project.js', 'js/views/tasks.js', 'js/views/money.js', 'js/views/more.js',
  'js/views/calendar.js', 'js/views/notes.js', 'js/views/year.js', 'js/views/settings.js', 'js/views/health.js',
  'js/vendor/barcode/ponyfill.js', 'js/vendor/barcode/zxing-exported.js', 'js/vendor/barcode/zxing_reader.wasm',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isFont = url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com';
  if (isFont) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html')))
  );
});
