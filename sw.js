// sw.js
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

// Empfängt Nachrichten im Hintergrund
messaging.onBackgroundMessage((payload) => {
  console.log('[sw.js] Background message: ', payload);
  const title = payload.notification.title;
  const options = {
    body: payload.notification.body,
    icon: '/img/icon-192.png',
    badge: '/img/icon-maskable-192.png'
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('install', (event) => {
    event.waitUntil(self.skipWaiting()); 
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
            // Wenn ein Tab offen ist, fokussiere ihn, sonst öffne neuen
            return list.length > 0 ? list[0].focus() : clients.openWindow('/');
        })
    );
});