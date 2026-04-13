import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const isLocalhost =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname === '::1'

const setupServiceWorker = () => {
  if (!('serviceWorker' in navigator)) {
    return
  }

  window.addEventListener('load', async () => {
    if (import.meta.env.PROD && !isLocalhost) {
      try {
        const registration = await navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
        console.log('Service Worker registrado exitosamente:', registration)
      } catch (error) {
        console.log('Error al registrar Service Worker:', error)
      }

      return
    }

    // In development we remove old SW/cache entries to prevent stale Vite client/HMR websocket issues.
    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))

      if ('caches' in window) {
        const cacheKeys = await caches.keys()
        const miromoneyCaches = cacheKeys.filter((key) => key.startsWith('miromoney-'))
        await Promise.all(miromoneyCaches.map((key) => caches.delete(key)))
      }
    } catch (error) {
      console.log('No se pudo limpiar Service Worker/cache en local:', error)
    }
  })
}

setupServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
