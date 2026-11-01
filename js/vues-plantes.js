// Ecrans des plantes : liste (recherche + filtre par piece), fiche, formulaire (ajout / modification).
import {
  lireEtat, trouverPlante, nomPiece, creerPlante, modifierPlante, supprimerPlante, expliquerErreur,
  photosDe, photoCouverture, ajouterPhoto, supprimerPhoto, definirCouverture,
  arrosagesDe, arroserPlante, annulerArrosage, marquerFait,
} from './donnees.js';
import { etatArrosage, libelleEcheance } from './rappels.js';
import { chargerUrls, urlEnCache, cheminVignette } from './photos.js';
import { echapper, icone, formaterDate, normaliser, dateRelative, dateIsoLocale } from './outils.js';
import { confirmer, message } from './dialogues.js';
import { recadrer } from './recadrage.js';

// Ce que la liste garde en memoire quand on va voir une fiche puis qu'on revient
let recherche = '';
let filtrePiece = 'toutes'; // 'toutes' | 'aucune' | identifiant d'une piece

function carteVide(titre, texte, bouton = '') {
  return `
    <section class="carte vide">
      <div class="vide__bulle">${icone('feuille')}</div>
      <h2 class="vide__titre">${titre}</h2>
      <p class="vide__texte">${texte}</p>
      ${bouton}
    </section>`;
}

function introuvable(conteneur) {
  conteneur.innerHTML = `
    <a class="retour" href="#/plantes">${icone('retour')} Mes plantes</a>
    ${carteVide('Plante introuvable', "Elle a peut-être été supprimée.")}`;
}

// ---------- Photos : petits outils ----------

const imageHtml = (url, texte = '') => `<img src="${echapper(url)}" alt="${echapper(texte)}" decoding="async">`;

// Vignette de la liste : la photo de couverture si l'adresse est deja connue, sinon une feuille
// (les adresses arrivent juste apres, voir remplirPhotos).
export function photoVignetteHtml(plante, classe = 'vignette__photo') {
  const couverture = photoCouverture(plante);
  if (!couverture) return `<span class="${classe}">${icone('feuille')}</span>`;
  const chemin = cheminVignette(couverture.chemin);
  const url = urlEnCache(chemin);
  return `<span class="${classe}" data-photo="${echapper(chemin)}">${url ? imageHtml(url) : icone('feuille')}</span>`;
}

export async function remplirPhotos(zone) {
  const vides = [...zone.querySelectorAll('[data-photo]')].filter((s) => !s.querySelector('img'));
  if (!vides.length) return;
  await chargerUrls(vides.map((s) => s.dataset.photo));
  for (const span of vides) {
    const url = urlEnCache(span.dataset.photo);
    if (url && span.isConnected && !span.querySelector('img')) span.innerHTML = imageHtml(url);
  }
}

// ---------- Liste ----------

