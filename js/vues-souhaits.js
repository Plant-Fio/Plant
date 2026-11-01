// Liste de souhaits : les plantes qu'on aimerait avoir, avec une photo d'inspiration.
// Ecrans : liste, fiche d'un souhait ("Je l'ai !", modifier, supprimer), formulaire.
import {
  lireEtat, trouverSouhait, creerSouhait, modifierSouhait, supprimerSouhait, realiserSouhait, expliquerErreur,
} from './donnees.js';
import { chargerUrls, urlEnCache, cheminVignette } from './photos.js';
import { remplirPhotos } from './vues-plantes.js';
import { echapper, icone } from './outils.js';
import { confirmer, message } from './dialogues.js';

const imageHtml = (url, texte = '') => `<img src="${echapper(url)}" alt="${echapper(texte)}" decoding="async">`;

function introuvable(conteneur) {
  conteneur.innerHTML = `
    <a class="retour" href="#/souhaits">${icone('retour')} Souhaits</a>
    <section class="carte vide">
      <div class="vide__bulle">${icone('coeur')}</div>
      <h2 class="vide__titre">Souhait introuvable</h2>
      <p class="vide__texte">Il a peut-être été supprimé.</p>
    </section>`;
}

const trouve = (id) => (/^[0-9a-f-]{20,40}$/i.test(id || '') ? trouverSouhait(id) : null);

// ---------- Liste ----------

export function vueSouhaits(conteneur) {
  const { souhaits, horsLigne } = lireEtat();
  conteneur.innerHTML = `
    <p class="vue__legende">Mes envies</p>
    <h1 class="vue__titre">Liste de souhaits</h1>
    ${horsLigne ? '<p class="bandeau">Hors ligne : tu consultes la dernière version enregistrée.</p>' : ''}
    ${souhaits.length ? `
      <div class="grille" data-liste-souhaits>${souhaits.map((s) => {
    const chemin = s.photo_chemin ? cheminVignette(s.photo_chemin) : null;
    const url = chemin && urlEnCache(chemin);
    return `
        <a class="vignette" href="#/souhaits/${s.id}">
          <span class="vignette__photo"${chemin ? ` data-photo="${echapper(chemin)}"` : ''}>${url ? imageHtml(url) : icone('coeur')}</span>
          <span class="vignette__nom">${echapper(s.nom)}</span>
          ${s.espece ? `<span class="vignette__espece">${echapper(s.espece)}</span>` : ''}
        </a>`;
  }).join('')}</div>`
    : `<section class="carte vide">
        <div class="vide__bulle">${icone('coeur')}</div>
        <h2 class="vide__titre">Ta liste est vide</h2>
        <p class="vide__texte">Note ici les plantes dont tu rêves, avec une photo pour t'inspirer.</p>
        <a class="btn btn--primaire" href="#/souhaits/nouveau">Ajouter un souhait</a>
      </section>`}
    <a class="fab" href="#/souhaits/nouveau" aria-label="Ajouter un souhait">${icone('plus')}</a>`;
  remplirPhotos(conteneur);
}

// ---------- Fiche d'un souhait ----------

export function vueSouhait(conteneur, id) {
  const souhait = trouve(id);
  if (!souhait) return introuvable(conteneur);
  const url = souhait.photo_chemin && (urlEnCache(souhait.photo_chemin) || urlEnCache(cheminVignette(souhait.photo_chemin)));

  conteneur.innerHTML = `
    <a class="retour" href="#/souhaits">${icone('retour')} Souhaits</a>
    <div class="fiche__photo" id="photo-souhait"${souhait.photo_chemin ? ` data-photo="${echapper(souhait.photo_chemin)}"` : ''}>
      ${url ? imageHtml(url, souhait.nom) : icone('coeur')}
    </div>
    <h1 class="fiche__nom">${echapper(souhait.nom)}</h1>
    ${souhait.espece ? `<p class="fiche__espece">${echapper(souhait.espece)}</p>` : '<div class="fiche__espace"></div>'}
    ${souhait.note ? `
      <section class="carte">
        <h2 class="carte__titre">Note</h2>
        <p class="notes">${echapper(souhait.note)}</p>
      </section>` : ''}
    <button class="btn btn--primaire btn--espace" id="je-lai" type="button">Je l'ai !</button>
    <a class="btn btn--douce btn--espace" href="#/souhaits/${souhait.id}/modifier">Modifier</a>`;

  // La grande photo arrive juste apres (adresse temporaire)
  if (souhait.photo_chemin && !url) {
    chargerUrls([souhait.photo_chemin, cheminVignette(souhait.photo_chemin)]).then(() => {
      const zone = conteneur.querySelector('#photo-souhait');
      const adresse = urlEnCache(souhait.photo_chemin) || urlEnCache(cheminVignette(souhait.photo_chemin));
      if (zone?.isConnected && adresse) zone.innerHTML = imageHtml(adresse, souhait.nom);
    });
  }

  const bouton = conteneur.querySelector('#je-lai');
  bouton.addEventListener('click', async () => {
    const accord = await confirmer({
      titre: 'Tu as cette plante ?',
      texte: `« ${souhait.nom} » sera ajoutée à tes plantes et retirée de ta liste de souhaits.`,
      action: "Je l'ai !",
    });
    if (!accord) return;
    bouton.disabled = true;
    try {
      const plante = await realiserSouhait(souhait.id);
      message('Ajoutée à tes plantes');
      location.hash = `#/plantes/${plante.id}`;
    } catch (erreur) {
      message(expliquerErreur(erreur), 'erreur');
      bouton.disabled = false;
    }
  });
}

// ---------- Formulaire (id = null : nouveau souhait) ----------

