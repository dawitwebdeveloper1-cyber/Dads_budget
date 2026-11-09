// Lets the app open with no internet. The phone keeps a copy of every file
// listed below. When you change the app, raise VERSION by one so phones pick
// up the new copy the next time they open it with internet.

const VERSION = 7;
const CACHE = `dads-budget-v${VERSION}`;

const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/main.js',
  './js/tabs.js',
  './js/data/backup.js',
  './js/data/export.js',
  './js/data/logbook.js',
  './js/data/model.js',
  './js/data/store.js',
  './js/insights/advice.js',
  './js/insights/explain.js',
  './js/insights/favourites.js',
  './js/insights/goals.js',
  './js/insights/limits.js',
  './js/insights/recap.js',
  './js/maths/budget.js',
  './js/maths/checks.js',
  './js/maths/dates.js',
  './js/maths/mileage.js',
  './js/maths/money.js',
  './js/maths/periods.js',
  './js/maths/schedule.js',
  './js/screens/breakdown.js',
  './js/screens/history.js',
  './js/screens/home.js',
  './js/screens/mileage.js',
  './js/screens/more.js',
  './js/screens/shared.js',
  './js/screens/tools.js',
  './js/ui/backup-actions.js',
  './js/ui/components.js',
  './js/ui/dom.js',
  './js/ui/entry-form.js',
  './js/ui/files.js',
  './js/ui/format.js',
  './js/ui/lock.js',
  './js/ui/notes.js',
  './js/ui/report.js',
  './js/ui/trip-form.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Use the saved copy first (fast, and works offline); fall back to the internet.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request)),
  );
});