export function vueListe(conteneur) {
  const { plantes, pieces, horsLigne } = lireEtat();

  conteneur.innerHTML = `
    <p class="vue__legende">Ma collection</p>
    <h1 class="vue__titre">Mes plantes</h1>
    ${horsLigne ? `<p class="bandeau">Hors ligne : tu consultes la dernière version enregistrée.</p>` : ''}
    ${plantes.length ? `
      <div class="recherche">
        ${icone('recherche')}
        <input type="search" id="recherche" placeholder="Rechercher une plante" autocomplete="off"
               enterkeyhint="search" aria-label="Rechercher une plante" value="${echapper(recherche)}">
      </div>
      <div class="puces" id="puces"></div>
      <div id="resultats"></div>`
    : carteVide('Ta collection est vide', 'Ajoute ta première plante pour commencer.',
      '<a class="btn btn--primaire" href="#/plantes/nouvelle">Ajouter une plante</a>')}
    <a class="fab" href="#/plantes/nouvelle" aria-label="Ajouter une plante">${icone('plus')}</a>`;

  if (!plantes.length) return;

  const zonePuces = conteneur.querySelector('#puces');
  const zoneResultats = conteneur.querySelector('#resultats');

  function dessinerPuces() {
    const sansPiece = plantes.filter((p) => !p.piece_id).length;
    const puces = [{ id: 'toutes', libelle: 'Toutes', nombre: plantes.length }];
    for (const piece of pieces) {
      const nombre = plantes.filter((p) => p.piece_id === piece.id).length;
      if (nombre) puces.push({ id: piece.id, libelle: piece.nom, nombre });
    }
    if (sansPiece) puces.push({ id: 'aucune', libelle: 'Sans pièce', nombre: sansPiece });
    // Si la piece filtree n'existe plus (ou n'a plus de plantes), on revient a "Toutes"
    if (!puces.some((p) => p.id === filtrePiece)) filtrePiece = 'toutes';
    zonePuces.innerHTML = puces.map((p) => `
      <button type="button" class="puce" data-piece="${echapper(p.id)}"
              aria-pressed="${p.id === filtrePiece}">${echapper(p.libelle)} <span class="puce__nombre">${p.nombre}</span></button>`
    ).join('');
  }

  function dessinerResultats() {
    const mots = normaliser(recherche).split(/\s+/).filter(Boolean);
    const trouvees = plantes.filter((p) => {
      if (filtrePiece === 'aucune' && p.piece_id) return false;
      if (filtrePiece !== 'toutes' && filtrePiece !== 'aucune' && p.piece_id !== filtrePiece) return false;
      const texte = normaliser(`${p.nom} ${p.espece || ''} ${nomPiece(p.piece_id)}`);
      return mots.every((mot) => texte.includes(mot));
    });
    zoneResultats.innerHTML = trouvees.length
      ? `<div class="grille">${trouvees.map((p) => `
          <a class="vignette" href="#/plantes/${p.id}">
            ${photoVignetteHtml(p)}
            <span class="vignette__nom">${echapper(p.nom)}</span>
            ${p.espece ? `<span class="vignette__espece">${echapper(p.espece)}</span>` : ''}
            ${p.piece_id ? `<span class="vignette__piece">${echapper(nomPiece(p.piece_id))}</span>` : ''}
          </a>`).join('')}</div>`
      : `<p class="aucun-resultat">Aucune plante ne correspond.</p>`;
    remplirPhotos(zoneResultats);
  }

  dessinerPuces();
  dessinerResultats();

  conteneur.querySelector('#recherche').addEventListener('input', (e) => {
    recherche = e.target.value;
    dessinerResultats();
  });
  zonePuces.addEventListener('click', (e) => {
    const puce = e.target.closest('.puce');
    if (!puce) return;
    filtrePiece = puce.dataset.piece;
    dessinerPuces();
    dessinerResultats();
  });
}

// ---------- Fiche ----------

export function vueFiche(conteneur, id) {
  const plante = trouvee(id);
  if (!plante) return introuvable(conteneur);

  const piece = nomPiece(plante.piece_id);
  const date = formaterDate(plante.date_acquisition);

  conteneur.innerHTML = `
    <a class="retour" href="#/plantes">${icone('retour')} Mes plantes</a>
    <div id="galerie"></div>
    <h1 class="fiche__nom">${echapper(plante.nom)}</h1>
    ${plante.espece ? `<p class="fiche__espece">${echapper(plante.espece)}</p>` : '<div class="fiche__espace"></div>'}
    <section class="carte">
      <div class="ligne">
        <span class="ligne__label">Pièce</span>
        <span class="ligne__valeur">${piece ? echapper(piece) : '—'}</span>
      </div>
      <div class="ligne">
        <span class="ligne__label">Acquise le</span>
        <span class="ligne__valeur" data-date>${date ? echapper(date) : '—'}</span>
      </div>
    </section>
    <section class="carte" id="soins" aria-label="Soins"></section>
    ${plante.notes ? `
      <section class="carte">
        <h2 class="carte__titre">Notes</h2>
        <p class="notes">${echapper(plante.notes)}</p>
      </section>` : ''}
    <a class="btn btn--douce btn--espace" href="#/plantes/${plante.id}/modifier">Modifier</a>`;

  initialiserGalerie(conteneur.querySelector('#galerie'), plante.id);
  initialiserSoins(conteneur.querySelector('#soins'), plante.id);
}

