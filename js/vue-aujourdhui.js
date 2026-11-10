// Ecran "Aujourd'hui" : les plantes a arroser (les plus en retard d'abord), celles deja arrosees,
// et un apercu des 3 prochains jours.
import {
  lireEtat, teintePiece, arrosagesDe, arroserPlante, annulerArrosage, marquerFait, expliquerErreur,
  creerTache, marquerTache, supprimerTache, traiterProbleme, resoudreProbleme, trouverPlante,
} from './donnees.js';
import { libelleRelance } from './problemes.js';
import { iconeTache } from './journal.js';
import { planifier, libelleEcheance } from './rappels.js';
import { photoVignetteHtml, remplirPhotos } from './vues-plantes.js';
import { echapper, icone, dateDuJour, dateIsoLocale, ajouterJours, joursEntre, formaterDate } from './outils.js';
import { message } from './dialogues.js';

// Une tache libre : pastille emoji, texte (on le touche pour ouvrir « Supprimer »), bouton rond
function ligneTache(t, { faite = false, quand = '', ouvert = false } = {}) {
  const rond = faite
    ? `<button class="tache__rond tache__rond--fait" type="button" data-tache-annuler aria-label="Annuler : ${echapper(t.texte)}">✓</button>`
    : quand ? ''
      : `<button class="tache__rond" type="button" data-tache-fait aria-label="Fait : ${echapper(t.texte)}">✓</button>`;
  return `
          <article class="tache tache--libre${faite ? ' tache--faite' : ''}" data-tache="${t.id}">
            <span class="tache__pastille" aria-hidden="true">${iconeTache(t.texte)}</span>
            <button class="tache__libre-texte" type="button" data-tache-menu aria-expanded="${ouvert}">${echapper(t.texte)}${quand ? `
              <span class="tache__quand">${quand}</span>` : ''}</button>
            ${rond}
            ${ouvert ? `<div class="tache__actions"><button class="btn-texte btn-texte--danger" type="button" data-tache-suppr>Supprimer la tâche</button></div>` : ''}
          </article>`;
}

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
  // Pour quand est la nouvelle tache ? Le soir (apres 18 h), on propose d'office « Demain ».
  let quand = new Date().getHours() >= 18 ? 'demain' : 'aujourdhui';
  let dateAutre = ajouterJours(jour, 2);
  let tacheOuverte = null; // tache dont le menu « Supprimer » est ouvert

  function dessiner() {
    const brouillon = conteneur.querySelector('#form-tache [name="texte"]')?.value || '';
    const { plantes, arrosages, pieces, horsLigne, taches, problemes } = lireEtat();
    // Traitements a refaire : probleme en cours dont la date de relance est arrivee
    const traitements = problemes.filter((q) => !q.resolu_le && q.relance_le && q.relance_le <= jour && trouverPlante(q.plante_id));
    // Une tache sans date, ou dont le jour est arrive, est a faire maintenant
    const tachesAFaire = taches.filter((t) => !t.fait_le && (!t.pour_le || t.pour_le <= jour));
    const tachesAVenir = taches.filter((t) => !t.fait_le && t.pour_le > jour)
      .sort((x, y) => x.pour_le.localeCompare(y.pour_le));
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
    } else if (!aFaire.length && !engraisAFaire.length && !tachesAFaire.length && !traitements.length) {
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
      ${traitements.length ? `
        <h2 class="section__titre">Traitements <span class="puce__nombre">${traitements.length}</span></h2>
        <div class="taches" data-liste="traitements">${traitements.map((q) => {
    const plante = trouverPlante(q.plante_id);
    return `
          <article class="tache tache--libre" data-probleme="${q.id}">
            <a class="tache__lien" href="#/plantes/${plante.id}">
              <span class="tache__texte">
                <span class="tache__nom">${echapper(q.type)} · ${echapper(plante.nom)}</span>
                <span class="tache__info tache__info--retard">${echapper(libelleRelance(q.relance_le, jour))}</span>
              </span>
            </a>
            <button class="btn-texte" type="button" data-traite>Traité</button>
            <button class="btn-texte" type="button" data-resolu>Résolu</button>
          </article>`;
  }).join('')}</div>` : ''}
      <h2 class="section__titre">Mes tâches${tachesAFaire.length ? ` <span class="puce__nombre">${tachesAFaire.length}</span>` : ''}</h2>
      <div class="taches" data-liste="mes-taches">
        ${tachesAFaire.map((t) => ligneTache(t, { ouvert: tacheOuverte === t.id })).join('')}
        ${tachesFaites.map((t) => ligneTache(t, { faite: true, ouvert: tacheOuverte === t.id })).join('')}
      </div>
      <form class="ajout-tache" id="form-tache" novalidate>
        <div class="ajout-tache__ligne">
          <input class="champ__input" name="texte" type="text" maxlength="120" autocomplete="off" placeholder="Nouvelle tâche…" aria-label="Nouvelle tâche">
          <button class="tache__rond" type="submit" aria-label="Ajouter la tâche">＋</button>
        </div>
        <div class="puces ajout-tache__quand" role="group" aria-label="Pour quand ?">
          ${[['aujourdhui', "Aujourd'hui"], ['demain', 'Demain'], ['autre', 'Autre date']].map(([id, libelle]) =>
    `<button type="button" class="puce" data-quand="${id}" aria-pressed="${quand === id}">${libelle}</button>`).join('')}
        </div>
        ${quand === 'autre' ? `<input class="champ__input" id="tache-date" type="date" min="${ajouterJours(jour, 1)}" value="${dateAutre}" aria-label="Date de la tâche">` : ''}
      </form>
      ${tachesAVenir.length ? `
        <h2 class="section__titre">À venir <span class="puce__nombre">${tachesAVenir.length}</span></h2>
        <div class="taches" data-liste="a-venir">
          ${tachesAVenir.map((t) => ligneTache(t, { quand: joursEntre(jour, t.pour_le) === 1 ? 'Demain' : echapper(formaterDate(t.pour_le)), ouvert: tacheOuverte === t.id })).join('')}
        </div>` : ''}
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
    const pourLe = quand === 'demain' ? ajouterJours(jour, 1) : quand === 'autre' ? dateAutre : jour;
    try {
      await creerTache(texte, pourLe);
      champ.value = '';
    } catch (erreur) {
      message(expliquerErreur(erreur), 'erreur');
    }
    if (conteneur.isConnected) dessiner();
  });

  // Choix « pour quand » de la nouvelle tache
  conteneur.addEventListener('click', (evenement) => {
    const puce = evenement.target.closest('[data-quand]');
    if (!puce) return;
    quand = puce.dataset.quand;
    dessiner();
  });
  conteneur.addEventListener('change', (evenement) => {
    if (evenement.target.id === 'tache-date' && evenement.target.value) dateAutre = evenement.target.value;
  });

  // Traitements : « Traité » (relance dans 7 jours) ou « Résolu »
  conteneur.addEventListener('click', async (evenement) => {
    const b = evenement.target.closest('[data-traite], [data-resolu]');
    const idProbleme = b?.closest('[data-probleme]')?.dataset.probleme;
    if (!b || b.disabled || !idProbleme) return;
    b.disabled = true;
    try {
      if (b.hasAttribute('data-traite')) { await traiterProbleme(idProbleme, 7); message('Traitement noté, relance dans 7 jours'); }
      else { await resoudreProbleme(idProbleme); message('Problème résolu'); }
    } catch (erreur) {
      message(expliquerErreur(erreur), 'erreur');
    }
    if (conteneur.isConnected) dessiner();
  });

  // Taches libres : cocher, annuler, supprimer
  conteneur.addEventListener('click', async (evenement) => {
    const menu = evenement.target.closest('[data-tache-menu]');
    if (menu) {
      const id = menu.closest('[data-tache]')?.dataset.tache;
      tacheOuverte = tacheOuverte === id ? null : id;
      dessiner();
      return;
    }
    const boutonTache = evenement.target.closest('[data-tache-fait], [data-tache-annuler], [data-tache-suppr]');
    if (!boutonTache || boutonTache.disabled) return;
    const idTache = boutonTache.closest('[data-tache]')?.dataset.tache;
    tacheOuverte = null;
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
