// Outils communs aux scripts de verification.
// Les "annotations" (::error, ::warning, ::notice) s'affichent sur la page du run GitHub
// et dans l'onglet "Files changed" de la PR : c'est comme ca que les erreurs remontent.
import fs from 'node:fs';

const echapperMessage = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const echapperPropriete = (s) => echapperMessage(s).replace(/:/g, '%3A').replace(/,/g, '%2C');

export function annoter(niveau, titre, message, fichier, ligne) {
  const proprietes = [];
  if (fichier) proprietes.push(`file=${echapperPropriete(fichier)}`);
  if (ligne) proprietes.push(`line=${ligne}`);
  proprietes.push(`title=${echapperPropriete(titre)}`);
  console.log(`::${niveau} ${proprietes.join(',')}::${echapperMessage(message)}`);
  if (niveau === 'error') process.exitCode = 1;
}

// Liste des points verifies avec succes, affichee a la fin dans une seule annotation "notice".
const reussites = [];
export function ok(message) {
  reussites.push(message);
  console.log(`  OK  ${message}`);
}
export function bilan(titre) {
  if (reussites.length) annoter('notice', titre, reussites.map((m) => `- ${m}`).join('\n'));
  reussites.length = 0;
}

export function lireVersion() {
  const texte = fs.readFileSync('js/version.js', 'utf8');
  const version = texte.match(/APP_VERSION\s*=\s*"([^"]+)"/)?.[1];
  if (!version) throw new Error('Version introuvable dans js/version.js');
  return version;
}
