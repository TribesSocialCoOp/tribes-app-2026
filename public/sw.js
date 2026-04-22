/**
 * Tribes.app Service Worker — Push Notification Handler
 *
 * In DEV mode: Not actively registered — notifications use browser
 * Notification API directly via the use-push-notifications hook.
 *
 * In PROD mode: Registered via navigator.serviceWorker.register(),
 * handles real push events from the server.
 */

// Push event — show notification when server sends a push
self.addEventListener('push', function (event) {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const options = {
      body: data.body || 'You have a new notification',
      icon: '/icon-192x192.png',
      badge: '/icon-72x72.png',
      tag: data.tag || 'tribes-notification',
      data: {
        url: data.url || '/',
      },
      actions: data.actions || [],
      vibrate: [200, 100, 200],
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'Tribes.app', options)
    );
  } catch (err) {
    console.error('[sw] Push parse error:', err);
  }
});

// Notification click — focus app and navigate
self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    // Try to find an existing window/tab
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      // If we have a matching client, focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});

// Service Worker install — take control immediately
self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});
