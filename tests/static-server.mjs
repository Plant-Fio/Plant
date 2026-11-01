// Mini serveur de fichiers statiques (pour tester le site dans Chromium, sur le runner).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

export function servir(dossier, port) {
  const racine = path.resolve(dossier);
  const serveur = http.createServer((requete, reponse) => {
    let chemin = decodeURIComponent(new URL(requete.url, 'http://x').pathname);
    if (chemin.endsWith('/')) chemin += 'index.html';
    const fichier = path.join(racine, chemin);
    if (!fichier.startsWith(racine) || !fs.existsSync(fichier) || fs.statSync(fichier).isDirectory()) {
      reponse.writeHead(404, { 'Content-Type': 'text/plain' });
      reponse.end('Introuvable');
      return;
    }
    reponse.writeHead(200, {
      'Content-Type': TYPES[path.extname(fichier)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(fichier).pipe(reponse);
  });
  return new Promise((resolve) => serveur.listen(port, '127.0.0.1', () => resolve(serveur)));
}
