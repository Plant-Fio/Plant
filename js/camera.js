// Appareil photo de l'appli, avec des reperes pour que les photos d'une meme plante se ressemblent :
//   - la derniere photo de la plante en transparence (« fantome »),
//   - ou une silhouette de plante (monstera, alocasia...),
//   - et une ligne horizontale qu'on place (par exemple sur le haut d'une feuille).
// Les reperes ne sont JAMAIS sur la photo enregistree. Reglages retenus par plante sur l'appareil.
// Renvoie le fichier photo (JPEG), ou null si on ferme. Format fixe : 3:4 (4:3 si l'iPhone est a l'horizontale).
import { echapper } from './outils.js';
import { SILHOUETTES, silhouetteHtml } from './silhouettes.js';

const COTE_MAX = 3200;
const AIDES = [
  { id: 'aucune', libelle: 'Aucune' },
  { id: 'fantome', libelle: 'Dernière photo' },
  { id: 'silhouette', libelle: 'Silhouette' },
];

const cleReglages = (idPlante) => `repere-${idPlante}`;
function lireReglages(idPlante) {
  const defaut = { aide: 'aucune', forme: SILHOUETTES[0].id, ligne: true, ligneY: 0.3, opacite: 0.45 };
  try { return { ...defaut, ...JSON.parse(localStorage.getItem(cleReglages(idPlante))) }; } catch { return defaut; }
}
function sauverReglages(idPlante, reglages) {
  try { localStorage.setItem(cleReglages(idPlante), JSON.stringify(reglages)); } catch { /* pas grave */ }
}

