// Verifie le site PUBLIE (GitHub Pages) avec un vrai Chromium au format iPhone.
// Usage : node tests/run-online.mjs https://compte.github.io/depot/
import { verifierConnexion } from './checks.mjs';
import { annoter, lireVersion } from './helpers.mjs';

const adresse = process.argv[2];
if (!adresse) {
  annoter('error', 'Verification en ligne', "Aucune adresse donnee. Usage : node tests/run-online.mjs <url>");
  process.exit(1);
}
const base = adresse.endsWith('/') ? adresse : `${adresse}/`;
const version = lireVersion();

// GitHub Pages peut mettre un moment a servir la nouvelle version : on attend jusqu'a 4 minutes.
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let enLigne = false;
for (let essai = 1; essai <= 24; essai++) {
  try {
    const reponse = await fetch(`${base}js/version.js?verif=${Date.now()}`, { cache: 'no-store' });
    const texte = reponse.ok ? await reponse.text() : '';
    if (texte.includes(`"${version}"`)) { enLigne = true; break; }
    console.log(`Essai ${essai}/24 : version ${version} pas encore en ligne (HTTP ${reponse.status})`);
  } catch (e) {
    console.log(`Essai ${essai}/24 : ${e.message}`);
  }
  await pause(10000);
}

if (!enLigne) {
  annoter('error', 'Verification en ligne', `La version ${version} n'apparait pas sur ${base} apres 4 minutes. Pages est-il active (Settings > Pages > Source : GitHub Actions) ?`);
  process.exit(1);
}

await verifierConnexion(base, 'captures/en-ligne', { version });
