// sw.js - Service Worker basique
const CACHE_NAME = 'inventaire-cache-v1';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './app.js'
];

// Installation du service worker et mise en cache des fichiers
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// Intercepte les requêtes réseau
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Retourne la version en cache si elle existe, sinon fait la requête réseau
        return response || fetch(event.request);
      })
  );
});