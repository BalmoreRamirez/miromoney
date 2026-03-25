const CACHE_NAME = 'miromoney-v2'
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

  // Sólo manejamos peticiones GET http/https y del mismo origen
  if (
    request.method !== 'GET' ||
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.origin !== self.location.origin
  ) {
    return
  }

  // Dejar pasar todo lo que sea Firebase/Google sin tocar (evita loops en channel requests)
  if (
    request.url.includes('firebaseio.com') ||
    request.url.includes('googleapis.com') ||
    request.url.includes('gstatic.com')
  ) {
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
