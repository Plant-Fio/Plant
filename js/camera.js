// Appareil photo de l'appli, pour suivre l'evolution d'une plante : la derniere photo de la plante
// s'affiche en transparence (« fantome ») pour cadrer la nouvelle photo de la meme facon.
// Le fantome n'est JAMAIS sur la photo enregistree. Reglage de transparence retenu par plante sur l'appareil.
// Renvoie le fichier photo (JPEG), ou null si on ferme. Format fixe : 3:4 (4:3 si l'iPhone est a l'horizontale).

const COTE_MAX = 3200;
const cleReglages = (idPlante) => `repere-${idPlante}`;
function lireReglages(idPlante) {
  const defaut = { visible: true, opacite: 0.45 };
  try { return { ...defaut, ...JSON.parse(localStorage.getItem(cleReglages(idPlante))) }; } catch { return defaut; }
}
function sauverReglages(idPlante, reglages) {
  try { localStorage.setItem(cleReglages(idPlante), JSON.stringify(reglages)); } catch { /* pas grave */ }
}

// idPlante : pour retenir les reglages ; urlFantome : adresse de la derniere photo (ou null)
export function ouvrirCamera({ idPlante, urlFantome = null }) {
  return new Promise((resolve) => {
    const reglages = lireReglages(idPlante);

    const racine = document.createElement('div');
    racine.className = 'camera';
    racine.id = 'camera';
    racine.setAttribute('role', 'dialog');
    racine.setAttribute('aria-modal', 'true');
    racine.setAttribute('aria-label', 'Appareil photo');
    racine.innerHTML = `
      <header class="recadrage__haut">
        <button class="recadrage__lien" type="button" data-act="fermer">Fermer</button>
        <span class="recadrage__compteur">Photo d'évolution</span>
        <span class="camera__espace"></span>
      </header>
      <div class="camera__scene">
        <div class="camera__cadre" id="camera-cadre">
          <video playsinline muted autoplay></video>
          <img class="camera__fantome" alt="" hidden>
          <p class="camera__etat" id="camera-etat">Ouverture de l'appareil photo…</p>
        </div>
      </div>
      <div class="camera__bas">
        ${urlFantome ? `
        <div class="recadrage__formats camera__aides">
          <button class="recadrage__format" type="button" data-fantome aria-pressed="true">Dernière photo</button>
        </div>
        <label class="camera__opacite" id="camera-opacite">
          <span>Transparence</span>
          <input type="range" min="10" max="85" step="1" aria-label="Transparence de la dernière photo">
        </label>` : ''}
        <button class="camera__declencheur" type="button" id="camera-declencheur" aria-label="Prendre la photo" disabled><span></span></button>
      </div>`;

    const surDefilement = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.appendChild(racine);

    const video = racine.querySelector('video');
    const cadre = racine.querySelector('#camera-cadre');
    const fantome = racine.querySelector('.camera__fantome');
    const etat = racine.querySelector('#camera-etat');
    const declencheur = racine.querySelector('#camera-declencheur');
    const curseur = racine.querySelector('#camera-opacite input');
    const boutonFantome = racine.querySelector('[data-fantome]');
    let flux = null;

    function terminer(fichier) {
      flux?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      document.body.style.overflow = surDefilement;
      racine.remove();
      resolve(fichier);
    }

    // ----- Affichage de la derniere photo en transparence -----
    function appliquer() {
      if (urlFantome) {
        boutonFantome.setAttribute('aria-pressed', String(reglages.visible));
        curseur.value = String(Math.round(reglages.opacite * 100));
        curseur.disabled = !reglages.visible;
        fantome.hidden = !reglages.visible;
        if (reglages.visible && !fantome.getAttribute('src')) fantome.src = urlFantome;
        fantome.style.opacity = String(reglages.opacite);
      }
      sauverReglages(idPlante, reglages);
    }

    racine.addEventListener('click', (e) => {
      const bouton = e.target.closest('button');
      if (!bouton) return;
      if (bouton.dataset.act === 'fermer') terminer(null);
      else if (bouton.hasAttribute('data-fantome')) { reglages.visible = !reglages.visible; appliquer(); }
      else if (bouton.id === 'camera-declencheur') prendre();
    });
    curseur?.addEventListener('input', () => { reglages.opacite = Number(curseur.value) / 100; appliquer(); });

    // ----- Prise de la photo : recadrage centre au format du cadre, sans la derniere photo en transparence -----
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
