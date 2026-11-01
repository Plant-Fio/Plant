// Ecran "Aujourd'hui" : les plantes a arroser (les plus en retard d'abord), celles deja arrosees,
// et un apercu des 3 prochains jours.
import {
  lireEtat, teintePiece, arrosagesDe, arroserPlante, annulerArrosage, marquerFait, expliquerErreur,
  creerTache, marquerTache, supprimerTache,
} from './donnees.js';
import { planifier, libelleEcheance } from './rappels.js';
import { photoVignetteHtml, remplirPhotos } from './vues-plantes.js';
import { echapper, icone, dateDuJour, dateIsoLocale } from './outils.js';
import { message } from './dialogues.js';

function carte(etat, bouton) {
  const { plante } = etat;
  const { nomPiece } = etat;
  return `
    <article class="tache" data-plante="${plante.id}"${plante.piece_id ? ` data-teinte="${teintePiece(plante.piece_id)}"` : ''}>
      <a class="tache__lien" href="#/plantes/${plante.id}">
        ${photoVignetteHtml(plante, 'tache__photo')}
        <span class="tache__texte">
          <span class="tache__nom">${echapper(plante.nom)}</span>
          <span class="tache__info tache__info--${etat.statut}">${echapper(etat.libelle)}</span>
          ${nomPiece ? `<span class="tache__piece">${echapper(nomPiece)}</span>` : ''}
        </span>
      </a>
      ${bouton}
    </article>`;
}

