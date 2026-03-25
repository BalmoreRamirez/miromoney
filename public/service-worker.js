const CACHE_NAME = 'miromoney-v1'
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json'
]

// Instalar el service worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(URLS_TO_CACHE))
      .then(() => self.skipWaiting())
  )
})

// Activar el service worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(cacheName => cacheName !== CACHE_NAME)
          .map(cacheName => caches.delete(cacheName))
      )
    }).then(() => self.clients.claim())
  )
})

// Fetch: usar cache-first strategy para assets, network-first para datos
self.addEventListener('fetch', event => {
  const { request } = event
  
  // Network first para APIs (Firebase)
  if (request.url.includes('firebaseio.com') || request.url.includes('googleapis.com')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (!response || response.status !== 200) {
            return response
          }
          const responseClone = response.clone()
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseClone)
          })
          return response
        })
        .catch(() => caches.match(request))
    )
    return
  }

  // Cache first para assets estáticos (JS, CSS, imágenes)
  if (request.method === 'GET') {
    event.respondWith(
      caches.match(request)
        .then(response => response || fetch(request))
        .then(response => {
          if (!response || response.status !== 200 || response.type === 'error') {
            return response
          }
          const responseClone = response.clone()
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseClone)
          })
          return response
        })
        .catch(() => new Response('Offline - Sin conexión disponible', { status: 503 }))
    )
    return
  }

  // Para POST, PUT, DELETE: network only
  event.respondWith(fetch(request))
})
