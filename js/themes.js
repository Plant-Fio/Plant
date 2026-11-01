// Themes de l'appli : Herbier (par defaut), Serre de nuit, Fleuriste.
// Le choix est garde sur l'appareil (localStorage). Les couleurs et les polices de chaque theme
// sont dans css/style.css (attribut data-theme sur <html>). Un petit script dans index.html
// applique le theme avant meme l'affichage pour eviter un flash de la mauvaise couleur.

const CLE = 'plantes-theme';

// "apercu" sert uniquement aux petites vignettes des Reglages : fond, carte, texte, accent.
export const THEMES = [
  { id: 'herbier', nom: 'Herbier', fond: '#F5F0E6', carte: '#FBF8F1', texte: '#1F2B28', accent: '#3B5655', coins: '3px' },
  { id: 'serre', nom: 'Serre de nuit', fond: '#0F1A18', carte: '#172623', texte: '#EDE8DA', accent: '#D1AC62', coins: '8px' },
  { id: 'fleuriste', nom: 'Fleuriste', fond: '#FBEFE9', carte: '#F6E3A1', texte: '#3A2E39', accent: '#3A2E39', coins: '12px' },
];

export function lireTheme() {
  try {
    const id = localStorage.getItem(CLE);
    if (THEMES.some((t) => t.id === id)) return id;
  } catch { /* stockage indisponible : theme par defaut */ }
  return 'herbier';
}

export function appliquerTheme(id) {
  const theme = THEMES.find((t) => t.id === id) || THEMES[0];
  document.documentElement.dataset.theme = theme.id;
  // Couleur de la barre du navigateur (utile hors mode "application")
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.fond);
  return theme.id;
}

export function choisirTheme(id) {
  const applique = appliquerTheme(id);
  try { localStorage.setItem(CLE, applique); } catch { /* pas grave : valable jusqu'a la fermeture */ }
  return applique;
}
