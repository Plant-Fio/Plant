// Etiquettes QR pour les pots : un QR code (qui ouvre la fiche de la plante) + le nom, dessines en noir
// sur blanc a la taille exacte du rouleau, puis enregistres / partages en image (a imprimer avec l'app Niimbot).
import { trouverPlante, lireEtat } from './donnees.js';
import { echapper, icone } from './outils.js';
import { message } from './dialogues.js';

// Rouleaux commandes (largeur x longueur en mm, l'etiquette se lit dans le sens de la longueur)
export const FORMATS = [
  { id: 'transparente', libelle: 'Transparente', longueur: 30, hauteur: 14 },
  { id: 'blanche', libelle: 'Blanche', longueur: 40, hauteur: 14 },
  { id: 'verte', libelle: 'Verte', longueur: 40, hauteur: 12 },
];
export const POLICES = [
  { id: 'standard', libelle: 'Standard', famille: null, poids: 700 },
  { id: 'pacifico', libelle: 'Pacifico', famille: 'Etq Pacifico', fichier: 'pacifico-latin-400-normal.woff2', poids: 400 },
  { id: 'lobster', libelle: 'Lobster Two', famille: 'Etq Lobster Two', fichier: 'lobster-two-latin-700-normal.woff2', poids: 700 },
  { id: 'cormorant', libelle: 'Cormorant SC', famille: 'Etq Cormorant SC', fichier: 'cormorant-sc-latin-600-normal.woff2', poids: 600 },
  { id: 'jost', libelle: 'Jost léger', famille: 'Etq Jost léger', fichier: 'jost-latin-300-normal.woff2', poids: 300 },
  { id: 'raleway', libelle: 'Raleway léger', famille: 'Etq Raleway léger', fichier: 'raleway-latin-300-normal.woff2', poids: 300 },
  { id: 'quicksand', libelle: 'Quicksand', famille: 'Etq Quicksand', fichier: 'quicksand-latin-500-normal.woff2', poids: 500 },
  { id: 'patrick', libelle: 'Patrick Hand', famille: 'Etq Patrick Hand', fichier: 'patrick-hand-latin-400-normal.woff2', poids: 400 },
  { id: 'gloock', libelle: 'Gloock', famille: 'Etq Gloock', fichier: 'gloock-latin-400-normal.woff2', poids: 400 },
];
const CLE_POLICE = 'plantes-etiquette-police';
const PILE_STANDARD = '-apple-system, system-ui, "Helvetica Neue", sans-serif';
const pileDe = (police) => (police.famille ? `"${police.famille}", ${PILE_STANDARD}` : PILE_STANDARD);
const chargees = new Map();
// Charge une police (une seule fois) pour que le canvas et les boutons puissent l'utiliser
export function chargerPolice(police) {
  if (!police.famille) return Promise.resolve();
  if (!chargees.has(police.id)) {
    const face = new FontFace(police.famille, `url(fonts/${police.fichier})`, { weight: String(police.poids) });
    chargees.set(police.id, face.load().then((f) => { document.fonts.add(f); }).catch(() => { /* police absente : repli sur la police standard */ }));
  }
  return chargees.get(police.id);
}
const PX_PAR_MM = 24; // 2 fois la finesse de la D11-H (environ 12 points/mm, 300 dpi) : image nette, mise a l'echelle par l'app Niimbot
const MARGE_MM = 0.6;
const CLE_FORMAT = 'plantes-etiquette-format';
const CLE_MODE = 'plantes-etiquette-mode'; // 'nom' (QR + nom) ou 'seul' (QR seul)

