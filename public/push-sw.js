// Service Worker additionnel pour la réception des notifications Web Push
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' }
  }

  const title = data.title || '⚠️ Maintien de charge';
  const options = {
    body: data.body || 'Un appareil nécessite une mise en charge de sa batterie.',
    icon: './pwa-192x192.png',
    badge: './pwa-192x192.png',
    vibrate: [200, 100, 200],
    data: data.url || './',
    tag: data.data?.serialNumber ? `charge-${data.data.serialNumber}` : 'charge-reminder',
    renotify: true
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data || './');
      }
    })
  );
});
