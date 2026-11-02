// Suivi des problemes d'une plante (parasites, maladies...) : fiche + relance de traitement.
import {
  problemesDe, creerProbleme, traiterProbleme, resoudreProbleme, rouvrirProbleme, supprimerProbleme, expliquerErreur,
} from './donnees.js';
import { echapper, icone, dateRelative, dateIsoLocale, joursEntre } from './outils.js';
import { confirmer, message } from './dialogues.js';

export const TYPES_PROBLEMES = [
  'Cochenilles', 'Araignées rouges', 'Pucerons', 'Moucherons', 'Champignons', 'Feuilles qui jaunissent', 'Autre',
];

// "Traitement à refaire aujourd'hui" / "dans 3 jours" / "en retard de 2 jours"
export function libelleRelance(relance, aujourdhui = dateIsoLocale()) {
  if (!relance) return '';
  const ecart = joursEntre(aujourdhui, relance);
  if (ecart === 0) return "Traitement à refaire aujourd'hui";
  if (ecart === 1) return 'Traitement à refaire demain';
  if (ecart > 1) return `Traitement à refaire dans ${ecart} jours`;
  return `Traitement en retard de ${-ecart} ${ecart === -1 ? 'jour' : 'jours'}`;
}

export function initialiserProblemes(zone, idPlante) {
  let formulaireOuvert = false;

  function dessiner() {
    const aujourdhui = dateIsoLocale();
    const tous = problemesDe(idPlante);
    const enCours = tous.filter((q) => !q.resolu_le);
    const resolus = tous.filter((q) => q.resolu_le);
    const brouillon = zone.querySelector('[name="note"]')?.value ?? '';
    zone.innerHTML = `
      <h2 class="carte__titre">Problèmes</h2>
      ${enCours.length ? `<ul class="problemes">${enCours.map((q) => `
        <li class="probleme" data-probleme="${q.id}">
          <div class="probleme__tete">
            <strong>${echapper(q.type)}</strong>
            <span class="probleme__depuis">depuis ${echapper(dateRelative(q.debut, aujourdhui).toLowerCase())}</span>
          </div>
          ${q.note ? `<p class="probleme__note">${echapper(q.note)}</p>` : ''}
          ${q.relance_le ? `<p class="probleme__relance${q.relance_le <= aujourdhui ? ' probleme__relance--urgent' : ''}">${echapper(libelleRelance(q.relance_le, aujourdhui))}</p>` : ''}
          <div class="probleme__actions">
            ${q.relance_le ? '<button class="btn-texte" type="button" data-traite>Traité, relancer dans 7 jours</button>' : ''}
            <button class="btn-texte" type="button" data-resolu>Résolu</button>
            <button class="btn-icone" type="button" data-supprimer aria-label="Supprimer ce problème">${icone('corbeille')}</button>
          </div>
        </li>`).join('')}</ul>` : '<p class="probleme__vide">Aucun problème en cours.</p>'}
      ${formulaireOuvert ? `
        <form class="probleme__form" autocomplete="off">
          <select class="champ__input" name="type" aria-label="Type de problème">
            ${TYPES_PROBLEMES.map((t) => `<option>${echapper(t)}</option>`).join('')}
          </select>
          <textarea class="champ__input" name="note" rows="2" maxlength="500" aria-label="Note ou traitement appliqué"
            placeholder="Traitement appliqué, observations…"></textarea>
          <label class="probleme__label">Refaire le traitement
            <select class="champ__input" name="relance" aria-label="Relance du traitement">
              <option value="0">Pas de relance</option>
              <option value="3">Dans 3 jours</option>
              <option value="7" selected>Dans 7 jours</option>
              <option value="14">Dans 14 jours</option>
            </select>
          </label>
          <div class="probleme__boutons">
            <button class="btn btn--douce" type="button" data-annuler>Annuler</button>
            <button class="btn btn--primaire" type="submit">Enregistrer</button>
          </div>
        </form>` : '<button class="btn btn--douce btn--espace" type="button" data-ouvrir>Signaler un problème</button>'}
      ${resolus.length ? `
        <h3 class="soins__sous-titre">Résolus</h3>
        <ul class="problemes problemes--resolus">${resolus.map((q) => `
          <li class="probleme probleme--resolu" data-probleme="${q.id}">
            <span>${echapper(q.type)} <span class="probleme__depuis">· résolu ${echapper(dateRelative(q.resolu_le, aujourdhui).toLowerCase())}</span></span>
            <button class="btn-texte" type="button" data-rouvrir>Rouvrir</button>
          </li>`).join('')}</ul>` : ''}`;
    const note = zone.querySelector('[name="note"]');
    if (note) note.value = brouillon;
  }

  zone.addEventListener('click', async (e) => {
    const bouton = e.target.closest('button');
    if (!bouton || bouton.disabled) return;
    if (bouton.hasAttribute('data-ouvrir')) { formulaireOuvert = true; dessiner(); return; }
    if (bouton.hasAttribute('data-annuler')) { formulaireOuvert = false; dessiner(); return; }
    const id = bouton.closest('[data-probleme]')?.dataset.probleme;
    if (!id) return;
    try {
      if (bouton.hasAttribute('data-traite')) {
        await traiterProbleme(id, 7);
        message('Traitement noté');
      } else if (bouton.hasAttribute('data-resolu')) {
        await resoudreProbleme(id);
        message('Problème résolu');
      } else if (bouton.hasAttribute('data-rouvrir')) {
        await rouvrirProbleme(id);
      } else if (bouton.hasAttribute('data-supprimer')) {
        const accord = await confirmer({
          titre: 'Supprimer ce problème ?', texte: 'Il disparaîtra aussi de l\'historique.', action: 'Supprimer', danger: true,
        });
        if (!accord) return;
        await supprimerProbleme(id);
        message('Problème supprimé');
      } else {
        return;
      }
      dessiner();
    } catch (erreur) {
      message(expliquerErreur(erreur), 'erreur');
    }
  });

  zone.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formulaire = e.target;
    const bouton = formulaire.querySelector('[type="submit"]');
    bouton.disabled = true;
    try {
      await creerProbleme(idPlante, {
        type: formulaire.elements.type.value,
        note: formulaire.elements.note.value.trim(),
        relanceJours: Number(formulaire.elements.relance.value) || null,
      });
      formulaireOuvert = false;
      message('Problème noté');
    } catch (erreur) {
      message(expliquerErreur(erreur), 'erreur');
    }
    dessiner();
  });

  dessiner();
}
