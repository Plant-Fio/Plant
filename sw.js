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
  './js/camera.js',
  './js/themes.js',
  './js/notifications.js',
  './js/vues-reglages.js',
  './js/app.js',
  './vendor/supabase.js',
  './fonts/cormorant-garamond-latin-500-normal.woff2',
  './fonts/cormorant-garamond-latin-600-normal.woff2',
  './fonts/bodoni-moda-latin-500-normal.woff2',
  './fonts/jost-latin-400-normal.woff2',
  './fonts/jost-latin-500-normal.woff2',
  './fonts/jost-latin-600-normal.woff2',
  './fonts/young-serif-latin-400-normal.woff2',
  './fonts/dm-sans-latin-400-normal.woff2',
  './fonts/dm-sans-latin-500-normal.woff2',
  './fonts/dm-sans-latin-600-normal.woff2',

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

// ---------- Notifications (rappels envoyes par le serveur) ----------

self.addEventListener('push', (evenement) => {
  let donnees = {};
  try { donnees = evenement.data ? evenement.data.json() : {}; } catch { /* message sans details */ }
  // iOS exige d'afficher une notification a chaque message recu
  evenement.waitUntil(self.registration.showNotification(donnees.titre || 'Mes plantes', {
    body: donnees.corps || 'Il y a des choses à faire aujourd\'hui.',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: donnees.tag || 'rappel',
    data: { url: donnees.url || './#/aujourdhui' },
  }));
});

// Toucher la notification ouvre l'appli sur l'ecran « Aujourd'hui »
self.addEventListener('notificationclick', (evenement) => {
  evenement.notification.close();
  const cible = new URL(evenement.notification.data?.url || './#/aujourdhui', self.registration.scope).href;
  evenement.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenetres) => {
    for (const fenetre of fenetres) {
      if ('focus' in fenetre) { fenetre.navigate?.(cible).catch(() => {}); return fenetre.focus(); }
    }
    return self.clients.openWindow(cible);
  }));
});
