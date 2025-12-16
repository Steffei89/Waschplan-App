// sw.js - Version 6.0 (Performance & Push)
importScripts('https://www.gstatic.com/firebasejs/10.13.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.1/firebase-messaging-compat.js');

const CACHE_NAME = 'waschplan-v6';
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
  './img/icon-192.png',
  './img/icon-512.png', // Falls vorhanden
  './img/bg-alps-day.jpg', // Falls vorhanden
  './img/bg-alps-night.jpg' // Falls vorhanden
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

console.log('[sw.js] Service Worker v6.0 (Cache & Push) geladen.');

// INSTALL: App Shell cachen (Dateien für den Offline-Start)
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[sw.js] Pre-caching Assets');
            // Wir nutzen catch, damit ein fehlendes Bild nicht den ganzen Service Worker killt
            return cache.addAll(ASSETS_TO_CACHE).catch(err => console.warn("Einige Assets konnten nicht gecacht werden (evtl. Bilder fehlen):", err));
        })
    );
    self.skipWaiting();
});

// ACTIVATE: Alte Caches aufräumen
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
    self.clients.claim();
});

// FETCH: Strategie "Cache First, falling back to Network"
self.addEventListener('fetch', (event) => {
    // Nur GET Requests cachen
    if (event.request.method !== 'GET') return;
    
    // Keine Firestore/API/Google Requests cachen (Daten müssen aktuell sein)
    const url = new URL(event.request.url);
    if (url.origin.includes('googleapis.com') || url.origin.includes('firestore')) return;

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).then((networkResponse) => {
                // Nur gültige Antworten cachen
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                    return networkResponse;
                }
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });
                return networkResponse;
            });
        })
    );
});

// PUSH: Hintergrund-Nachrichten
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