// ---- Code court d'une plante : son identifiant (uuid) en base64url, 22 caracteres (QR plus petit = plus lisible)
export function idVersCode(id) {
  const hex = String(id).replace(/-/g, '');
  let binaire = '';
  for (let i = 0; i < 32; i += 2) binaire += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function codeVersId(code) {
  try {
    const binaire = atob(String(code).replace(/-/g, '+').replace(/_/g, '/'));
    if (binaire.length !== 16) return null;
    const hex = [...binaire].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch { return null; }
}
// Adresse inscrite dans le QR : la page de l'appli + #/q/<code>
export const adresseQr = (id) => new URL(`#/q/${idVersCode(id)}`, new URL('./', location.href)).href;

// Coupe un nom en lignes qui tiennent dans la largeur donnee (null si un mot est trop long)
function couper(ctx, texte, largeur, maxLignes) {
  const mots = texte.split(/\s+/).filter(Boolean);
  const lignes = [];
  let courante = '';
  for (const mot of mots) {
    const essai = courante ? `${courante} ${mot}` : mot;
    if (ctx.measureText(essai).width <= largeur) { courante = essai; continue; }
    if (!courante || ctx.measureText(mot).width > largeur) return null;
    lignes.push(courante);
    courante = mot;
  }
  if (courante) lignes.push(courante);
  return lignes.length <= maxLignes ? lignes : null;
}

// Dessine l'etiquette dans un <canvas> (noir sur blanc, QR a modules entiers pour rester net)
export async function dessinerEtiquette(canvas, plante, format, avecNom = true, police = POLICES[0]) {
  await chargerPolice(police);
  const { default: qrcode } = await import('../vendor/qr.js');
  const qr = qrcode(0, 'M');
  qr.addData(adresseQr(plante.id));
  qr.make();
  const n = qr.getModuleCount();

  const largeur = format.longueur * PX_PAR_MM;
  const hauteur = format.hauteur * PX_PAR_MM;
  canvas.width = largeur;
  canvas.height = hauteur;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, largeur, hauteur);

  // QR : le plus grand possible, avec un module entier (au moins 1 pixel de marge de silence autour)
  const marge = Math.round(MARGE_MM * PX_PAR_MM);
  const cote = hauteur - 2 * marge;
  const module = Math.floor(cote / (n + 2)); // +2 = marge de silence d'un module de chaque cote
  const tailleQr = module * n;
  // QR seul : centre sur l'etiquette ; avec nom : a gauche
  const x0 = avecNom ? marge + Math.floor((cote - tailleQr) / 2) : Math.floor((largeur - tailleQr) / 2);
  const y0 = Math.floor((hauteur - tailleQr) / 2);
  ctx.fillStyle = '#000';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect(x0 + c * module, y0 + r * module, module, module);
  }

  if (!avecNom) return { modules: n, module };

  // Nom : a droite du QR, 1 a 3 lignes, police reduite jusqu'a ce que tout tienne
  const xTexte = marge + cote + Math.round(0.7 * PX_PAR_MM);
  const largeurTexte = largeur - xTexte - marge;
  const nom = String(plante.nom || '').trim();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#000';
  let choix = null;
  for (let taille = Math.round(hauteur * 0.34); taille >= Math.round(hauteur * 0.17) && !choix; taille -= 2) {
    ctx.font = `${police.poids} ${taille}px ${pileDe(police)}`;
    const maxLignes = taille > hauteur * 0.26 ? 2 : 3;
    const lignes = couper(ctx, nom, largeurTexte, maxLignes);
    if (lignes && lignes.length * taille * 1.12 <= hauteur - 2 * marge) choix = { taille, lignes };
  }
  if (!choix) { // nom tres long : on coupe avec « … » a la plus petite taille
    const taille = Math.round(hauteur * 0.17);
    ctx.font = `${police.poids} ${taille}px ${pileDe(police)}`;
    let texte = nom;
    while (texte.length > 1 && ctx.measureText(`${texte}…`).width > largeurTexte) texte = texte.slice(0, -1);
    choix = { taille, lignes: [`${texte.trimEnd()}…`] };
  }
  const interligne = choix.taille * 1.12;
  const haut = (hauteur - interligne * choix.lignes.length) / 2 + interligne / 2;
  choix.lignes.forEach((ligne, i) => ctx.fillText(ligne, xTexte, haut + i * interligne));
  return { modules: n, module };
}

const modeRetenu = () => {
  try { return localStorage.getItem(CLE_MODE) === 'seul' ? 'seul' : 'nom'; } catch { return 'nom'; }
};
const policeRetenue = () => {
  try { return POLICES.find((p) => p.id === localStorage.getItem(CLE_POLICE)) || POLICES[0]; } catch { return POLICES[0]; }
};
const formatRetenu = () => {
  try { return FORMATS.find((f) => f.id === localStorage.getItem(CLE_FORMAT)) || FORMATS[1]; } catch { return FORMATS[1]; }
};

