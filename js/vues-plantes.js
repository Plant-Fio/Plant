// Ecrans des plantes : liste (recherche + filtre par piece), fiche, formulaire (ajout / modification).
import {
  lireEtat, trouverPlante, nomPiece, teintePiece, pieceLaPlusUtilisee, creerPlante, modifierPlante, supprimerPlante, expliquerErreur,
  photosDe, photosParDate, deplacerPhoto, photoCouverture, ajouterPhoto, supprimerPhoto, definirCouverture,
  arrosagesDe, arroserPlante, definirStatut, annulerArrosage, marquerFait, datePhoto, modifierDatePhoto,
} from './donnees.js';
import { etatArrosage, etatEngrais, libelleEcheance, quarantaine, quarantaineDe, libelleQuarantaine } from './rappels.js';
import { chargerUrls, urlEnCache, cheminVignette } from './photos.js';
import { echapper, icone, formaterDate, normaliser, dateRelative, dateIsoLocale, joursEntre, libelleEcart } from './outils.js';
import { confirmer, demanderDate, message } from './dialogues.js';
import { recadrer } from './recadrage.js';
import { ouvrirCamera } from './camera.js';
import { ouvrirScanner } from './scanner.js';
import { initialiserJournal } from './journal.js';
import { initialiserProblemes } from './problemes.js';
import { initialiserPetits, initialiserCroissance, bandeauPetit, ETAPES } from './petits.js';

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

