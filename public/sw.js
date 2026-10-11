// Forkful service worker: offline app shell and the food database.
const SHELL = 'forkful-shell-v3'
const DATA = 'forkful-data-v1'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png'])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => (k.startsWith('forkful-shell-') && k !== SHELL) || (k.startsWith('forkful-data-') && k !== DATA)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request

  // Share target: a screenshot or text shared into Forkful from another app (Glovo, Wolt, gallery).
  if (req.method === 'POST' && new URL(req.url).pathname === '/share-target') {
    e.respondWith(
      (async () => {
        const form = await req.formData()
        const c = await caches.open('forkful-share')
        const file = form.get('image')
        if (file && typeof file !== 'string') await c.put('/shared-image', new Response(file, { headers: { 'Content-Type': file.type || 'image/jpeg' } }))
        const text = ['title', 'text', 'url'].map((k) => form.get(k)).filter((v) => typeof v === 'string' && v.trim()).join('
')
        if (text) await c.put('/shared-text', new Response(text))
        return Response.redirect(new URL('/#/add?ai=1&shared=1', self.location.origin).href, 303)
      })(),
    )
    return
  }

  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== location.origin) return
  if (url.pathname.startsWith('/api/')) return

  // The food database: serve from cache, refresh in the background.
  if (url.pathname === '/foods.json') {
    e.respondWith(
      caches.open(DATA).then(async (c) => {
        const hit = await c.match(req)
        const fresh = fetch(req)
          .then((res) => {
            if (res.ok) c.put(req, res.clone())
            return res
          })
          .catch(() => hit)
        return hit || fresh
      }),
    )
    return
  }

  // Navigations: network first so updates land, fall back to the cached shell.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          // only keep real app pages as the offline shell (not downloads such as /forkful.apk)
          if (res.ok && (res.headers.get('content-type') || '').includes('text/html')) {
            const copy = res.clone()
            caches.open(SHELL).then((c) => c.put('/index.html', copy))
          }
          return res
        })
        .catch(() => caches.match('/index.html')),
    )
    return
  }

  // Hashed build assets and icons: cache first.
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && (url.pathname.startsWith('/assets/') || /\.(png|svg|webmanifest|wasm)$/.test(url.pathname))) {
            const copy = res.clone()
            caches.open(SHELL).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((list) => {
      const open = list.find((c) => 'focus' in c)
      return open ? open.focus() : self.clients.openWindow('/#/diary')
    }),
  )
})