// idPlante : pour retenir les reglages ; urlFantome : adresse de la derniere photo (ou null)
export function ouvrirCamera({ idPlante, urlFantome = null }) {
  return new Promise((resolve) => {
    const reglages = lireReglages(idPlante);
    if (reglages.aide === 'fantome' && !urlFantome) reglages.aide = 'aucune';

    const racine = document.createElement('div');
    racine.className = 'camera';
    racine.id = 'camera';
    racine.setAttribute('role', 'dialog');
    racine.setAttribute('aria-modal', 'true');
    racine.setAttribute('aria-label', 'Appareil photo');
    racine.innerHTML = `
      <header class="recadrage__haut">
        <button class="recadrage__lien" type="button" data-act="fermer">Fermer</button>
        <span class="recadrage__compteur">Appareil photo</span>
        <span class="camera__espace"></span>
      </header>
      <div class="camera__scene">
        <div class="camera__cadre" id="camera-cadre">
          <video playsinline muted autoplay></video>
          <img class="camera__fantome" alt="" hidden>
          <div class="camera__silhouette" hidden></div>
          <div class="camera__ligne" id="camera-ligne" hidden><span class="camera__poignee"></span></div>
          <p class="camera__etat" id="camera-etat">Ouverture de l'appareil photo…</p>
        </div>
      </div>
      <div class="camera__bas">
        <div class="recadrage__formats camera__aides" role="group" aria-label="Repère">
          ${AIDES.filter((a) => a.id !== 'fantome' || urlFantome).map((a) => `<button class="recadrage__format" type="button" data-aide="${a.id}" aria-pressed="false">${a.libelle}</button>`).join('')}
          <button class="recadrage__format" type="button" data-ligne aria-pressed="false">Ligne</button>
        </div>
        <div class="camera__formes" id="camera-formes" hidden>
          ${SILHOUETTES.map((s) => `<button class="recadrage__format recadrage__format--petit" type="button" data-forme="${s.id}" aria-pressed="false">${echapper(s.nom)}</button>`).join('')}
        </div>
        <label class="camera__opacite" id="camera-opacite" hidden>
          <span>Transparence</span>
          <input type="range" min="10" max="85" step="1" aria-label="Transparence du repère">
        </label>
        <button class="camera__declencheur" type="button" id="camera-declencheur" aria-label="Prendre la photo" disabled><span></span></button>
      </div>`;

    const surDefilement = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.appendChild(racine);

    const video = racine.querySelector('video');
    const cadre = racine.querySelector('#camera-cadre');
    const fantome = racine.querySelector('.camera__fantome');
    const silhouette = racine.querySelector('.camera__silhouette');
    const ligne = racine.querySelector('#camera-ligne');
    const etat = racine.querySelector('#camera-etat');
    const declencheur = racine.querySelector('#camera-declencheur');
    const curseur = racine.querySelector('#camera-opacite input');
    let flux = null;

    function terminer(fichier) {
      flux?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      document.body.style.overflow = surDefilement;
      racine.remove();
      resolve(fichier);
    }

    // ----- Affichage des reperes -----
    function appliquer() {
      racine.querySelectorAll('[data-aide]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.aide === reglages.aide)));
      racine.querySelectorAll('[data-forme]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.forme === reglages.forme)));
      racine.querySelector('[data-ligne]').setAttribute('aria-pressed', String(reglages.ligne));
      racine.querySelector('#camera-formes').hidden = reglages.aide !== 'silhouette';
      racine.querySelector('#camera-opacite').hidden = reglages.aide === 'aucune';
      curseur.value = String(Math.round(reglages.opacite * 100));

      fantome.hidden = reglages.aide !== 'fantome';
      if (!fantome.hidden && !fantome.getAttribute('src')) fantome.src = urlFantome;
      silhouette.hidden = reglages.aide !== 'silhouette';
      if (!silhouette.hidden) silhouette.innerHTML = silhouetteHtml(reglages.forme);
      fantome.style.opacity = String(reglages.opacite);
      silhouette.style.opacity = String(Math.min(1, reglages.opacite + 0.25));
      ligne.hidden = !reglages.ligne;
      ligne.style.top = `${reglages.ligneY * 100}%`;
      sauverReglages(idPlante, reglages);
    }

    racine.addEventListener('click', (e) => {
      const bouton = e.target.closest('button');
      if (!bouton) return;
      if (bouton.dataset.act === 'fermer') terminer(null);
      else if (bouton.dataset.aide) { reglages.aide = bouton.dataset.aide; appliquer(); }
      else if (bouton.dataset.forme) { reglages.forme = bouton.dataset.forme; appliquer(); }
      else if (bouton.hasAttribute('data-ligne')) { reglages.ligne = !reglages.ligne; appliquer(); }
      else if (bouton.id === 'camera-declencheur') prendre();
    });
    curseur.addEventListener('input', () => { reglages.opacite = Number(curseur.value) / 100; appliquer(); });

    // ----- La ligne se deplace verticalement au doigt -----
    let glisse = false;
    ligne.addEventListener('pointerdown', (e) => { glisse = true; ligne.setPointerCapture(e.pointerId); e.preventDefault(); });
    ligne.addEventListener('pointermove', (e) => {
      if (!glisse) return;
      const zone = cadre.getBoundingClientRect();
      reglages.ligneY = Math.min(0.97, Math.max(0.03, (e.clientY - zone.top) / zone.height));
      ligne.style.top = `${reglages.ligneY * 100}%`;
    });
    const finGlisse = () => { if (glisse) { glisse = false; appliquer(); } };
    ligne.addEventListener('pointerup', finGlisse);
    ligne.addEventListener('pointercancel', finGlisse);

    // ----- Prise de la photo : recadrage centre au format du cadre, sans les reperes -----
    function prendre() {
      const largeur = video.videoWidth;
      const hauteur = video.videoHeight;
      if (!largeur || !hauteur) return;
      const ratio = cadre.clientWidth / cadre.clientHeight;
      let sw = largeur;
      let sh = largeur / ratio;
      if (sh > hauteur) { sh = hauteur; sw = hauteur * ratio; }
      const sx = (largeur - sw) / 2;
      const sy = (hauteur - sh) / 2;
      const reduction = Math.min(1, COTE_MAX / Math.max(sw, sh));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(sw * reduction);
      canvas.height = Math.round(sh * reduction);
      canvas.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        canvas.width = 0;
        canvas.height = 0;
        if (blob) terminer(new File([blob], 'photo.jpg', { type: 'image/jpeg', lastModified: Date.now() }));
        else etat.textContent = 'La photo a échoué, réessaie.';
      }, 'image/jpeg', 0.92);
    }

    // ----- Demarrage de la camera -----
    async function demarrer() {
      if (!navigator.mediaDevices?.getUserMedia) {
        etat.textContent = "L'appareil photo n'est pas disponible ici. Utilise l'ajout de photo habituel.";
        return;
      }
      try {
        flux = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } }, audio: false,
        });
      } catch (erreur) {
        etat.textContent = erreur?.name === 'NotAllowedError'
          ? "L'accès à l'appareil photo est refusé. Autorise-le dans Réglages > Safari, puis réessaie."
          : "Impossible d'ouvrir l'appareil photo. Utilise l'ajout de photo habituel.";
        return;
      }
      video.srcObject = flux;
      await video.play().catch(() => {});
      const regler = () => {
        // Cadre au format de la photo : portrait 3:4, ou paysage 4:3 si l'image arrive a l'horizontale
        cadre.style.setProperty('--ratio', video.videoWidth >= video.videoHeight ? String(4 / 3) : '0.75');
        etat.hidden = true;
        declencheur.disabled = false;
      };
      if (video.videoWidth) regler();
      else video.addEventListener('loadedmetadata', regler, { once: true });
    }

    appliquer();
    demarrer();
  });
}