export function vueFormulaireSouhait(conteneur, id) {
  const souhait = id ? trouve(id) : null;
  if (id && !souhait) return introuvable(conteneur);

  let fichier = null; // nouvelle photo choisie
  let retirer = false; // photo actuelle a enlever
  let apercu = null; // adresse temporaire de la nouvelle photo

  conteneur.innerHTML = `
    <a class="retour" href="${souhait ? `#/souhaits/${souhait.id}` : '#/souhaits'}">
      ${icone('retour')} ${souhait ? 'Annuler' : 'Souhaits'}</a>
    <h1 class="vue__titre">${souhait ? 'Modifier le souhait' : 'Nouveau souhait'}</h1>
    <form id="form-souhait" novalidate>
      <div id="zone-photo"></div>
      <label class="champ">
        <span class="champ__label">Nom *</span>
        <input class="champ__input" name="nom" type="text" maxlength="100" required
               placeholder="Ex. Monstera variegata" autocomplete="off" value="${echapper(souhait?.nom)}">
      </label>
      <label class="champ">
        <span class="champ__label">Espèce</span>
        <input class="champ__input" name="espece" type="text" maxlength="100"
               placeholder="Ex. Monstera deliciosa" autocomplete="off" value="${echapper(souhait?.espece)}">
      </label>
      <label class="champ">
        <span class="champ__label">Note</span>
        <textarea class="champ__input champ__zone" name="note" rows="4" maxlength="2000"
                  placeholder="Où la trouver, prix, lien…">${echapper(souhait?.note)}</textarea>
      </label>
      <p class="erreur-form" id="form-erreur" role="alert" hidden></p>
      <button class="btn btn--primaire" id="form-ok" type="submit">Enregistrer</button>
      ${souhait ? '<button class="btn btn--danger btn--espace" id="supprimer" type="button">Supprimer le souhait</button>' : ''}
    </form>`;

  const formulaire = conteneur.querySelector('#form-souhait');
  const zonePhoto = conteneur.querySelector('#zone-photo');
  const zoneErreur = conteneur.querySelector('#form-erreur');
  const bouton = conteneur.querySelector('#form-ok');

  // Zone photo : le champ fichier recouvre toute la zone (plus fiable sur iPhone)
  function dessinerPhoto() {
    const chemin = souhait?.photo_chemin;
    const actuelle = !retirer && !fichier && chemin
      ? (urlEnCache(chemin) || urlEnCache(cheminVignette(chemin))) : null;
    const url = apercu || actuelle;
    const aUnePhoto = !!apercu || (!retirer && !!chemin);
    zonePhoto.innerHTML = `
      <label class="fiche__photo${url ? '' : ' fiche__photo--vide'}" id="apercu">
        ${url ? imageHtml(url, 'Photo d\'inspiration') : `${icone('coeur')}<span>${aUnePhoto ? 'Photo en cours de chargement…' : "Ajouter une photo d'inspiration"}</span>`}
        <input class="fichier" type="file" accept="image/*" aria-label="Choisir une photo d'inspiration">
      </label>
      ${aUnePhoto ? '<button class="btn-texte btn-texte--danger" type="button" id="retirer-photo">Retirer la photo</button>' : ''}`;
  }

  zonePhoto.addEventListener('change', (evenement) => {
    if (!evenement.target.matches('input.fichier')) return;
    const choisi = evenement.target.files[0];
    if (!choisi) return;
    fichier = choisi;
    retirer = false;
    if (apercu) URL.revokeObjectURL(apercu);
    apercu = URL.createObjectURL(choisi);
    dessinerPhoto();
  });
  zonePhoto.addEventListener('click', (evenement) => {
    if (!evenement.target.closest('#retirer-photo')) return;
    fichier = null;
    retirer = true;
    if (apercu) URL.revokeObjectURL(apercu);
    apercu = null;
    dessinerPhoto();
  });

  dessinerPhoto();
  if (souhait?.photo_chemin) {
    chargerUrls([souhait.photo_chemin, cheminVignette(souhait.photo_chemin)]).then(() => {
      if (zonePhoto.isConnected && !fichier) dessinerPhoto();
    });
  }

  formulaire.addEventListener('submit', async (evenement) => {
    evenement.preventDefault();
    zoneErreur.hidden = true;
    const champs = Object.fromEntries(new FormData(formulaire));
    if (!String(champs.nom || '').trim()) {
      zoneErreur.textContent = 'Donne un nom à ce souhait.';
      zoneErreur.hidden = false;
      formulaire.elements.nom.focus();
      return;
    }
    bouton.disabled = true;
    bouton.textContent = 'Enregistrement…';
    try {
      const enregistre = souhait
        ? await modifierSouhait(souhait.id, champs, { fichier, retirer })
        : await creerSouhait(champs, fichier);
      message(souhait ? 'Modifications enregistrées' : 'Souhait ajouté');
      location.hash = `#/souhaits/${enregistre.id}`;
    } catch (erreur) {
      zoneErreur.textContent = expliquerErreur(erreur);
      zoneErreur.hidden = false;
      bouton.disabled = false;
      bouton.textContent = 'Enregistrer';
    }
  });

  conteneur.querySelector('#supprimer')?.addEventListener('click', async () => {
    const accord = await confirmer({
      titre: 'Supprimer ce souhait ?',
      texte: `« ${souhait.nom} » sera supprimé définitivement, avec sa photo.`,
      action: 'Supprimer',
      danger: true,
    });
    if (!accord) return;
    try {
      await supprimerSouhait(souhait.id);
      message('Souhait supprimé');
      location.hash = '#/souhaits';
    } catch (erreur) {
      message(expliquerErreur(erreur), 'erreur');
    }
  });
}
