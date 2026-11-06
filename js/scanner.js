// Scanner de QR codes integre : ouvre l'appareil photo, lit l'etiquette d'un pot et ouvre la fiche de la plante.
// Evite de passer par Safari (qui n'a pas la connexion de l'appli installee). Lecture avec jsQR (charge a l'ouverture).
import { lireEtat } from './donnees.js';
import { codeVersId } from './etiquette.js';
import { message } from './dialogues.js';

const LARGEUR_ANALYSE = 960; // on reduit l'image de la camera pour que la lecture reste rapide
const PAUSE_MS = 120;

// Texte lu dans un QR -> plante correspondante (ou null si ce n'est pas une etiquette de l'appli)
export function planteDepuisTexte(texte) {
  const code = String(texte || '').match(/#\/q\/([A-Za-z0-9_-]{22})\s*$/)?.[1];
  const id = code && codeVersId(code);
  return (id && lireEtat().plantes.find((p) => p.id === id)) || null;
}

export function ouvrirScanner() {
  const racine = document.createElement('div');
  racine.className = 'camera scanner';
  racine.id = 'scanner';
  racine.setAttribute('role', 'dialog');
  racine.setAttribute('aria-modal', 'true');
  racine.setAttribute('aria-label', 'Scanner une étiquette');
  racine.innerHTML = `
    <header class="recadrage__haut">
      <button class="recadrage__lien" type="button" data-act="fermer">Fermer</button>
      <span class="recadrage__compteur">Scanner une étiquette</span>
      <span class="camera__espace"></span>
    </header>
    <div class="scanner__scene">
      <video playsinline muted autoplay></video>
      <div class="scanner__viseur" aria-hidden="true"></div>
      <p class="camera__etat" id="scanner-etat">Ouverture de l'appareil photo…</p>
    </div>
    <p class="scanner__aide" id="scanner-aide">Place le QR code de l'étiquette dans le cadre.</p>`;

  const surDefilement = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.body.appendChild(racine);

  const video = racine.querySelector('video');
  const etat = racine.querySelector('#scanner-etat');
  const aide = racine.querySelector('#scanner-aide');
  let flux = null;
  let ferme = false;
  let minuteur = null;

  function terminer() {
    ferme = true;
    clearTimeout(minuteur);
    flux?.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
    document.body.style.overflow = surDefilement;
    racine.remove();
  }
  racine.addEventListener('click', (e) => { if (e.target.closest('[data-act="fermer"]')) terminer(); });

  async function demarrer() {
    if (!navigator.mediaDevices?.getUserMedia) {
      etat.textContent = "L'appareil photo n'est pas disponible ici.";
      return;
    }
    try {
      flux = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
      });
    } catch (erreur) {
      etat.textContent = erreur?.name === 'NotAllowedError'
        ? "L'accès à l'appareil photo est refusé. Autorise-le dans Réglages > Safari, puis réessaie."
        : "Impossible d'ouvrir l'appareil photo.";
      return;
    }
    if (ferme) { flux.getTracks().forEach((t) => t.stop()); return; }
    video.srcObject = flux;
    await video.play().catch(() => {});
    etat.hidden = true;
    const { default: jsQR } = await import('../vendor/jsqr.js');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let dernierInconnu = '';

    const lire = () => {
      if (ferme) return;
      if (video.videoWidth) {
        const echelle = Math.min(1, LARGEUR_ANALYSE / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * echelle);
        canvas.height = Math.round(video.videoHeight * echelle);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const trouve = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
        if (trouve?.data) {
          const plante = planteDepuisTexte(trouve.data);
          if (plante) {
            terminer();
            location.hash = `#/plantes/${plante.id}`;
            return;
          }
          if (trouve.data !== dernierInconnu) {
            dernierInconnu = trouve.data;
            aide.textContent = "Ce QR code ne correspond à aucune plante de ta collection.";
          }
        }
      }
      minuteur = setTimeout(lire, PAUSE_MS);
    };
    lire();
  }
  demarrer();
}

// Ouvre la fiche si le texte est une etiquette de l'appli (utilise aussi par les tests)
export function ouvrirFicheDepuisTexte(texte) {
  const plante = planteDepuisTexte(texte);
  if (!plante) { message("Ce QR code ne correspond à aucune plante", 'erreur'); return false; }
  location.hash = `#/plantes/${plante.id}`;
  return true;
}