// Soins de la fiche : arrosage (frequence, prochain, historique), engrais, rempotage.
function initialiserSoins(zone, idPlante) {
  function dessiner() {
    const plante = trouverPlante(idPlante);
    if (!plante) return;
    const aujourdhui = dateIsoLocale();
    const arrosages = arrosagesDe(idPlante);
    const etat = etatArrosage(plante, arrosages, aujourdhui);
    const dejaFait = etat.dernier === aujourdhui;
    const ligne = (label, valeur, attribut = '') =>
      `<div class="ligne"><span class="ligne__label">${label}</span><span class="ligne__valeur" ${attribut}>${valeur}</span></div>`;

    zone.innerHTML = `
      <h2 class="carte__titre">Soins</h2>
      ${ligne('Arrosage', plante.arrosage_jours
        ? `Tous les ${plante.arrosage_jours} ${plante.arrosage_jours > 1 ? 'jours' : 'jour'}` : '—', 'data-soin="frequence"')}
      ${plante.arrosage_jours ? ligne('Prochain arrosage', echapper(libelleEcheance(etat) || '—'), 'data-soin="prochain"') : ''}
      ${ligne('Dernier arrosage', etat.dernier ? echapper(dateRelative(etat.dernier, aujourdhui)) : '—', 'data-soin="dernier"')}
      <button class="btn ${dejaFait ? 'btn--douce' : 'btn--primaire'}" type="button" data-action="arroser"${dejaFait ? ' disabled' : ''}>
        ${dejaFait ? "Arrosée aujourd'hui ✓" : "Arrosée aujourd'hui"}</button>
      ${arrosages.length ? `
        <h3 class="soins__sous-titre">Derniers arrosages</h3>
        <ul class="historique" data-historique>
          ${arrosages.slice(0, 8).map((a) => `
            <li class="historique__ligne">
              <span>${echapper(dateRelative(a.jour, aujourdhui))}</span>
              <button class="btn-icone" type="button" data-annuler="${a.id}" aria-label="Supprimer cet arrosage">${icone('corbeille')}</button>
            </li>`).join('')}
        </ul>` : ''}
      <h3 class="soins__sous-titre">Entretien</h3>
      ${ligne('Dernier engrais', plante.dernier_engrais ? echapper(dateRelative(plante.dernier_engrais, aujourdhui)) : '—', 'data-soin="engrais"')}
      ${ligne('Dernier rempotage', plante.dernier_rempotage ? echapper(dateRelative(plante.dernier_rempotage, aujourdhui)) : '—', 'data-soin="rempotage"')}
      <div class="soins__actions">
        <button class="btn-texte" type="button" data-action="engrais">Engrais fait aujourd'hui</button>
        <button class="btn-texte" type="button" data-action="rempotage">Rempotage fait aujourd'hui</button>
      </div>`;
  }

  zone.addEventListener('click', async (evenement) => {
    const bouton = evenement.target.closest('button');
    if (!bouton || bouton.disabled) return;
    try {
      if (bouton.dataset.action === 'arroser') {
        await arroserPlante(idPlante);
        message('Arrosage noté');
      } else if (bouton.dataset.action === 'engrais') {
        await marquerFait(idPlante, 'dernier_engrais');
        message('Engrais noté');
      } else if (bouton.dataset.action === 'rempotage') {
        await marquerFait(idPlante, 'dernier_rempotage');
        message('Rempotage noté');
      } else if (bouton.dataset.annuler) {
        const accord = await confirmer({
          titre: 'Supprimer cet arrosage ?',
          texte: "Il disparaîtra de l'historique et le prochain arrosage sera recalculé.",
          action: 'Supprimer',
          danger: true,
        });
        if (!accord) return;
        await annulerArrosage(bouton.dataset.annuler);
        message('Arrosage supprimé');
      } else {
        return;
      }
      dessiner();
    } catch (erreur) {
      message(expliquerErreur(erreur), 'erreur');
    }
  });

  dessiner();
}

