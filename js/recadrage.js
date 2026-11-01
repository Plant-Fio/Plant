// Ecran de recadrage : apres avoir choisi une photo, on regle un cadre (deplacer, tirer les coins,
// formats rapides), puis « Valider ». « Garder entiere » renvoie la photo d'origine, intacte.
// Renvoie une promesse : le fichier recadre (ou l'original), ou null si on annule.
import { echapper } from './outils.js';

const FORMATS = [
  { id: 'libre', libelle: 'Libre', ratio: null },
  { id: 'carre', libelle: 'Carré', ratio: 1 },
  { id: '4-3', libelle: '4:3', ratio: 4 / 3 },
  { id: 'vertical', libelle: 'Vertical', ratio: 3 / 4 },
];
const TAILLE_MIN = 64; // cote minimum du cadre, en pixels d'ecran
const COTE_MAX_SORTIE = 3200; // on ne produit jamais de gigantesque image (iPhone : limite des canvas)

export function recadrer(fichier, { position = 1, total = 1 } = {}) {
  return new Promise((resolve) => {
    const adresse = URL.createObjectURL(fichier);
    const racine = document.createElement('div');
    racine.className = 'recadrage';
    racine.id = 'recadrage';
    racine.setAttribute('role', 'dialog');
    racine.setAttribute('aria-modal', 'true');
    racine.setAttribute('aria-label', 'Recadrer la photo');
    racine.innerHTML = `
      <header class="recadrage__haut">
        <button class="recadrage__lien" type="button" data-act="annuler">Annuler</button>
        <span class="recadrage__compteur">${total > 1 ? `Photo ${position} sur ${total}` : 'Recadrer'}</span>
        <button class="recadrage__lien recadrage__lien--fort" type="button" data-act="valider">Valider</button>
      </header>
      <div class="recadrage__scene">
        <div class="recadrage__zone" id="zone">
          <img src="${echapper(adresse)}" alt="" draggable="false">
          <div class="recadrage__cadre" id="cadre" hidden>
            ${['nw', 'ne', 'sw', 'se'].map((c) => `<span class="recadrage__poignee recadrage__poignee--${c}" data-coin="${c}"></span>`).join('')}
          </div>
        </div>
      </div>
      <footer class="recadrage__bas">
        <div class="recadrage__formats" role="group" aria-label="Format du cadre">
          ${FORMATS.map((f) => `<button class="recadrage__format" type="button" data-format="${f.id}" aria-pressed="${f.id === 'libre'}">${f.libelle}</button>`).join('')}
        </div>
        <button class="recadrage__garder" type="button" id="recadrage-garder">Garder entière</button>
      </footer>`;

    const surDefilement = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.appendChild(racine);

    const zone = racine.querySelector('#zone');
    const image = racine.querySelector('img');
    const cadre = racine.querySelector('#cadre');
    let ratio = null; // null = libre
    let rect = { x: 0, y: 0, w: 0, h: 0 }; // en pixels d'ecran, dans la zone

    function terminer(resultat) {
      document.body.style.overflow = surDefilement;
      racine.remove();
      URL.revokeObjectURL(adresse);
      resolve(resultat);
    }

    function dessiner() {
      Object.assign(cadre.style, {
        left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px`,
      });
    }

    // Plus grand cadre de ce format, centre dans l'image
    function cadreCentre(r) {
      const W = zone.clientWidth;
      const H = zone.clientHeight;
      let w = W;
      let h = W / r;
      if (h > H) { h = H; w = H * r; }
      return { x: (W - w) / 2, y: (H - h) / 2, w, h };
    }

    function choisirFormat(id) {
      const format = FORMATS.find((f) => f.id === id);
      ratio = format.ratio;
      racine.querySelectorAll('[data-format]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.format === id)));
      if (ratio) { rect = cadreCentre(ratio); dessiner(); }
    }

    // ----- Gestes : deplacer le cadre ou tirer un coin -----
    let geste = null;
    cadre.addEventListener('pointerdown', (e) => {
      const coin = e.target.dataset?.coin || null;
      geste = { coin, departX: e.clientX, departY: e.clientY, depart: { ...rect } };
      cadre.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    cadre.addEventListener('pointermove', (e) => {
      if (!geste) return;
      const W = zone.clientWidth;
      const H = zone.clientHeight;
      const dx = e.clientX - geste.departX;
      const dy = e.clientY - geste.departY;
      const d = geste.depart;
      const borne = (v, mini, maxi) => Math.min(Math.max(v, mini), maxi);

      if (!geste.coin) { // deplacement
        rect = { ...d, x: borne(d.x + dx, 0, W - d.w), y: borne(d.y + dy, 0, H - d.h) };
      } else {
        const gauche = geste.coin.includes('w');
        const haut = geste.coin.includes('n');
        // Le coin oppose reste fixe
        const ax = gauche ? d.x + d.w : d.x;
        const ay = haut ? d.y + d.h : d.y;
        const cx = borne((gauche ? d.x : d.x + d.w) + dx, 0, W);
        const cy = borne((haut ? d.y : d.y + d.h) + dy, 0, H);
        let w = Math.abs(cx - ax);
        let h = Math.abs(cy - ay);
        if (ratio) {
          w = Math.max(w, h * ratio);
          w = Math.min(w, gauche ? ax : W - ax, (haut ? ay : H - ay) * ratio);
          w = Math.max(w, TAILLE_MIN);
          h = w / ratio;
        } else {
          w = Math.max(w, TAILLE_MIN);
          h = Math.max(h, TAILLE_MIN);
        }
        rect = { x: gauche ? ax - w : ax, y: haut ? ay - h : ay, w, h };
      }
      dessiner();
    });
    const finGeste = () => { geste = null; };
    cadre.addEventListener('pointerup', finGeste);
    cadre.addEventListener('pointercancel', finGeste);

    // ----- Boutons -----
    async function valider() {
      const W = zone.clientWidth;
      const H = zone.clientHeight;
      // Cadre = toute l'image : on garde l'original tel quel (pas de recompression pour rien)
      if (rect.w >= W - 1 && rect.h >= H - 1) { terminer(fichier); return; }
      const echelle = image.naturalWidth / W;
      const sx = Math.round(rect.x * echelle);
      const sy = Math.round(rect.y * echelle);
      const sw = Math.max(1, Math.min(Math.round(rect.w * echelle), image.naturalWidth - sx));
      const sh = Math.max(1, Math.min(Math.round(rect.h * echelle), image.naturalHeight - sy));
      const reduction = Math.min(1, COTE_MAX_SORTIE / Math.max(sw, sh));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sw * reduction));
      canvas.height = Math.max(1, Math.round(sh * reduction));
      canvas.getContext('2d').drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.92));
      canvas.width = 0; // Safari garde la memoire des canvas : on les vide
      canvas.height = 0;
      terminer(blob ? new File([blob], 'photo-recadree.jpg', { type: 'image/jpeg' }) : fichier);
    }

    racine.addEventListener('click', (e) => {
      const bouton = e.target.closest('button');
      if (!bouton) return;
      if (bouton.dataset.format) choisirFormat(bouton.dataset.format);
      else if (bouton.dataset.act === 'annuler') terminer(null);
      else if (bouton.dataset.act === 'valider') valider();
      else if (bouton.id === 'recadrage-garder') terminer(fichier);
    });

    image.addEventListener('load', () => {
      rect = { x: 0, y: 0, w: zone.clientWidth, h: zone.clientHeight };
      cadre.hidden = false;
      dessiner();
    });
    // Image illisible : on rend le fichier tel quel, l'envoi affichera son message d'erreur habituel
    image.addEventListener('error', () => terminer(fichier));
  });
}
