// Service worker di Leggilo: app offline, cache di copertine e dati, ricezione dei libri da "Condividi"
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { salvaCondivisi } from './condivisi-db.js'

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// Pagina dell'app per ogni navigazione (tranne le API)
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/\/api\//] }))

// Copertine: prima la cache (anche dal server Kavita su un altro indirizzo)
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/Image/'),
  new CacheFirst({
    cacheName: 'leggilo-copertine',
    plugins: [new CacheableResponsePlugin({ statuses: [0, 200] }), new ExpirationPlugin({ maxEntries: 800, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  }),
)

// Motore delle voci di Leggilo (WebAssembly e dati espeak): scaricato al primo uso, poi dalla cache
registerRoute(
  ({ url }) => url.pathname.includes('/vendor/'),
  new CacheFirst({ cacheName: 'leggilo-motore-voci', plugins: [new CacheableResponsePlugin({ statuses: [200] })] }),
)

// Altri dati di Kavita in lettura: prima la rete, poi la cache
registerRoute(
  ({ url, request }) => url.pathname.startsWith('/api/') && request.method === 'GET'
    && !url.pathname.startsWith('/api/Download/') && !url.pathname.startsWith('/api/Reader/pdf'),
  new NetworkFirst({
    cacheName: 'leggilo-dati',
    networkTimeoutSeconds: 6,
    plugins: [new CacheableResponsePlugin({ statuses: [200] }), new ExpirationPlugin({ maxEntries: 300 })],
  }),
)

// "Condividi → Leggilo": Android invia i file con un POST a ./condividi
registerRoute(
  ({ url, request }) => request.method === 'POST' && url.pathname.endsWith('/condividi'),
  async ({ request }) => {
    const base = new URL('./', self.registration.scope)
    try {
      const dati = await request.formData()
      const files = dati.getAll('libri').filter(f => f && typeof f === 'object' && f.size > 0)
      if (files.length) await salvaCondivisi(files)
      return Response.redirect(new URL('./#/condivisi', base).href, 303)
    } catch {
      return Response.redirect(new URL('./#/condivisi?errore=1', base).href, 303)
    }
  },
  'POST',
)

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

// Cache della prima versione (prima del service worker personalizzato)
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n.startsWith('leggilo-v1')).map(n => caches.delete(n)))))
})