export function vueAujourdhui(page) {
  // Zone propre a cet affichage : les ecouteurs ne s'empilent pas quand on revient sur l'onglet
  const conteneur = document.createElement('div');
  page.replaceChildren(conteneur);
  const jour = dateIsoLocale();

  function dessiner() {
    const brouillon = conteneur.querySelector('#form-tache [name="texte"]')?.value || '';
    const { plantes, arrosages, pieces, horsLigne, taches } = lireEtat();
    const tachesAFaire = taches.filter((t) => !t.fait_le);
    const tachesFaites = taches.filter((t) => t.fait_le === jour);
    const nomsPieces = new Map(pieces.map((p) => [p.id, p.nom]));
    const { aFaire, faites, bientot, engraisAFaire, engraisBientot, avecRappel } = planifier(plantes, arrosages, jour);
    const enrichir = (liste) => liste.map((e) => ({
      ...e, libelle: libelleEcheance(e), nomPiece: nomsPieces.get(e.plante.piece_id) || '',
    }));

    let vide = '';
    if (!plantes.length) {
      vide = `<section class="carte vide"><div class="vide__bulle">${icone('feuille')}</div>
        <h2 class="vide__titre">Aucune plante pour l'instant</h2>
        <p class="vide__texte">Ajoute ta première plante pour recevoir des rappels d'arrosage.</p>
        <a class="btn btn--primaire" href="#/plantes/nouvelle">Ajouter une plante</a></section>`;
    } else if (!avecRappel) {
      vide = `<section class="carte vide"><div class="vide__bulle">${icone('goutte')}</div>
        <h2 class="vide__titre">Pas encore de rappel</h2>
        <p class="vide__texte">Indique tous les combien de jours arroser une plante (fiche, puis Modifier) et elle apparaîtra ici.</p></section>`;
    } else if (!aFaire.length && !engraisAFaire.length && !tachesAFaire.length) {
      vide = `<section class="carte vide" data-vide><div class="vide__bulle">${icone('goutte')}</div>
        <h2 class="vide__titre">Tout est à jour</h2>
        <p class="vide__texte">Rien à faire pour le moment.</p></section>`;
    }

    const bouton = `<button class="tache__bouton" type="button" data-arroser>${icone('goutte')} Arrosée</button>`;
    conteneur.innerHTML = `
      <p class="vue__legende">${echapper(dateDuJour())}</p>
      <h1 class="vue__titre">À faire aujourd'hui</h1>
      ${horsLigne ? '<p class="bandeau">Hors ligne : tu consultes la dernière version enregistrée.</p>' : ''}
      ${vide}
      ${aFaire.length ? `
        <h2 class="section__titre">À arroser <span class="puce__nombre">${aFaire.length}</span></h2>
        <div class="taches" data-liste="afaire">${enrichir(aFaire).map((e) => carte(e, bouton)).join('')}</div>` : ''}
      ${engraisAFaire.length ? `
        <h2 class="section__titre">Engrais <span class="puce__nombre">${engraisAFaire.length}</span></h2>
        <div class="taches" data-liste="engrais">${enrichir(engraisAFaire).map((e) => carte(e,
    `<button class="tache__bouton" type="button" data-engrais>${icone('feuille')} Fait</button>`)).join('')}</div>` : ''}
      <h2 class="section__titre">Mes tâches${tachesAFaire.length ? ` <span class="puce__nombre">${tachesAFaire.length}</span>` : ''}</h2>
      <div class="taches" data-liste="mes-taches">
        ${tachesAFaire.map((t) => `
          <article class="tache tache--libre" data-tache="${t.id}">
            <span class="tache__libre-texte">${echapper(t.texte)}</span>
            <button class="tache__bouton" type="button" data-tache-fait>${icone('feuille')} Fait</button>
            <button class="btn-icone" type="button" data-tache-suppr aria-label="Supprimer la tâche : ${echapper(t.texte)}">${icone('corbeille')}</button>
          </article>`).join('')}
        ${tachesFaites.map((t) => `
          <article class="tache tache--libre tache--faite" data-tache="${t.id}">
            <span class="tache__libre-texte">${echapper(t.texte)}</span>
            <button class="btn-texte" type="button" data-tache-annuler>Annuler</button>
          </article>`).join('')}
      </div>
      <form class="ajout-tache" id="form-tache" novalidate>
        <input class="champ__input" name="texte" type="text" maxlength="120" autocomplete="off"
               placeholder="Ex. Vaporiser les plantes du salon" aria-label="Nouvelle tâche">
        <button class="btn btn--douce" type="submit">Ajouter</button>
      </form>
      ${faites.length ? `
        <h2 class="section__titre">Arrosées aujourd'hui <span class="puce__nombre">${faites.length}</span></h2>
        <div class="taches" data-liste="faites">${enrichir(faites).map((e) => carte(e,
    `<button class="btn-texte" type="button" data-annuler>Annuler</button>`)).join('')}</div>` : ''}
      ${bientot.length || engraisBientot.length ? `
        <h2 class="section__titre">Bientôt</h2>
        <div class="taches" data-liste="bientot">${enrichir(bientot).map((e) => carte(e, '')).join('')}${
  enrichir(engraisBientot).map((e) => carte({ ...e, libelle: `Engrais : ${e.libelle}` }, '')).join('')}</div>` : ''}`;
    if (brouillon) conteneur.querySelector('#form-tache [name="texte"]').value = brouillon;
    remplirPhotos(conteneur);
  }

  // Ajout d'une tache libre
  conteneur.addEventListener('submit', async (evenement) => {
    evenement.preventDefault();
    const champ = conteneur.querySelector('#form-tache [name="texte"]');
    const texte = champ.value.trim();
    if (!texte) { champ.focus(); return; }
    try {
      await creerTache(texte);
      champ.value = '';
    } catch (erreur) {
      message(expliquerErreur(erreur), 'erreur');
    }
    if (conteneur.isConnected) dessiner();
  });

  // Taches libres : cocher, annuler, supprimer
  conteneur.addEventListener('click', async (evenement) => {
    const boutonTache = evenement.target.closest('[data-tache-fait], [data-tache-annuler], [data-tache-suppr]');
    if (!boutonTache || boutonTache.disabled) return;
    const idTache = boutonTache.closest('[data-tache]')?.dataset.tache;
    boutonTache.disabled = true;
    try {
      if (boutonTache.hasAttribute('data-tache-fait')) await marquerTache(idTache, jour);
      else if (boutonTache.hasAttribute('data-tache-annuler')) await marquerTache(idTache, null);
      else { await supprimerTache(idTache); message('Tâche supprimée'); }
    } catch (erreur) {
      message(expliquerErreur(erreur), 'erreur');
    }
    if (conteneur.isConnected) dessiner();
  });

  conteneur.addEventListener('click', async (evenement) => {
    const bouton = evenement.target.closest('[data-arroser], [data-annuler], [data-engrais]');
    if (!bouton || bouton.disabled) return;
    const idPlante = bouton.closest('[data-plante]')?.dataset.plante;
    if (!idPlante) return;
    bouton.disabled = true;
    try {
      if (bouton.hasAttribute('data-engrais')) {
        await marquerFait(idPlante, 'dernier_engrais', jour);
        message('Engrais noté');
      } else if (bouton.hasAttribute('data-arroser')) {
        await arroserPlante(idPlante, jour);
        message('Arrosage noté');
      } else {
        const ligne = arrosagesDe(idPlante).find((a) => a.jour === jour);
        if (ligne) await annulerArrosage(ligne.id);
        message('Arrosage annulé');
      }
    } catch (erreur) {
      message(expliquerErreur(erreur), 'erreur');
    }
    if (conteneur.isConnected) dessiner();
  });

  dessiner();
}