// Champ date avec une corbeille pour effacer la valeur (le calendrier de l'iPhone n'a pas de vrai bouton « supprimer »)
function champDate(libelle, nom, valeur) {
  return `
      <div class="champ">
        <label class="champ__label" for="champ-${nom}">${libelle}</label>
        <div class="champ__date">
          <input class="champ__input" id="champ-${nom}" name="${nom}" type="date" value="${echapper(valeur)}">
          <button class="btn-icone" type="button" data-vider="${nom}" aria-label="Supprimer la date : ${libelle}"${valeur ? '' : ' hidden'}>${icone('corbeille')}</button>
        </div>
      </div>`;
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
      <div class="recherche-ligne">
        <div class="recherche">
          ${icone('recherche')}
          <input type="search" id="recherche" placeholder="Rechercher une plante" autocomplete="off"
                 enterkeyhint="search" aria-label="Rechercher une plante" value="${echapper(recherche)}">
        </div>
        <button class="recherche__scanner" id="scanner-ouvrir" type="button" aria-label="Scanner une étiquette QR">${icone('qr')}</button>
      </div>
      <div class="puces" id="puces"></div>
      <div id="resultats"></div>`
    : carteVide('Ta collection est vide', 'Ajoute ta première plante pour commencer.',
      '<a class="btn btn--primaire" href="#/plantes/nouvelle">Ajouter une plante</a>')}
    <a class="fab" href="#/plantes/nouvelle" aria-label="Ajouter une plante">${icone('plus')}</a>`;

  if (!plantes.length) return;
  document.getElementById('scanner-ouvrir')?.addEventListener('click', ouvrirScanner);

  const zonePuces = conteneur.querySelector('#puces');
  const zoneResultats = conteneur.querySelector('#resultats');

  function dessinerPuces() {
    const sansPiece = plantes.filter((p) => !p.piece_id).length;
    const enVente = plantes.filter((p) => p.en_vente && !p.vendu_le).length;
    const vendues = plantes.filter((p) => p.vendu_le).length;
    const puces = [{ id: 'toutes', libelle: 'Toutes', nombre: plantes.length - vendues }];
    const enQuarantaine = plantes.filter((p) => quarantaineDe(p)).length;
    if (enQuarantaine) puces.push({ id: 'quarantaine', libelle: 'Quarantaine', nombre: enQuarantaine });
    if (enVente) puces.push({ id: 'vente', libelle: 'En vente', nombre: enVente });
    if (vendues) puces.push({ id: 'vendues', libelle: 'Vendues', nombre: vendues });
    for (const piece of pieces) {
      const nombre = plantes.filter((p) => p.piece_id === piece.id).length;
      if (nombre) puces.push({ id: piece.id, libelle: piece.nom, nombre, teinte: teintePiece(piece.id) });
    }
    if (sansPiece) puces.push({ id: 'aucune', libelle: 'Sans pièce', nombre: sansPiece });
    // Si la piece filtree n'existe plus (ou n'a plus de plantes), on revient a "Toutes"
    if (!puces.some((p) => p.id === filtrePiece)) filtrePiece = 'toutes';
    zonePuces.innerHTML = puces.map((p) => `
      <button type="button" class="puce" data-piece="${echapper(p.id)}"${p.teinte ? ` data-teinte="${p.teinte}"` : ''}
              aria-pressed="${p.id === filtrePiece}">${echapper(p.libelle)} <span class="puce__nombre">${p.nombre}</span></button>`
    ).join('');
  }

  function dessinerResultats() {
    const mots = normaliser(recherche).split(/\s+/).filter(Boolean);
    const trouvees = plantes.filter((p) => {
      if (filtrePiece === 'vendues') { if (!p.vendu_le) return false; }
      else if (p.vendu_le) return false; // les plantes vendues n'apparaissent que dans « Vendues »
      if (filtrePiece === 'quarantaine') { if (!quarantaineDe(p)) return false; }
      else if (filtrePiece === 'vente') { if (!p.en_vente) return false; }
      else if (filtrePiece === 'vendues') { /* deja filtre */ }
      else if (filtrePiece === 'aucune' && p.piece_id) return false;
      else if (filtrePiece !== 'toutes' && filtrePiece !== 'aucune' && p.piece_id !== filtrePiece) return false;
      const texte = normaliser(`${p.nom} ${p.espece || ''} ${nomPiece(p.piece_id)}`);
      return mots.every((mot) => texte.includes(mot));
    });
    const carte = (p) => {
      const quar = quarantaineDe(p);
      return `
          <a class="vignette" href="#/plantes/${p.id}"${p.piece_id ? ` data-teinte="${teintePiece(p.piece_id)}"` : ''}>
            ${photoVignetteHtml(p)}
            ${quar ? `<span class="pastille-quarantaine">${echapper(libelleQuarantaine(quar))}</span>` : ''}
            ${p.vendu_le ? '<span class="pastille-vente pastille-vente--vendu">Vendue</span>' : p.en_vente ? '<span class="pastille-vente">En vente</span>' : ''}
            <span class="vignette__nom">${echapper(p.nom)}</span>
            ${p.espece ? `<span class="vignette__espece">${echapper(p.espece)}</span>` : ''}
            ${p.piece_id ? `<span class="vignette__piece">${echapper(nomPiece(p.piece_id))}</span>` : ''}
          </a>`;
    };
    // Les plantes en quarantaine sont mises a part, en haut, tant qu'on ne filtre pas dessus
    const misesAPart = filtrePiece === 'quarantaine' ? [] : trouvees.filter((p) => quarantaineDe(p));
    const autres = trouvees.filter((p) => !misesAPart.includes(p));
    zoneResultats.innerHTML = trouvees.length
      ? `${misesAPart.length ? `
          <h2 class="section__titre section__titre--haut">En quarantaine <span class="puce__nombre">${misesAPart.length}</span></h2>
          <div class="grille" data-liste="quarantaine">${misesAPart.map(carte).join('')}</div>
          ${autres.length ? '<h2 class="section__titre">Mes plantes</h2>' : ''}` : ''}
        ${autres.length ? `<div class="grille">${autres.map(carte).join('')}</div>` : ''}`
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
  const quar = quarantaineDe(plante);

  conteneur.innerHTML = `
    <a class="retour" href="#/plantes">${icone('retour')} Mes plantes</a>
    <div id="galerie"></div>
    <h1 class="fiche__nom">${echapper(plante.nom)}</h1>
    ${quar ? `<p class="fiche__vente"><span class="pastille-quarantaine pastille-quarantaine--fiche">${echapper(libelleQuarantaine(quar))}</span></p>` : ''}
    <div id="statut"></div>
    ${plante.espece ? `<p class="fiche__espece">${echapper(plante.espece)}</p>` : '<div class="fiche__espace"></div>'}
    ${bandeauPetit(plante)}
    <section class="carte">
      <div class="ligne">
        <span class="ligne__label">Pièce</span>
        <span class="ligne__valeur">${piece ? echapper(piece) : '—'}</span>
      </div>
      <div class="ligne">
        <span class="ligne__label">Acquise le</span>
        <span class="ligne__valeur" data-date>${date ? echapper(date) : '—'}</span>
      </div>
      ${quar ? `<div class="ligne">
        <span class="ligne__label">Quarantaine</span>
        <span class="ligne__valeur" data-quarantaine>jusqu'au ${echapper(formaterDate(quar.fin))}</span>
      </div>` : ''}
    </section>
    <section class="carte" id="soins" aria-label="Soins"></section>
    ${plante.mere_id ? '<section class="carte" id="croissance" aria-label="Croissance"></section>' : ''}
    <section class="carte" id="petits" aria-label="Babies"></section>
    <section class="carte" id="problemes" aria-label="Problèmes"></section>
    <section class="carte" id="journal" aria-label="Journal"></section>
    ${plante.notes ? `
      <section class="carte">
        <h2 class="carte__titre">Notes</h2>
        <p class="notes">${echapper(plante.notes)}</p>
      </section>` : ''}
    <a class="btn btn--douce btn--espace" href="#/plantes/${plante.id}/etiquette">🏷️ Étiquette QR</a>
    <a class="btn btn--douce btn--espace" href="#/plantes/${plante.id}/modifier">Modifier</a>`;

  initialiserStatut(conteneur.querySelector('#statut'), plante.id);
  initialiserGalerie(conteneur.querySelector('#galerie'), plante.id);
  initialiserSoins(conteneur.querySelector('#soins'), plante.id);
  if (plante.mere_id) { initialiserCroissance(conteneur.querySelector('#croissance'), plante.id); remplirPhotos(conteneur); }
  initialiserPetits(conteneur.querySelector('#petits'), plante.id);
  initialiserProblemes(conteneur.querySelector('#problemes'), plante.id);
  initialiserJournal(conteneur.querySelector('#journal'), plante.id);
}

// Statut de la plante sur la fiche : Aucun / En vente / Vendu, en un geste
function initialiserStatut(zone, idPlante) {
  function dessiner() {
    const plante = trouverPlante(idPlante);
    if (!plante) return;
    const actuel = plante.vendu_le ? 'vendu' : plante.en_vente ? 'vente' : 'aucun';
    const choix = [['aucun', 'Aucun'], ['vente', '🏷️ En vente'], ['vendu', '✓ Vendu']];
    zone.innerHTML = `
      <div class="statut statut--fiche" role="group" aria-label="Statut de la plante">
        ${choix.map(([id, libelle]) => `<button class="statut__bouton statut__bouton--${id}" type="button" data-statut="${id}" aria-pressed="${id === actuel}">${libelle}</button>`).join('')}
      </div>
      ${plante.vendu_le ? `<p class="statut__date">Vendue le ${echapper(formaterDate(plante.vendu_le))}</p>` : ''}`;
  }
  zone.addEventListener('click', async (e) => {
    const bouton = e.target.closest('[data-statut]');
    if (!bouton) return;
    try {
      await definirStatut(idPlante, bouton.dataset.statut);
      dessiner();
    } catch (erreur) {
      message(expliquerErreur(erreur), 'erreur');
    }
  });
  dessiner();
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
      ${ligne('Dernière dose d\'engrais', plante.dernier_engrais ? echapper(dateRelative(plante.dernier_engrais, aujourdhui)) : '—', 'data-soin="engrais"')}
      ${plante.type_engrais ? ligne('Type d\'engrais', echapper(plante.type_engrais), 'data-soin="type-engrais"') : ''}
      ${ligne("Prochaine dose d'engrais", plante.prochain_engrais ? echapper(libelleEcheance(etatEngrais(plante, aujourdhui))) : '—', 'data-soin="prochain-engrais"')}
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
        <p class="photo-date" data-photo-date>Photo du ${echapper(formaterDate(datePhoto(actuelle)))}</p>
        <div class="actions-photo">
          ${couverture?.id === actuelle.id
            ? '<span class="couverture">Photo de couverture</span>'
            : '<button class="btn-texte" type="button" data-action="couverture">Choisir comme couverture</button>'}
          <button class="btn-texte" type="button" data-action="date">Modifier la date</button>
          ${photos.length > 1 ? `<span class="ordre-photo">Ordre
            <button class="btn-icone" type="button" data-action="gauche" aria-label="Déplacer la photo vers la gauche"${photos[0].id === actuelle.id ? ' disabled' : ''}>◀</button>
            <button class="btn-icone" type="button" data-action="droite" aria-label="Déplacer la photo vers la droite"${photos.at(-1).id === actuelle.id ? ' disabled' : ''}>▶</button>
          </span>` : ''}
          <button class="btn-texte btn-texte--danger" type="button" data-action="supprimer-photo">Supprimer la photo</button>
        </div>
        <button class="btn btn--douce btn--espace" type="button" data-action="camera">${icone('appareil')} Photo d'évolution</button>
        ${photos.length > 1 ? `<a class="btn btn--douce btn--espace" href="#/plantes/${idPlante}/evolution">Voir l'évolution</a>` : ''}` : ''}`;
  }

  async function televerser(fichiers, { recadrage = true } = {}) {
    if (!fichiers.length || envoi || recadrageEnCours) return;
    recadrageEnCours = true;
    let reussies = 0;
    let derniereErreur = null;
    for (let i = 0; i < fichiers.length; i++) {
      // Recadrage (ou « Garder entiere ») avant l'envoi ; « Annuler » passe a la photo suivante
      // Photo prise avec l'appareil de l'appli : deja au bon format, pas de recadrage supplementaire
      const pret = recadrage ? await recadrer(fichiers[i], { position: i + 1, total: fichiers.length }) : fichiers[i];
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
    if (bouton?.dataset.action === 'camera') {
      if (envoi || recadrageEnCours) return;
      // La derniere photo (la plus recente) sert de « fantome » pour aligner la nouvelle
      const derniere = photosParDate(idPlante).at(-1);
      let urlFantome = null;
      if (derniere) {
        await chargerUrls([derniere.chemin]).catch(() => {});
        urlFantome = urlEnCache(derniere.chemin);
      }
      const photo = await ouvrirCamera({ idPlante, urlFantome });
      if (photo) televerser([photo], { recadrage: false });
      return;
    }
    if (!bouton || !selection) return;
    try {
      if (bouton.dataset.action === 'date') {
        const photo = photosDe(idPlante).find((p) => p.id === selection);
        const date = await demanderDate({ titre: 'Date de la photo', valeur: datePhoto(photo) });
        if (!date || date === datePhoto(photo)) return;
        await modifierDatePhoto(selection, date);
        message('Date modifiée');
        dessiner();
      } else if (bouton.dataset.action === 'gauche' || bouton.dataset.action === 'droite') {
        await deplacerPhoto(idPlante, selection, bouton.dataset.action === 'gauche' ? -1 : 1);
        dessiner();
      } else if (bouton.dataset.action === 'couverture') {
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
    chargerUrls(chemins).then(async () => {
      // On prepare la grande photo AVANT de redessiner : la vignette reste affichee jusqu'a ce que
      // la grande soit prete, au lieu d'un trou blanc pendant son chargement (le "saut" a la 1re ouverture).
      const actuelle = photosDe(idPlante).find((p) => p.id === selection) || photosDe(idPlante)[0];
      const url = actuelle && urlEnCache(actuelle.chemin);
      if (url) {
        await new Promise((fini) => {
          const image = new Image();
          image.onload = fini;
          image.onerror = fini;
          image.src = url;
          setTimeout(fini, 3000); // connexion lente : on ne bloque pas plus longtemps
        });
      }
      if (galerie.isConnected) dessiner();
    });
  }
}

// ---------- Evolution : toutes les photos de la plus ancienne a la plus recente ----------

export function vueEvolution(conteneur, id) {
  const plante = trouvee(id);
  if (!plante) return introuvable(conteneur);
  const photos = photosParDate(plante.id);

  conteneur.innerHTML = `
    <a class="retour" href="#/plantes/${plante.id}">${icone('retour')} ${echapper(plante.nom)}</a>
    <p class="vue__legende">Évolution</p>
    <h1 class="vue__titre">${echapper(plante.nom)}</h1>
    ${photos.length > 1 ? `
      <section class="frise" aria-label="Frise d'évolution">
        <div class="frise__cadre" data-frise-cadre></div>
        <input class="frise__curseur" type="range" min="0" max="${photos.length - 1}" step="1" value="${photos.length - 1}"
               aria-label="Faire défiler les photos dans le temps">
        <p class="frise__date" data-frise-date></p>
        <p class="frise__ecart" data-frise-ecart></p>
      </section>` : ''}
    ${photos.length ? photos.map((p, i) => {
    const url = urlEnCache(p.chemin) || urlEnCache(cheminVignette(p.chemin));
    const precedente = i ? photos[i - 1] : null;
    return `
      <figure class="evol">
        <div class="evol__photo" data-photo="${echapper(p.chemin)}">${url ? imageHtml(url, `${plante.nom}, ${formaterDate(datePhoto(p))}`) : icone('feuille')}</div>
        <figcaption class="evol__legende">
          <strong>${echapper(formaterDate(datePhoto(p)))}</strong>
          ${precedente ? `<span>${libelleEcart(joursEntre(datePhoto(precedente), datePhoto(p)))}</span>` : '<span>Première photo</span>'}
        </figcaption>
      </figure>`;
  }).join('') : carteVide('Pas encore de photo', 'Ajoute des photos à la fiche pour suivre la plante dans le temps.')}`;
  remplirPhotos(conteneur);
  if (photos.length > 1) initialiserFrise(conteneur, plante, photos);
}

// Frise d'evolution : un curseur qui fait defiler les photos, de la plus ancienne a la plus recente.
// Toutes les photos sont empilees (une seule visible) : le glissement est instantane, sans rechargement.
function initialiserFrise(conteneur, plante, photos) {
  const cadre = conteneur.querySelector('[data-frise-cadre]');
  const curseur = conteneur.querySelector('.frise__curseur');
  const dateZone = conteneur.querySelector('[data-frise-date]');
  const ecartZone = conteneur.querySelector('[data-frise-ecart]');

  function afficher() {
    const i = Number(curseur.value);
    const date = datePhoto(photos[i]);
    dateZone.textContent = formaterDate(date);
    ecartZone.textContent = i ? libelleEcart(joursEntre(datePhoto(photos[0]), date)).replace('plus tard', 'après la première photo') : 'Première photo';
    cadre.querySelectorAll('img').forEach((img, k) => img.classList.toggle('frise__img--visible', k === i));
  }

  curseur.addEventListener('input', afficher);
  afficher();
  chargerUrls(photos.map((p) => p.chemin)).then(() => {
    if (!cadre.isConnected) return;
    cadre.innerHTML = photos.map((p) => {
      const url = urlEnCache(p.chemin);
      return url ? `<img class="frise__img" src="${echapper(url)}" alt="${echapper(plante.nom)}, ${echapper(formaterDate(datePhoto(p)))}">` : '<img class="frise__img" alt="">';
    }).join('');
    afficher();
  }).catch(() => {});
}

// Cherche la plante, ou renvoie null si l'identifiant n'a pas la bonne forme
function trouvee(id) {
  return /^[0-9a-f-]{20,40}$/i.test(id || '') ? trouverPlante(id) : null;
}

// ---------- Formulaire (id = null : nouvelle plante) ----------

export function vueFormulaire(conteneur, id, idMereProposee = null) {
  const plante = id ? trouvee(id) : null;
  if (id && !plante) return introuvable(conteneur);
  const { pieces, plantes } = lireEtat();
  // Nouveau baby : on arrive depuis la fiche de la mere (#/plantes/nouvelle/<id de la mere>)
  const mereProposee = !plante && idMereProposee ? trouvee(idMereProposee) : null;
  const idMere = plante ? plante.mere_id : mereProposee?.id ?? null;
  // Nouvelle plante : on propose d'office la piece ou elle en met le plus
  const pieceProposee = plante ? plante.piece_id : mereProposee ? mereProposee.piece_id : pieceLaPlusUtilisee();

  conteneur.innerHTML = `
    <a class="retour" href="${plante ? `#/plantes/${plante.id}` : '#/plantes'}">
      ${icone('retour')} ${plante ? 'Annuler' : 'Mes plantes'}</a>
    <h1 class="vue__titre">${plante ? 'Modifier la plante' : mereProposee ? 'Nouveau baby' : 'Nouvelle plante'}</h1>
    ${mereProposee ? `<p class="aide-quarantaine">Baby de ${echapper(mereProposee.nom)}</p>` : ''}
    <form id="form-plante" novalidate>
      <div class="onglets-form" role="tablist" aria-label="Sections du formulaire">
        <button class="onglets-form__onglet" type="button" role="tab" data-onglet="infos" aria-selected="true"><i>🪴</i>Infos</button>
        <button class="onglets-form__onglet" type="button" role="tab" data-onglet="soins" aria-selected="false"><i>💧</i>Soins</button>
        <button class="onglets-form__onglet" type="button" role="tab" data-onglet="baby" aria-selected="false"><i>✂️</i>Baby</button>
        <button class="onglets-form__onglet" type="button" role="tab" data-onglet="vente" aria-selected="false"><i>🏷️</i>Vente</button>
      </div>
      <div class="panneau-form" data-panneau="infos">
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
          ${pieces.map((p) => `<option value="${p.id}"${p.id === pieceProposee ? ' selected' : ''}>${echapper(p.nom)}</option>`).join('')}
        </select>
      </label>
      ${champDate("Date d'acquisition", 'date_acquisition', plante?.date_acquisition)}
      <label class="case-quarantaine">
        <input type="checkbox" name="quarantaine"${plante?.quarantaine === false ? '' : ' checked'}>
        <span>Mettre en quarantaine (1 mois)</span>
      </label>
      <p class="aide-quarantaine" id="quarantaine-info" role="status" hidden></p>
      <label class="champ">
        <span class="champ__label">Notes</span>
        <textarea class="champ__input champ__zone" name="notes" rows="5" maxlength="5000"
                  placeholder="Lumière, arrosage, astuces…">${echapper(plante?.notes)}</textarea>
      </label>
      </div>
      <div class="panneau-form" data-panneau="soins" hidden>
        <h2 class="panneau-form__titre">💧 Arrosage</h2>
      <label class="champ">
        <span class="champ__label">Arroser tous les (jours)</span>
        <input class="champ__input" name="arrosage_jours" type="number" inputmode="numeric" min="1" max="365"
               placeholder="Ex. 7 (vide = pas de rappel)" value="${echapper(plante?.arrosage_jours)}">
      </label>
        <h2 class="panneau-form__titre">🌿 Engrais</h2>
      ${champDate('Dernière dose d\'engrais', 'dernier_engrais', plante?.dernier_engrais)}
      <label class="champ">
        <span class="champ__label">Type d'engrais</span>
        <input class="champ__input" name="type_engrais" type="text" list="liste-engrais" maxlength="60" autocomplete="off"
               placeholder="Ex. Osmocote, engrais liquide…" value="${echapper(plante?.type_engrais)}">
        <datalist id="liste-engrais">
          ${[...new Set(lireEtat().plantes.map((p) => p.type_engrais).filter(Boolean))].map((t) => `<option value="${echapper(t)}">`).join('')}
        </datalist>
      </label>
      ${champDate("Prochaine dose d'engrais", 'prochain_engrais', plante?.prochain_engrais)}
        <h2 class="panneau-form__titre">🪣 Rempotage</h2>
      ${champDate('Dernier rempotage', 'dernier_rempotage', plante?.dernier_rempotage)}
      </div>
      <div class="panneau-form" data-panneau="baby" hidden>
      <div class="champ" id="champ-mere">
        <span class="champ__label">Plante mère (si c'est un baby)</span>
        <input type="hidden" name="mere_id" value="${echapper(idMere || '')}">
        <div class="mere-choix" id="mere-choix"></div>
        <div class="mere-liste" id="mere-liste" hidden>
          <input class="champ__input" id="mere-recherche" type="search" placeholder="Chercher une plante…" autocomplete="off">
          <div class="mere-liste__lignes" id="mere-lignes"></div>
        </div>
      </div>
      <div id="bloc-petit" ${idMere ? '' : 'hidden'}>
        <label class="champ">
          <span class="champ__label">Étape du baby</span>
          <select class="champ__input champ__select" name="etape_bouture">
            ${ETAPES.map((e) => `<option value="${e.id}"${e.id === (plante?.etape_bouture || (mereProposee ? 'preleve' : 'terre')) ? ' selected' : ''}>${e.emoji} ${echapper(e.libelle)}</option>`).join('')}
          </select>
        </label>
        ${champDate('Date du prélèvement', 'date_bouture', plante?.date_bouture || (mereProposee ? dateIsoLocale() : ''))}
      </div>
      </div>
      <div class="panneau-form" data-panneau="vente" hidden>
        <div class="champ">
          <span class="champ__label">Statut</span>
          <div class="statut" role="radiogroup" aria-label="Statut de la plante">
            <label class="statut__choix"><input type="radio" name="statut" value="aucun"${!plante?.en_vente && !plante?.vendu_le ? ' checked' : ''}><span>Aucun</span></label>
            <label class="statut__choix statut__choix--vente"><input type="radio" name="statut" value="vente"${plante?.en_vente ? ' checked' : ''}><span>🏷️ En vente</span></label>
            <label class="statut__choix statut__choix--vendu"><input type="radio" name="statut" value="vendu"${plante?.vendu_le ? ' checked' : ''}><span>✓ Vendu</span></label>
          </div>
        </div>
        <div id="bloc-vendu" ${plante?.vendu_le ? '' : 'hidden'}>
          ${champDate('Vendue le', 'vendu_le', plante?.vendu_le || dateIsoLocale())}
        </div>
      </div>
      <p class="erreur-form" id="form-erreur" role="alert" hidden></p>
      <button class="btn btn--primaire" id="form-ok" type="submit">Enregistrer</button>
      ${plante ? '<button class="btn btn--danger btn--espace" id="supprimer" type="button">Supprimer la plante</button>' : ''}
    </form>`;

  const formulaire = conteneur.querySelector('#form-plante');
  // Onglets du formulaire : un seul panneau visible, mais tous restent dans le meme formulaire
  function ouvrirOnglet(nom) {
    formulaire.querySelectorAll('[data-onglet]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.onglet === nom)));
    formulaire.querySelectorAll('[data-panneau]').forEach((d) => { d.hidden = d.dataset.panneau !== nom; });
  }
  formulaire.addEventListener('click', (e) => {
    const onglet = e.target.closest('[data-onglet]');
    if (onglet) ouvrirOnglet(onglet.dataset.onglet);
  });
  // Date de vente visible seulement si « Vendu »
  formulaire.addEventListener('change', (e) => {
    if (e.target.name === 'statut') conteneur.querySelector('#bloc-vendu').hidden = e.target.value !== 'vendu';
  });
  // Corbeille des champs date : efface la valeur, puis se cache
  const majCorbeille = (nom) => {
    const bouton = formulaire.querySelector(`[data-vider="${nom}"]`);
    if (bouton) bouton.hidden = !formulaire.elements[nom].value;
  };
  formulaire.addEventListener('click', (e) => {
    const bouton = e.target.closest('[data-vider]');
    if (!bouton) return;
    formulaire.elements[bouton.dataset.vider].value = '';
    majCorbeille(bouton.dataset.vider);
    majQuarantaine();
  });
  // Quarantaine automatique : un mois apres la date d'acquisition
  const infoQuarantaine = conteneur.querySelector('#quarantaine-info');
  function majQuarantaine() {
    const quar = formulaire.elements.quarantaine.checked ? quarantaine(formulaire.elements.date_acquisition.value) : null;
    infoQuarantaine.hidden = !quar;
    if (quar) infoQuarantaine.textContent = `Quarantaine d'un mois : elle sera mise à part jusqu'au ${formaterDate(quar.fin)}.`;
  }
  // Choix de la mere : liste avec photo, nom, espece et piece (les noms peuvent etre identiques)
  const champMere = formulaire.elements.mere_id;
  const zoneChoix = conteneur.querySelector('#mere-choix');
  const zoneListe = conteneur.querySelector('#mere-liste');
  const zoneLignes = conteneur.querySelector('#mere-lignes');
  const champRecherche = conteneur.querySelector('#mere-recherche');
  const candidates = plantes.filter((p) => p.id !== plante?.id);
  const detail = (p) => [p.espece, p.piece_id ? nomPiece(p.piece_id) : ''].filter(Boolean).join(' · ');
  function afficherChoix() {
    const mere = candidates.find((p) => p.id === champMere.value);
    zoneChoix.innerHTML = mere ? `
      <button class="mere-ligne mere-ligne--choisie" type="button" data-mere-ouvrir>
        ${photoVignetteHtml(mere, 'mere-ligne__photo')}
        <span class="mere-ligne__texte"><strong>${echapper(mere.nom)}</strong><small>${echapper(detail(mere))}</small></span>
        <span class="mere-ligne__action">Changer</span>
      </button>
      <button class="btn-texte" type="button" data-mere-retirer>Retirer la mère</button>` : `
      <button class="btn btn--douce" type="button" data-mere-ouvrir>Choisir une plante mère</button>`;
    conteneur.querySelector('#bloc-petit').hidden = !champMere.value;
    remplirPhotos(zoneChoix);
  }
  function afficherLignes() {
    const q = normaliser(champRecherche.value);
    const liste = candidates.filter((p) => !q || normaliser(`${p.nom} ${p.espece || ''}`).includes(q));
    zoneLignes.innerHTML = liste.length ? liste.map((p) => `
      <button class="mere-ligne" type="button" data-mere-id="${p.id}">
        ${photoVignetteHtml(p, 'mere-ligne__photo')}
        <span class="mere-ligne__texte"><strong>${echapper(p.nom)}</strong><small>${echapper(detail(p))}</small></span>
      </button>`).join('') : '<p class="aide">Aucune plante trouvée.</p>';
    remplirPhotos(zoneLignes);
  }
  champRecherche.addEventListener('input', afficherLignes);
  zoneLignes.addEventListener('click', (e) => {
    const ligne = e.target.closest('[data-mere-id]');
    if (!ligne) return;
    champMere.value = ligne.dataset.mereId;
    zoneListe.hidden = true;
    afficherChoix();
  });
  zoneChoix.addEventListener('click', (e) => {
    if (e.target.closest('[data-mere-retirer]')) { champMere.value = ''; afficherChoix(); return; }
    if (e.target.closest('[data-mere-ouvrir]')) {
      zoneListe.hidden = !zoneListe.hidden;
      if (!zoneListe.hidden) { champRecherche.value = ''; afficherLignes(); }
    }
  });
  afficherChoix();
  const surDate = (e) => {
    if (e.target.type === 'date') { majCorbeille(e.target.name); majQuarantaine(); }
    if (e.target.name === 'quarantaine') majQuarantaine();
  };
  formulaire.addEventListener('input', surDate);
  formulaire.addEventListener('change', surDate);
  majQuarantaine();
  const zoneErreur = conteneur.querySelector('#form-erreur');
  const bouton = conteneur.querySelector('#form-ok');

  formulaire.addEventListener('submit', async (evenement) => {
    evenement.preventDefault();
    zoneErreur.hidden = true;
    const champs = Object.fromEntries(new FormData(formulaire));
    champs.quarantaine = formulaire.elements.quarantaine.checked;
    if (!String(champs.nom || '').trim()) {
      zoneErreur.textContent = 'Donne un nom à ta plante.';
      zoneErreur.hidden = false;
      ouvrirOnglet('infos');
      formulaire.elements.nom.focus();
      return;
    }
    const frequence = String(champs.arrosage_jours || '').trim();
    if (frequence && !(/^\d+$/.test(frequence) && +frequence >= 1 && +frequence <= 365)) {
      zoneErreur.textContent = "La fréquence d'arrosage doit être un nombre de jours entre 1 et 365.";
      zoneErreur.hidden = false;
      ouvrirOnglet('soins');
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
