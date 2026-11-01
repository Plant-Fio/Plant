// Silhouettes de plantes pour l'appareil photo : de simples formes (dessinees pour l'appli) qu'on superpose
// a l'image pour cadrer toutes les plantes de la meme facon. Repere : 300 x 400, le pot est en bas.
// Classes : "s" = surface, "tige" = trait.

const POT = '<path class="s" d="M108 332 L192 332 L183 392 L117 392 Z"/>';
const POT_HAUT = '<path class="s" d="M118 232 L182 232 L175 292 L125 292 Z"/>';

// Feuille en forme de coeur, pointe vers le bas (a tourner / agrandir avec transform)
const COEUR = 'M0 45 C-45 28 -52 -22 -22 -36 C-9 -41 0 -33 0 -24 C0 -33 9 -41 22 -36 C52 -22 45 28 0 45 Z';
// Feuille de monstera : grand coeur arrondi, avec des fentes tracees depuis le bord
const MONSTERA = COEUR;
const FENTES = 'M-50 0 L-18 8 M-44 -24 L-17 -8 M-30 28 L-10 18 M50 0 L18 8 M44 -24 L17 -8 M30 28 L10 18 M0 -22 L0 38';
// Feuille d'alocasia : bouclier pointu, pointe vers le haut
const ALOCASIA = 'M0 -72 C26 -32 46 8 31 46 C21 62 8 64 0 56 C-8 64 -21 62 -31 46 C-46 8 -26 -32 0 -72 Z';
// Feuille ovale pointue (pothos, ficus)
const OVALE = 'M0 -34 C22 -22 26 14 0 34 C-26 14 -22 -22 0 -34 Z';

const f = (d, x, y, angle, echelle = 1, fentes = false) =>
  `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${echelle})"><path class="s" d="${d}"/>`
  + `${fentes ? `<path class="tige fin" d="${FENTES}"/>` : ''}</g>`;
const tige = (d) => `<path class="tige" d="${d}"/>`;

export const SILHOUETTES = [
  {
    id: 'touffe',
    nom: 'Touffe',
    svg: POT
      + f('M0 -60 C45 -55 70 -20 62 20 C55 55 20 62 0 60 C-20 62 -55 55 -62 20 C-70 -20 -45 -55 0 -60 Z', 150, 236, 0, 1.45),
  },
  {
    id: 'monstera',
    nom: 'Monstera',
    svg: POT
      + tige('M150 332 C150 280 118 230 88 188') + tige('M150 332 C152 270 168 190 190 138') + tige('M150 332 C150 290 205 262 232 232')
      + f(MONSTERA, 82, 158, 25, 1.25, true) + f(MONSTERA, 192, 106, -12, 1.4, true) + f(MONSTERA, 236, 214, -50, 1.1, true),
  },
  {
    id: 'alocasia',
    nom: 'Alocasia',
    svg: POT
      + tige('M146 332 C140 270 112 190 96 128') + tige('M152 332 C156 250 170 160 188 92') + tige('M150 332 C170 290 222 250 240 196')
      + f(ALOCASIA, 94, 98, -22, 1.05) + f(ALOCASIA, 188, 56, 8, 1.2) + f(ALOCASIA, 246, 168, 38, 0.95),
  },
  {
    id: 'anthurium',
    nom: 'Anthurium',
    svg: POT
      + tige('M142 332 C138 280 116 232 104 190') + tige('M158 332 C164 270 190 214 198 168') + tige('M150 332 C150 260 148 210 150 150')
      + f(COEUR, 98, 160, 200, 1.0) + f(COEUR, 202, 138, 155, 1.1)
      + '<path class="s" d="M150 80 C132 92 128 128 150 150 C172 128 168 92 150 80 Z"/>'
      + tige('M150 150 L150 128'),
  },
  {
    id: 'tombante',
    nom: 'Tombante',
    svg: '<g transform="translate(-30 -100) scale(1.2)">' + POT_HAUT
      + tige('M135 292 C100 330 110 372 96 398') + tige('M165 292 C200 322 190 366 206 398') + tige('M150 292 C150 336 140 360 150 398')
      + f(OVALE, 108, 330, 20, 0.75) + f(OVALE, 98, 372, -10, 0.7) + f(OVALE, 194, 322, -25, 0.75)
      + f(OVALE, 204, 368, 12, 0.7) + f(OVALE, 148, 346, 4, 0.7) + f(OVALE, 150, 388, 0, 0.55)
      + f(OVALE, 128, 224, -35, 0.85) + f(OVALE, 172, 224, 35, 0.85) + f(OVALE, 150, 206, 0, 0.9) + '</g>',
  },
  {
    id: 'haute',
    nom: 'Haute',
    svg: POT
      + '<path class="s" d="M143 332 L157 332 L154 150 L146 150 Z"/>'
      + f('M0 -60 C45 -55 70 -20 62 20 C55 55 20 62 0 60 C-20 62 -55 55 -62 20 C-70 -20 -45 -55 0 -60 Z', 150, 108, 0, 1.15)
      + f(OVALE, 96, 150, -60, 1.0) + f(OVALE, 204, 150, 60, 1.0),
  },
  {
    id: 'rosette',
    nom: 'Rosette',
    svg: POT
      + [0, 40, 80, 120, 160, 200, 240, 280, 320].map((a) => f('M0 0 C14 -20 12 -46 0 -62 C-12 -46 -14 -20 0 0 Z', 150, 300, a, 1.2)).join('')
      + f('M0 0 C12 -18 10 -40 0 -54 C-10 -40 -12 -18 0 0 Z', 150, 298, 0, 1.0),
  },
];

export const silhouettePar = (id) => SILHOUETTES.find((s) => s.id === id) || SILHOUETTES[0];

// Balise <svg> complete d'une silhouette
export const silhouetteHtml = (id) => `<svg class="silhouette" viewBox="0 0 300 400" preserveAspectRatio="xMidYMax meet" aria-hidden="true">${silhouettePar(id).svg}</svg>`;
