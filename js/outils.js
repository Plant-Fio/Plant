// Petits outils partages : protection du texte, icones, dates en francais.

// Protege l'affichage de texte venant de l'exterieur (nom d'une plante, notes...) dans du HTML.
export function echapper(texte) {
  return String(texte ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const CHEMINS_ICONES = {
  feuille:
    '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/>' +
    '<path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
  goutte:
    '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
  reglages:
    '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>' +
    '<line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>' +
    '<line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>' +
    '<line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/>' +
    '<line x1="17" y1="16" x2="23" y2="16"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  retour: '<path d="m15 18-6-6 6-6"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  recherche: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  crayon: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  corbeille:
    '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
};

export function icone(nom) {
  return `<svg class="icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
    `${CHEMINS_ICONES[nom]}</svg>`;
}

// "dimanche 1 novembre" -> "Dimanche 1 novembre"
export function dateDuJour() {
  const texte = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date());
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

// "2024-03-12" (format de la base) -> "12 mars 2024".
// On decoupe a la main : new Date("2024-03-12") serait lu en UTC et pourrait afficher la veille.
export function formaterDate(iso) {
  const morceaux = String(iso || '').split('-').map(Number);
  if (morceaux.length !== 3 || morceaux.some(Number.isNaN)) return '';
  const [annee, mois, jour] = morceaux;
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(annee, mois - 1, jour));
}

// Pour la recherche : minuscules et sans accents ("Épine" correspond a "epine").
export function normaliser(texte) {
  return String(texte ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// ---------- Dates "du jour" (heure locale, jamais UTC) ----------

const deuxChiffres = (n) => String(n).padStart(2, '0');

// Date -> "2026-11-01" (jour local de l'iPhone, pas UTC : a 00h30 on est deja le lendemain)
export function dateIsoLocale(date = new Date()) {
  return `${date.getFullYear()}-${deuxChiffres(date.getMonth() + 1)}-${deuxChiffres(date.getDate())}`;
}

// "2026-11-01" -> Date a midi (midi evite tout decalage lors des changements d'heure)
function versDate(iso) {
  const [annee, mois, jour] = String(iso).split('-').map(Number);
  return new Date(annee, mois - 1, jour, 12);
}

export function ajouterJours(iso, nombre) {
  const date = versDate(iso);
  date.setDate(date.getDate() + nombre);
  return dateIsoLocale(date);
}

// Nombre de jours entre deux dates (positif si `fin` est apres `debut`)
export function joursEntre(debut, fin) {
  return Math.round((versDate(fin) - versDate(debut)) / 86400000);
}

// "Aujourd'hui", "Hier", sinon "12 mars 2024"
export function dateRelative(iso, aujourdhui = dateIsoLocale()) {
  if (!iso) return '';
  const ecart = joursEntre(aujourdhui, iso);
  if (ecart === 0) return "Aujourd'hui";
  if (ecart === -1) return 'Hier';
  return formaterDate(iso);
}