// Galerie de la fiche : grande photo, bande de vignettes, ajout, couverture, suppression.
function initialiserGalerie(galerie, idPlante) {
  let selection = photoCouverture(trouverPlante(idPlante))?.id ?? null; // photo affichee en grand
  let envoi = null; // { courant, total } pendant un envoi
  let recadrageEnCours = false;

  // Le champ qui ouvre l'appareil photo / la phototheque. Il recouvre toute la zone tactile
  // (invisible) : c'est plus fiable sur iPhone qu'un bouton qui "clique" sur un champ cache.
  const champFichier = '<input class="fichier" type="file" accept="image/*" multiple aria-label="Ajouter des photos">';

  function dessiner() {
    const plante = trouverPlante(idPlante);
    if (!plante) return;
    const photos = photosDe(idPlante);
    const actuelle = photos.find((p) => p.id === selection) || photos[0] || null;
    selection = actuelle?.id ?? null;
    const couverture = photoCouverture(plante);
    const urlGrande = actuelle && (urlEnCache(actuelle.chemin) || urlEnCache(cheminVignette(actuelle.chemin)));

    galerie.innerHTML = `
      ${actuelle
        ? `<div class="fiche__photo" id="hero">${urlGrande ? imageHtml(urlGrande, `Photo de ${plante.nom}`) : icone('feuille')}</div>`
        : `<label class="fiche__photo fiche__photo--vide" id="hero">${icone('feuille')}<span>Ajouter une photo</span>${champFichier}</label>`}
      ${envoi ? `<p class="envoi" role="status">Envoi de la photo ${envoi.courant} sur ${envoi.total}…</p>` : ''}
      ${actuelle ? `
        <div class="bande">
          ${photos.map((p, i) => {
            const url = urlEnCache(cheminVignette(p.chemin));
            return `<button class="bande__vignette" type="button" data-photo="${p.id}"
                            aria-pressed="${p.id === actuelle.id}" aria-label="Photo ${i + 1}">${url ? imageHtml(url) : ''}</button>`;
          }).join('')}
          <label class="bande__ajout" aria-label="Ajouter des photos">${icone('plus')}${champFichier}</label>
        </div>
        <div class="actions-photo">
          ${couverture?.id === actuelle.id
            ? '<span class="couverture">Photo de couverture</span>'
            : '<button class="btn-texte" type="button" data-action="couverture">Choisir comme couverture</button>'}
          <button class="btn-texte btn-texte--danger" type="button" data-action="supprimer-photo">Supprimer la photo</button>
        </div>` : ''}`;
  }

  async function televerser(fichiers) {
    if (!fichiers.length || envoi || recadrageEnCours) return;
    recadrageEnCours = true;
    let reussies = 0;
    let derniereErreur = null;
    for (let i = 0; i < fichiers.length; i++) {
      // Recadrage (ou « Garder entiere ») avant l'envoi ; « Annuler » passe a la photo suivante
      const pret = await recadrer(fichiers[i], { position: i + 1, total: fichiers.length });
      if (!pret) continue;
      envoi = { courant: i + 1, total: fichiers.length };
      dessiner();
      try {
        const photo = await ajouterPhoto(idPlante, pret);
        await chargerUrls([photo.chemin, cheminVignette(photo.chemin)]);
        selection = photo.id;
        reussies++;
      } catch (erreur) {
        derniereErreur = erreur;
      }
    }
    envoi = null;
    recadrageEnCours = false;
    dessiner();
    if (reussies) message(reussies > 1 ? `${reussies} photos ajoutées` : 'Photo ajoutée');
    if (derniereErreur) message(expliquerErreur(derniereErreur), 'erreur');
  }

  galerie.addEventListener('change', (evenement) => {
    if (!evenement.target.matches('input.fichier')) return;
    const fichiers = [...evenement.target.files];
    evenement.target.value = ''; // permet de rechoisir la meme photo plus tard
    televerser(fichiers);
  });

  galerie.addEventListener('click', async (evenement) => {
    const vignette = evenement.target.closest('[data-photo]');
    if (vignette) {
      selection = vignette.dataset.photo;
      dessiner();
      return;
    }
    const bouton = evenement.target.closest('[data-action]');
    if (!bouton || !selection) return;
    try {
      if (bouton.dataset.action === 'couverture') {
        await definirCouverture(idPlante, selection);
        message('Couverture modifiée');
        dessiner();
      } else {
        const accord = await confirmer({
          titre: 'Supprimer cette photo ?',
          texte: 'Elle sera supprimée définitivement.',
          action: 'Supprimer',
          danger: true,
        });
        if (!accord) return;
        await supprimerPhoto(selection);
        selection = null;
        message('Photo supprimée');
        dessiner();
      }
    } catch (erreur) {
      message(expliquerErreur(erreur), 'erreur');
    }
  });

  dessiner();
  // Les adresses des photos arrivent ensuite (une seule requete), puis on redessine
  const chemins = photosDe(idPlante).flatMap((p) => [p.chemin, cheminVignette(p.chemin)]);
  if (chemins.length) {
    chargerUrls(chemins).then(() => { if (galerie.isConnected) dessiner(); });
  }
}

// Cherche la plante, ou renvoie null si l'identifiant n'a pas la bonne forme
function trouvee(id) {
  return /^[0-9a-f-]{20,40}$/i.test(id || '') ? trouverPlante(id) : null;
}

// ---------- Formulaire (id = null : nouvelle plante) ----------

