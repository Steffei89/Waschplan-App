// sw.js - Version 5.0 (Pure System Push)
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

console.log('[sw.js] Service Worker v5.0 geladen.');

// WICHTIG: Kein onBackgroundMessage Handler mehr!
// iOS übernimmt die Anzeige basierend auf dem 'notification' Payload vom Server.

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const urlToOpen = 'https://waschplanapp.web.app';

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