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

// Fetch: usar cache-first strategy para assets, network-only para APIs
self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // Solo cachear GET requests con esquema http/https
  if (request.method !== 'GET' || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    event.respondWith(fetch(request).catch(() => new Response('Offline', { status: 503 })))
    return
  }

  // Network only para APIs externas (Firebase, Google)
  if (request.url.includes('firebaseio.com') || request.url.includes('googleapis.com')) {
    event.respondWith(
      fetch(request).catch(() => new Response('Offline - No hay conexión disponible', { status: 503 }))
    )
    return
  }

  // Cache first para assets estáticos (JS, CSS, imágenes)
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
})
