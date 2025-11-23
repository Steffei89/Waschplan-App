// sw.js - Version 3.0 (Data-Only Support)
importScripts('https://www.gstatic.com/firebasejs/10.13.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.1/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyCvKdQa7No5TMehgIBS9Nh34kg8EqFJap0",
    authDomain: "waschplanapp.firebaseapp.com",
    projectId: "waschplanapp",
    storageBucket: "waschplanapp.firerostorage.app",
    messagingSenderId: "326700527135",
    appId: "1:326700527135:web:4b0c1d5e287d6ae1932f2a"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

console.log('[sw.js] Service Worker v3.0 geladen.');

messaging.onBackgroundMessage((payload) => {
  console.log('[sw.js] Data message received:', payload);
  
  // Daten aus payload.data holen (weil wir keine 'notification' mehr senden)
  const data = payload.data || {};
  const title = data.title || 'Waschplan';
  const body = data.body || 'Wäsche ist fertig!';
  const url = data.url || '/';

  const notificationOptions = {
    body: body,
    icon: '/img/icon-192.png',
    badge: '/img/icon-maskable-192.png',
    tag: 'washing-timer', // Verhindert Stapeln
    data: { url: url }    // URL für Klick-Event durchreichen
  };

  return self.registration.showNotification(title, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const urlToOpen = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes(urlToOpen) && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});