export function vueFormulaire(conteneur, id) {
  const plante = id ? trouvee(id) : null;
  if (id && !plante) return introuvable(conteneur);
  const { pieces } = lireEtat();

  conteneur.innerHTML = `
    <a class="retour" href="${plante ? `#/plantes/${plante.id}` : '#/plantes'}">
      ${icone('retour')} ${plante ? 'Annuler' : 'Mes plantes'}</a>
    <h1 class="vue__titre">${plante ? 'Modifier la plante' : 'Nouvelle plante'}</h1>
    <form id="form-plante" novalidate>
      <label class="champ">
        <span class="champ__label">Nom *</span>
        <input class="champ__input" name="nom" type="text" maxlength="100" required
               placeholder="Ex. Monstera du salon" autocomplete="off" value="${echapper(plante?.nom)}">
      </label>
      <label class="champ">
        <span class="champ__label">Espèce</span>
        <input class="champ__input" name="espece" type="text" maxlength="100"
               placeholder="Ex. Monstera deliciosa" autocomplete="off" value="${echapper(plante?.espece)}">
      </label>
      <label class="champ">
        <span class="champ__label">Pièce</span>
        <select class="champ__input champ__select" name="piece_id" id="piece">
          <option value="">Aucune pièce</option>
          ${pieces.map((p) => `<option value="${p.id}"${p.id === plante?.piece_id ? ' selected' : ''}>${echapper(p.nom)}</option>`).join('')}
        </select>
      </label>
      <label class="champ">
        <span class="champ__label">Date d'acquisition</span>
        <input class="champ__input" name="date_acquisition" type="date" value="${echapper(plante?.date_acquisition)}">
      </label>
      <label class="champ">
        <span class="champ__label">Arroser tous les (jours)</span>
        <input class="champ__input" name="arrosage_jours" type="number" inputmode="numeric" min="1" max="365"
               placeholder="Ex. 7 (vide = pas de rappel)" value="${echapper(plante?.arrosage_jours)}">
      </label>
      <label class="champ">
        <span class="champ__label">Dernier engrais</span>
        <input class="champ__input" name="dernier_engrais" type="date" value="${echapper(plante?.dernier_engrais)}">
      </label>
      <label class="champ">
        <span class="champ__label">Dernier rempotage</span>
        <input class="champ__input" name="dernier_rempotage" type="date" value="${echapper(plante?.dernier_rempotage)}">
      </label>
      <label class="champ">
        <span class="champ__label">Notes</span>
        <textarea class="champ__input champ__zone" name="notes" rows="5" maxlength="5000"
                  placeholder="Lumière, arrosage, astuces…">${echapper(plante?.notes)}</textarea>
      </label>
      <p class="erreur-form" id="form-erreur" role="alert" hidden></p>
      <button class="btn btn--primaire" id="form-ok" type="submit">Enregistrer</button>
      ${plante ? '<button class="btn btn--danger btn--espace" id="supprimer" type="button">Supprimer la plante</button>' : ''}
    </form>`;

  const formulaire = conteneur.querySelector('#form-plante');
  const zoneErreur = conteneur.querySelector('#form-erreur');
  const bouton = conteneur.querySelector('#form-ok');

  formulaire.addEventListener('submit', async (evenement) => {
    evenement.preventDefault();
    zoneErreur.hidden = true;
    const champs = Object.fromEntries(new FormData(formulaire));
    if (!String(champs.nom || '').trim()) {
      zoneErreur.textContent = 'Donne un nom à ta plante.';
      zoneErreur.hidden = false;
      formulaire.elements.nom.focus();
      return;
    }
    const frequence = String(champs.arrosage_jours || '').trim();
    if (frequence && !(/^\d+$/.test(frequence) && +frequence >= 1 && +frequence <= 365)) {
      zoneErreur.textContent = "La fréquence d'arrosage doit être un nombre de jours entre 1 et 365.";
      zoneErreur.hidden = false;
      formulaire.elements.arrosage_jours.focus();
      return;
    }
    bouton.disabled = true;
    bouton.textContent = 'Enregistrement…';
    try {
      const enregistree = plante ? await modifierPlante(plante.id, champs) : await creerPlante(champs);
      message(plante ? 'Modifications enregistrées' : 'Plante ajoutée');
      location.hash = `#/plantes/${enregistree.id}`;
    } catch (erreur) {
      zoneErreur.textContent = expliquerErreur(erreur);
      zoneErreur.hidden = false;
      bouton.disabled = false;
      bouton.textContent = 'Enregistrer';
    }
  });

  conteneur.querySelector('#supprimer')?.addEventListener('click', async () => {
    const accord = await confirmer({
      titre: 'Supprimer cette plante ?',
      texte: `« ${plante.nom} » sera supprimée définitivement, avec ses photos et ses notes.`,
      action: 'Supprimer',
      danger: true,
    });
    if (!accord) return;
    try {
      await supprimerPlante(plante.id);
      message('Plante supprimée');
      location.hash = '#/plantes';
    } catch (erreur) {
      message(expliquerErreur(erreur), 'erreur');
    }
  });
}
