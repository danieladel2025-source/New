// Service Worker — كشف غياب الكنيسة
const VERSION = 'v2';
const STATIC_CACHE = 'static-' + VERSION;
const RUNTIME_CACHE = 'runtime-' + VERSION;

const PRECACHE = [
  './',
  './index.html',
  './admin.html',
  './library.html',
  './manifest.json',
  './icons/icon-152.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => ![STATIC_CACHE, RUNTIME_CACHE].includes(k)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // لا تخزّن طلبات قاعدة البيانات (Supabase) أبداً — البيانات لازم تكون حيّة
  if (url.hostname.endsWith('supabase.co')) return;

  // الصفحات: الشبكة أولاً ثم الكاش (عشان التحديثات توصل)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // باقي الملفات (خطوط، مكتبات CDN، أيقونات): الكاش أولاً
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && (res.status === 200 || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});

// ===================== إشعارات أعياد الميلاد =====================
const NOTIF_ICON = './icons/icon-192.png';

self.addEventListener('message', (e) => {
  const d = e.data;
  if (!d) return;
  if (d.type === 'SCHEDULE_BIRTHDAY_NOTIFS') scheduleBirthdayNotifications(d.people);
  if (d.type === 'SEND_NOW') {
    self.registration.showNotification(d.title, {
      body: d.body,
      icon: d.icon || NOTIF_ICON,
      badge: d.badge || NOTIF_ICON,
      tag: d.tag || 'birthday',
      dir: 'rtl', lang: 'ar',
      vibrate: [200, 100, 200],
      requireInteraction: false
    });
  }
});

function scheduleBirthdayNotifications(people) {
  if (!people || !people.length) return;
  const now = Date.now();
  people.forEach((person) => {
    (person.triggers || []).forEach((t) => {
      const delay = t.ts - now;
      if (delay > 0 && delay < 8 * 24 * 60 * 60 * 1000) {
        setTimeout(() => {
          self.registration.showNotification(t.title, {
            body: t.body,
            icon: t.icon || NOTIF_ICON,
            badge: NOTIF_ICON,
            tag: t.tag,
            dir: 'rtl', lang: 'ar',
            vibrate: [200, 100, 200, 100, 200],
            requireInteraction: true,
            data: { url: self.registration.scope }
          });
        }, delay);
      }
    });
  });
}

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cls) => {
      if (cls.length > 0) return cls[0].focus();
      return clients.openWindow(self.registration.scope);
    })
  );
});
