self.addEventListener('install', (e) => {
  console.log('Activated K.vision PWA Installed');
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
