// sw.js - Version 3.6.5 (Force Update)
importScripts('https://www.gstatic.com/firebasejs/10.13.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.1/firebase-messaging-compat.js');

// WICHTIG: Ich habe den Namen hier geändert. Das zwingt den Browser zum Update!
const CACHE_NAME = 'waschplan-v3.6.5-force-update';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './js/main.js',
  './js/firebase.js',
  './js/dom.js',
  './js/state.js',
  './js/utils.js',
  './js/ui.js',
  './js/config.js',
  './js/views/admin.js',
  './js/views/calendar.js',
  './js/views/overview.js',
  './js/views/profile.js',
  './js/services/auth.js',
  './js/services/booking.js',
  './js/services/karma.js',
  './js/services/stats.js',
  './js/services/timers.js',
  // Maintenance Service hinzufügen, damit er auch gecacht wird
  './js/services/maintenance.js', 
  './img/icon-192.png',
  './img/icon-512.png'
];

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

console.log('[sw.js] Service Worker v3.6.5 wird installiert...');

// INSTALL: App Shell cachen
self.addEventListener('install', (event) => {
    // Zwingt den neuen SW sofort in die "Waiting" Phase zu überspringen
    self.skipWaiting(); 
    
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[sw.js] Caching Assets für v3.6.5');
            return cache.addAll(ASSETS_TO_CACHE).catch(err => console.warn("Caching Fehler:", err));
        })
    );
});

// ACTIVATE: Alte Caches (alles was nicht v3.6.5 heißt) sofort löschen
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('[sw.js] Lösche alten Cache:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    // Sofort die Kontrolle über die Seite übernehmen
    self.clients.claim();
});

// FETCH: Network First Strategie
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    
    // Google/Firebase APIs ignorieren
    if (url.origin.includes('googleapis.com') || url.origin.includes('firestore')) return;

    const isCode = event.request.destination === 'document' || // HTML
                   event.request.destination === 'script' ||   // JS
                   event.request.destination === 'style' ||    // CSS
                   event.request.url.includes('manifest.json');

    if (isCode) {
        event.respondWith(
            fetch(event.request)
                .then((networkResponse) => {
                    // Wenn Netzwerk da ist: Nimm das Neue und speichere es im Cache
                    if (networkResponse && networkResponse.status === 200) {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => {
                    // Wenn offline: Nimm Cache
                    return caches.match(event.request);
                })
        );
    } else {
        // Bilder: Cache First
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                return cachedResponse || fetch(event.request);
            })
        );
    }
});

// PUSH
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const urlToOpen = 'https://waschplanapp.web.app';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes(urlToOpen) && 'focus' in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow(urlToOpen);
        })
    );
});