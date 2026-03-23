const CACHE_NAME = 'choir-attendance-v2';

const BASE = '/choir-attendance-tracker';

const urlsToCache = [
  `${BASE}/`,
  `${BASE}/index.html`,
  `${BASE}/edit_member.html`,
  `${BASE}/summary.html`,
  `${BASE}/manifest.json`,
  `${BASE}/service-worker.js`
];

// INSTALL
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

// ACTIVATE
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(k => k !== CACHE_NAME ? caches.delete(k) : null)
      )
    )
  );
  self.clients.claim();
});

// FETCH
self.addEventListener('fetch', event => {

  if (event.request.method !== 'GET') return;

  // Google Sheets → network first
  if (event.request.url.includes('script.google.com')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ success: false }), {
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // Cache first
  event.respondWith(
    caches.match(event.request).then(res =>
      res || fetch(event.request).then(fetchRes => {
        if (!fetchRes || fetchRes.status !== 200) return fetchRes;

        const clone = fetchRes.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));

        return fetchRes;
      }).catch(() => caches.match(`${BASE}/index.html`))
    )
  );
});

// BACKGROUND SYNC
self.addEventListener('sync', event => {
  if (event.tag === 'sync-attendance') {
    event.waitUntil(syncData());
  }
});

async function syncData() {
  const pending = JSON.parse(localStorage.getItem('pendingSyncData') || '[]');

  for (let i = 0; i < pending.length; i++) {
    try {
      await fetch('https://script.google.com/macros/s/AKfycbzbOWDOUr4Vk5bvyL3VG_BCPr2slVOrLeivM1JlwY_tuUzBzD6JG_q4cODycuLrZ1MQ/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pending[i].records)
      });

      pending.splice(i, 1);
      i--;

    } catch (err) {
      break;
    }
  }

  localStorage.setItem('pendingSyncData', JSON.stringify(pending));
}
