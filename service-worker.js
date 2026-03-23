const CACHE_NAME = 'choir-attendance-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/edit_member.html',
  '/summary.html',
  '/manifest.json',
  '/service-worker.js'
];

// Install Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Cache opened');
      return cache.addAll(urlsToCache);
    }).catch(err => {
      console.log('Cache failed:', err);
    })
  );
  self.skipWaiting(); // Activate immediately
});

// Activate Service Worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event - Network first, fallback to cache
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // For Google Sheets API calls, try network first
  if (event.request.url.includes('script.google.com')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Offline - return a simple response
        return new Response(JSON.stringify({success: false, message: 'Offline - data will sync when online'}), {
          headers: {'Content-Type': 'application/json'}
        });
      })
    );
    return;
  }

  // For all other requests, try cache first, then network
  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) {
        return response;
      }
      return fetch(event.request).then(response => {
        // Don't cache non-successful responses
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }
        // Clone the response
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });
        return response;
      }).catch(() => {
        // Return a fallback page if offline
        return caches.match('/index.html');
      });
    })
  );
});

// Background Sync for Google Sheets (when back online)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-attendance') {
    event.waitUntil(syncAttendance());
  }
});

async function syncAttendance() {
  try {
    const pendingData = JSON.parse(localStorage.getItem('pendingSyncData') || '[]');
    if (pendingData.length === 0) return;

    for (const data of pendingData) {
      const res = await fetch('https://script.google.com/macros/s/AKfycbzbOWDOUr4Vk5bvyL3VG_BCPr2slVOrLeivM1JlwY_tuUzBzD6JG_q4cODycuLrZ1MQ/exec', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
      });
      if (res.ok) {
        pendingData.shift();
      }
    }
    localStorage.setItem('pendingSyncData', JSON.stringify(pendingData));
  } catch (err) {
    console.log('Sync error:', err);
  }
}
