// Service worker : mode hors ligne de base.
// Principe : tout le "squelette" de l'appli est mis en cache a l'installation, puis servi depuis le
// cache. Les appels a Supabase passent toujours par le reseau (jamais mis en cache ici).
importScripts('./js/version.js');

// Le nom du cache contient la version : changer la version = nouveau cache, ancien supprime.
const CACHE = 'plantes-' + self.APP_VERSION;

const SQUELETTE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/version.js',
  './js/config.js',
  './js/client.js',
  './js/outils.js',
  './js/dialogues.js',
  './js/donnees.js',
  './js/photos.js',
  './js/rappels.js',
  './js/vues-plantes.js',
  './js/vue-aujourdhui.js',
  './js/vues-souhaits.js',
  './js/recadrage.js',
  './js/vues-reglages.js',
  './js/app.js',
  './vendor/supabase.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (evenement) => {
  evenement.waitUntil(
    caches.open(CACHE)
      // cache: 'reload' = on va chercher les fichiers frais, pas ceux du cache HTTP du navigateur
      .then((cache) => cache.addAll(SQUELETTE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evenement) => {
  evenement.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(
        noms.filter((nom) => nom.startsWith('plantes-') && nom !== CACHE).map((nom) => caches.delete(nom))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evenement) => {
  const requete = evenement.request;
  if (requete.method !== 'GET') return;

  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return; // Supabase et le reste : reseau direct

  evenement.respondWith(
    caches.match(requete, { ignoreSearch: true }).then((enCache) => {
      if (enCache) return enCache;
      return fetch(requete).catch(() => {
        // Hors ligne et fichier inconnu : pour une page, on renvoie l'accueil
        if (requete.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    })
  );
});