export function vueEtiquette(conteneur, idPlante) {
  const plante = trouverPlante(idPlante);
  if (!plante) {
    conteneur.innerHTML = `<a class="retour" href="#/plantes">${icone('retour')} Mes plantes</a><p class="aucun-resultat">Plante introuvable.</p>`;
    return;
  }
  let format = formatRetenu();
  let mode = modeRetenu();
  let police = policeRetenue();
  conteneur.innerHTML = `
    <a class="retour" href="#/plantes/${plante.id}">${icone('retour')} ${echapper(plante.nom)}</a>
    <h1 class="vue__titre">Étiquette</h1>
    <div class="etiquette__formats" role="group" aria-label="Rouleau d'étiquettes">
      ${FORMATS.map((f) => `<button class="etiquette__format" type="button" data-format="${f.id}" aria-pressed="${f.id === format.id}">
        ${f.libelle}<small>${f.longueur} × ${f.hauteur} mm</small></button>`).join('')}
    </div>
    <div class="etiquette__formats etiquette__formats--mode" role="group" aria-label="Contenu de l'étiquette">
      <button class="etiquette__format etiquette__format--mode" type="button" data-mode="nom" aria-pressed="${mode === 'nom'}">QR + nom</button>
      <button class="etiquette__format etiquette__format--mode" type="button" data-mode="seul" aria-pressed="${mode === 'seul'}">QR seul</button>
    </div>
    <div class="etiquette__polices" id="etiquette-polices" role="group" aria-label="Style du nom"${mode === 'seul' ? ' hidden' : ''}>
      ${POLICES.map((p) => `<button class="etiquette__police" type="button" data-police="${p.id}" aria-pressed="${p.id === police.id}"
        style="font-family:${pileDe(p)};font-weight:${p.poids}">${echapper(plante.nom)}</button>`).join('')}
    </div>
    <div class="etiquette__cadre"><canvas id="etiquette-canvas" aria-label="Aperçu de l'étiquette"></canvas></div>
    <p class="etiquette__aide" id="etiquette-aide"></p>
    <button class="btn btn--primaire" id="etiquette-partager" type="button">Enregistrer / partager l'image</button>
    <button class="btn" id="etiquette-copier-nom" type="button">Copier le nom « ${echapper(plante.nom)} »</button>
    <p class="etiquette__aide">Dans l'app Niimbot : nouvelle étiquette, puis <b>Image</b>, et choisis cette image. Règle le rouleau sur le même format.</p>`;

  const canvas = conteneur.querySelector('#etiquette-canvas');
  async function dessiner() {
    await dessinerEtiquette(canvas, plante, format, mode === 'nom', police);
    canvas.style.aspectRatio = `${format.longueur} / ${format.hauteur}`;
    conteneur.querySelector('#etiquette-aide').textContent = `Taille réelle : ${format.longueur} × ${format.hauteur} mm`;
    conteneur.querySelectorAll('[data-format]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.format === format.id)));
    conteneur.querySelector('#etiquette-polices').hidden = mode === 'seul';
    conteneur.querySelectorAll('[data-police]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.police === police.id)));
    conteneur.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  }

  conteneur.onclick = async (e) => {
    const choix = e.target.closest('[data-format]');
    if (choix) {
      format = FORMATS.find((f) => f.id === choix.dataset.format) || format;
      try { localStorage.setItem(CLE_FORMAT, format.id); } catch { /* pas grave */ }
      dessiner();
      return;
    }
    const choixPolice = e.target.closest('[data-police]');
    if (choixPolice) {
      police = POLICES.find((p) => p.id === choixPolice.dataset.police) || police;
      try { localStorage.setItem(CLE_POLICE, police.id); } catch { /* pas grave */ }
      dessiner();
      return;
    }
    const choixMode = e.target.closest('[data-mode]');
    if (choixMode) {
      mode = choixMode.dataset.mode === 'seul' ? 'seul' : 'nom';
      try { localStorage.setItem(CLE_MODE, mode); } catch { /* pas grave */ }
      dessiner();
      return;
    }
    if (e.target.closest('#etiquette-copier-nom')) {
      let copie = false;
      try { await navigator.clipboard.writeText(String(plante.nom)); copie = true; } catch { /* repli ci-dessous */ }
      if (!copie) { // repli pour les navigateurs qui refusent le presse-papiers
        const zone = document.createElement('textarea');
        zone.value = String(plante.nom);
        zone.style.cssText = 'position:fixed;opacity:0';
        document.body.append(zone);
        zone.select();
        try { copie = document.execCommand('copy'); } catch { /* rien */ }
        zone.remove();
      }
      message(copie ? 'Nom copié' : 'Copie impossible', copie ? undefined : 'erreur');
      return;
    }
    if (!e.target.closest('#etiquette-partager')) return;
    const nomFichier = `etiquette${mode === 'seul' ? '-qr' : ''}-${String(plante.nom).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'plante'}-${format.longueur}x${format.hauteur}.png`;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) { message("Impossible de créer l'image", 'erreur'); return; }
    const fichier = new File([blob], nomFichier, { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [fichier] })) {
        await navigator.share({ files: [fichier] });
        return;
      }
    } catch (erreur) {
      if (erreur?.name === 'AbortError') return; // fermé sans partager
    }
    // Pas de partage de fichier : telechargement classique
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(blob);
    lien.download = nomFichier;
    document.body.append(lien);
    lien.click();
    lien.remove();
    setTimeout(() => URL.revokeObjectURL(lien.href), 10000);
    message('Image enregistrée');
  };
  dessiner();
  // Les boutons de style s'affichent dans leur police : on les charge toutes, puis on redessine
  Promise.all(POLICES.map(chargerPolice)).then(() => { if (conteneur.querySelector('#etiquette-canvas') === canvas) dessiner(); });
}

// « #/q/<code> » (lu par l'appareil photo de l'iPhone) : ouvre la fiche de la plante
export function ouvrirDepuisCode(code) {
  const id = codeVersId(code);
  const plante = id && lireEtat().plantes.find((p) => p.id === id);
  if (plante) location.replace(`${location.pathname}${location.search}#/plantes/${plante.id}`);
  else { message("Cette étiquette ne correspond à aucune plante", 'erreur'); location.replace(`${location.pathname}${location.search}#/plantes`); }
}
