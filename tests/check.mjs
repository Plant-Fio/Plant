// Controles statiques (rapides, sans navigateur) : fichiers, manifest, icones, syntaxe JS,
// numero de version, et surtout : aucune cle secrete dans le depot.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { annoter, ok, bilan } from './helpers.mjs';

let erreurs = 0;
const erreur = (titre, message, fichier, ligne) => { erreurs++; annoter('error', titre, message, fichier, ligne); };
const lire = (f) => fs.readFileSync(f, 'utf8');
const liste = (dossier, ext) => fs.readdirSync(dossier).filter((f) => f.endsWith(ext)).map((f) => `${dossier}/${f}`);

// 1. Fichiers indispensables
const ICONES = {
  'icons/icon-192.png': 192,
  'icons/icon-512.png': 512,
  'icons/icon-512-maskable.png': 512,
  'icons/apple-touch-icon.png': 180,
  'icons/favicon-32.png': 32,
};
const REQUIS = [
  'index.html', 'manifest.webmanifest', 'sw.js', 'css/style.css',
  'js/app.js', 'js/config.js', 'js/version.js', 'CHANGELOG.md', 'scripts/build.sh',
  ...Object.keys(ICONES),
];
for (const f of REQUIS) if (!fs.existsSync(f)) erreur('Fichier manquant', `${f} est introuvable.`, f);
if (erreurs) process.exit(1);
ok('fichiers indispensables presents');

// 2. Dimensions reelles des icones PNG (lues dans l'en-tete du fichier)
for (const [f, taille] of Object.entries(ICONES)) {
  const octets = fs.readFileSync(f);
  const largeur = octets.readUInt32BE(16);
  const hauteur = octets.readUInt32BE(20);
  if (largeur !== taille || hauteur !== taille) {
    erreur('Icone mal dimensionnee', `${f} fait ${largeur}x${hauteur}, attendu ${taille}x${taille}.`, f);
  }
}
ok('icones aux bonnes dimensions');

// 3. Manifest
try {
  const manifest = JSON.parse(lire('manifest.webmanifest'));
  for (const cle of ['name', 'short_name', 'start_url', 'scope', 'display', 'background_color', 'theme_color']) {
    if (!manifest[cle]) erreur('Manifest incomplet', `Le champ "${cle}" manque.`, 'manifest.webmanifest');
  }
  if (manifest.display !== 'standalone') erreur('Manifest', 'display doit valoir "standalone" (plein ecran).', 'manifest.webmanifest');
  const tailles = (manifest.icons || []).map((i) => i.sizes);
  if (!tailles.includes('192x192') || !tailles.includes('512x512')) {
    erreur('Manifest', 'Il faut des icones 192x192 et 512x512.', 'manifest.webmanifest');
  }
  if (!(manifest.icons || []).some((i) => i.purpose === 'maskable')) {
    erreur('Manifest', 'Il manque une icone "maskable".', 'manifest.webmanifest');
  }
  for (const icone of manifest.icons || []) {
    if (!fs.existsSync(icone.src)) erreur('Manifest', `Icone introuvable : ${icone.src}`, 'manifest.webmanifest');
  }
} catch (e) {
  erreur('Manifest illisible', e.message, 'manifest.webmanifest');
}
ok('manifest valide');

// 4. index.html
const html = lire('index.html');
for (const [motif, explication] of [
  ['lang="fr"', 'la page doit etre declaree en francais (lang="fr")'],
  ['viewport-fit=cover', 'viewport-fit=cover est necessaire pour les zones sures (encoche)'],
  ['rel="manifest"', 'le lien vers le manifest manque'],
  ['rel="apple-touch-icon"', "l'icone pour l'ecran d'accueil iPhone manque"],
]) {
  if (!html.includes(motif)) erreur('index.html', explication, 'index.html');
}
ok('index.html conforme');

// 5. Syntaxe JavaScript
const scripts = ['sw.js', ...liste('js', '.js'), ...liste('scripts', '.js'), ...liste('tests', '.mjs'), 'tests/supabase-stub.js'];
for (const f of new Set(scripts)) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) {
    const ligne = Number(r.stderr.match(/:(\d+)\n/)?.[1]) || undefined;
    const detail = r.stderr.split('\n').find((l) => /Error/.test(l)) || r.stderr.trim();
    erreur('Erreur de syntaxe JavaScript', detail, f, ligne);
  }
}
ok('syntaxe JavaScript correcte');

// 6. Le service worker ne doit lister que des fichiers qui existent (ou que la CI fabrique)
for (const [, chemin] of lire('sw.js').matchAll(/'\.\/([^']*)'/g)) {
  if (chemin && chemin !== 'vendor/supabase.js' && chemin !== 'vendor/qr.js' && !chemin.startsWith('fonts/') && !fs.existsSync(chemin)) {
    erreur('Service worker', `Le squelette met en cache "${chemin}" qui n'existe pas.`, 'sw.js');
  }
}
// ... et inversement : chaque fichier de l'appli doit etre dans le squelette, sinon il manquera hors ligne
const swTexte = lire('sw.js');
for (const f of [...liste('js', '.js'), ...liste('css', '.css'), 'index.html', 'manifest.webmanifest']) {
  if (f !== 'index.html' && !swTexte.includes(`'./${f}'`)) {
    erreur('Service worker', `${f} n'est pas dans le squelette de sw.js : il ne marcherait pas hors ligne.`, 'sw.js');
  }
}
ok('squelette du service worker coherent');

// 7. Version : js/version.js et CHANGELOG.md doivent dire la meme chose
const version = lire('js/version.js').match(/APP_VERSION\s*=\s*"([^"]+)"/)?.[1];
const versionChangelog = lire('CHANGELOG.md').match(/^## \[(\d+\.\d+\.\d+)\]/m)?.[1];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  erreur('Version', 'js/version.js doit contenir une version du type 1.2.3.', 'js/version.js');
} else if (version !== versionChangelog) {
  erreur('Version', `js/version.js dit ${version} mais la derniere entree du CHANGELOG dit ${versionChangelog}.`, 'CHANGELOG.md');
} else {
  ok(`version ${version} identique dans version.js et CHANGELOG.md`);
}

// 8. Aucune cle secrete dans les fichiers du site
const fichiersSite = ['index.html', 'sw.js', 'manifest.webmanifest', 'css/style.css', ...liste('js', '.js')];
for (const f of fichiersSite) {
  const texte = lire(f);
  for (const [, charge] of texte.matchAll(/eyJ[\w-]+\.([\w-]+)\.[\w-]+/g)) {
    try {
      const contenu = JSON.parse(Buffer.from(charge, 'base64url').toString());
      if (contenu.role && contenu.role !== 'anon') {
        erreur('CLE SECRETE DANS LE DEPOT', `${f} contient une cle au role "${contenu.role}". Seule la cle "anon" est autorisee. Il faut la supprimer ET la regenerer dans Supabase.`, f);
      }
    } catch { /* ce n'etait pas un jeton lisible : on passe */ }
  }
  if (/service_role|sb_secret_/.test(texte)) {
    erreur('CLE SECRETE DANS LE DEPOT', `${f} mentionne une cle secrete Supabase.`, f);
  }
}
ok('aucune cle secrete dans le site (seule la cle anon est presente)');

bilan('Controles statiques');
if (!erreurs) console.log('Controles statiques : tout est bon.');
