// Scanner de QR codes integre : ouvre l'appareil photo, lit l'etiquette d'un pot et ouvre la fiche de la plante.
// Evite de passer par Safari (qui n'a pas la connexion de l'appli installee). Lecture avec jsQR (charge a l'ouverture).
import { lireEtat, arroserPlante, marquerFait, ajouterNote, expliquerErreur, photoCouverture } from './donnees.js';
import { codeVersId } from './etiquette.js';
import { message } from './dialogues.js';
import { etatArrosage, libelleEcheance } from './rappels.js';
import { chargerUrls, urlEnCache, cheminVignette } from './photos.js';
import { echapper } from './outils.js';

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
    <p class="scanner__aide" id="scanner-aide">Place le QR code de l'étiquette dans le cadre.</p>
    <section class="scanner__feuille" id="scanner-feuille" aria-live="polite" hidden></section>`;

  const surDefilement = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.body.appendChild(racine);

  const video = racine.querySelector('video');
  const etat = racine.querySelector('#scanner-etat');
  const aide = racine.querySelector('#scanner-aide');
  let flux = null;
  let ferme = false;
  let minuteur = null;
  let enPause = false; // vrai tant que la feuille d'actions d'une plante est affichee
  let dernierInconnu = '';
  const feuille = racine.querySelector('#scanner-feuille');

  function terminer() {
    ferme = true;
    clearTimeout(minuteur);
    flux?.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
    document.body.style.overflow = surDefilement;
    racine.remove();
  }
  racine.addEventListener('click', (e) => { if (e.target.closest('[data-act="fermer"]')) terminer(); });

  // ---- Feuille d'actions rapides : arrosage, engrais, note, sans quitter le scanner ----
  const planteActuelle = (id) => lireEtat().plantes.find((p) => p.id === id);
  function afficherFeuille(idPlante, { noteOuverte = false } = {}) {
    const plante = planteActuelle(idPlante);
    if (!plante) return;
    const { arrosages } = lireEtat();
    const arrosage = etatArrosage(plante, arrosages);
    const fait = arrosage.statut === 'fait';
    const echeance = libelleEcheance(arrosage);
    const couverture = photoCouverture(plante);
    const chemin = couverture ? cheminVignette(couverture.chemin) : null;
    const url = chemin ? urlEnCache(chemin) : null;
    feuille.hidden = false;
    aide.hidden = true;
    feuille.dataset.plante = idPlante;
    feuille.innerHTML = `
      <div class="scanner__entete">
        <span class="scanner__photo" data-photo="${chemin ? echapper(chemin) : ''}">${url ? `<img src="${echapper(url)}" alt="">` : '🌿'}</span>
        <div class="scanner__identite">
          <strong>${echapper(plante.nom)}</strong>
          <span>${fait ? "Arrosée aujourd'hui ✓" : echeance ? `Arrosage : ${echapper(echeance.toLowerCase())}` : echapper(plante.espece || '')}</span>
        </div>
      </div>
      ${noteOuverte ? `
        <textarea class="scanner__note" id="scanner-note" rows="3" maxlength="500" placeholder="Une note pour ${echapper(plante.nom)}…" aria-label="Note"></textarea>
        <div class="scanner__rang">
          <button class="btn btn--douce" type="button" data-sc="note-annuler">Annuler</button>
          <button class="btn btn--primaire" type="button" data-sc="note-ok">Enregistrer</button>
        </div>` : `
        <button class="btn ${fait ? 'btn--douce' : 'btn--primaire'} scanner__gros" type="button" data-sc="arroser"${fait ? ' disabled' : ''}>${fait ? '💧 Arrosée ✓' : '💧 Arrosée'}</button>
        <div class="scanner__rang">
          <button class="btn btn--douce scanner__gros" type="button" data-sc="engrais">🌿 Engrais fait</button>
          <button class="btn btn--douce scanner__gros" type="button" data-sc="note">📝 Note</button>
        </div>
        <div class="scanner__rang">
          <button class="btn-texte" type="button" data-sc="fiche">Voir la fiche</button>
          <button class="btn-texte" type="button" data-sc="autre">Scanner une autre</button>
        </div>`}`;
    if (chemin && !url) {
      chargerUrls([chemin]).then(() => {
        const u = urlEnCache(chemin);
        const zone = feuille.querySelector('.scanner__photo');
        if (u && zone && !zone.querySelector('img') && feuille.dataset.plante === idPlante) zone.innerHTML = `<img src="${echapper(u)}" alt="">`;
      });
    }
    if (noteOuverte) feuille.querySelector('#scanner-note')?.focus();
  }

  racine.__afficherFeuille = (id) => { enPause = true; afficherFeuille(id); }; // utilise par les tests

  feuille.addEventListener('click', async (e) => {
    const bouton = e.target.closest('[data-sc]');
    if (!bouton || bouton.disabled) return;
    const idPlante = feuille.dataset.plante;
    const act = bouton.dataset.sc;
    try {
      if (act === 'arroser') {
        bouton.disabled = true;
        await arroserPlante(idPlante);
        message('Arrosage noté');
        afficherFeuille(idPlante);
      } else if (act === 'engrais') {
        bouton.disabled = true;
        await marquerFait(idPlante, 'dernier_engrais');
        message('Engrais noté');
        bouton.textContent = '🌿 Engrais ✓';
      } else if (act === 'note') {
        afficherFeuille(idPlante, { noteOuverte: true });
      } else if (act === 'note-annuler') {
        afficherFeuille(idPlante);
      } else if (act === 'note-ok') {
        const texte = feuille.querySelector('#scanner-note').value.trim();
        if (!texte) { feuille.querySelector('#scanner-note').focus(); return; }
        bouton.disabled = true;
        await ajouterNote(idPlante, texte);
        message('Note ajoutée');
        afficherFeuille(idPlante);
      } else if (act === 'fiche') {
        terminer();
        location.hash = `#/plantes/${idPlante}`;
      } else if (act === 'autre') {
        feuille.hidden = true;
        feuille.innerHTML = '';
        aide.hidden = false;
        aide.textContent = "Place le QR code de l'étiquette dans le cadre.";
        dernierInconnu = '';
        enPause = false;
      }
    } catch (erreur) {
      message(expliquerErreur(erreur), 'erreur');
      if (bouton.isConnected) bouton.disabled = false;
    }
  });

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
    const lire = () => {
      if (ferme) return;
      if (video.videoWidth && !enPause) {
        const echelle = Math.min(1, LARGEUR_ANALYSE / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * echelle);
        canvas.height = Math.round(video.videoHeight * echelle);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const trouve = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
        if (trouve?.data) {
          const plante = planteDepuisTexte(trouve.data);
          if (plante) {
            enPause = true;
            navigator.vibrate?.(40);
            afficherFeuille(plante.id);
            minuteur = setTimeout(lire, PAUSE_MS);
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
