// Journal de la fiche d'une plante : notes datees, photo en option.
import { journalDe, photosDe, ajouterNote, modifierNote, supprimerNote, expliquerErreur } from './donnees.js';
import { chargerUrls, urlEnCache, cheminVignette } from './photos.js';
import { echapper, icone, dateRelative, dateIsoLocale, normaliser } from './outils.js';
import { confirmer, message } from './dialogues.js';

// Icones proposees pour une note (la premiere est celle par defaut)
export const ICONES_NOTE = ['📝', '🌱', '🌸', '🐛', '🪴', '💧'];
const MOTS_ICONES = [
  ['🐛', /cochenille|puceron|araignee|moucheron|thrips|parasite|champignon|maladie|jaun|traitement|savon/],
  ['🪴', /rempot|nouveau pot|plus grand/],
  ['💧', /arros|trempe|vaporis|brum/],
  ['🌸', /fleur|floraison|fleuri|bouton/],
  ['🌱', /feuille|pousse|bourgeon|bouture|racine|grandi/],
];
// Devine l'icone d'apres les mots de la note
export function detecterIcone(texte) {
  const t = normaliser(texte || '');
  return MOTS_ICONES.find(([, mots]) => mots.test(t))?.[0] ?? '📝';
}
export const iconeNote = (note) => note.icone || detecterIcone(note.texte);
const classeIcone = (e) => ({ '🌱': 'vert', '🌸': 'rose', '🐛': 'rouge', '🪴': 'sable', '💧': 'bleu' })[e] || 'neutre';

export function initialiserJournal(zone, idPlante) {
  let photoChoisie = null; // fichier choisi pour la prochaine note
  let envoi = false;
  let iconeManuelle = null; // icone choisie a la main (sinon : devinee d'apres le texte)
  let enEdition = null;     // { id, icone } de la note qu'on est en train de modifier

  function vignetteDe(note) {
    const photo = note.photo_id ? photosDe(idPlante).find((p) => p.id === note.photo_id) : null;
    if (!photo) return '';
    const url = urlEnCache(cheminVignette(photo.chemin));
    return url ? `<img class="journal__photo" src="${echapper(url)}" alt="Photo de la note" loading="lazy">` : '';
  }

  // Une note en cours de modification : texte et icone modifiables sur place
  function noteEnEdition(n) {
    return `
          <li class="journal__note journal__note--edition">
            <span class="journal__pastille journal__pastille--${classeIcone(enEdition.icone)}" aria-hidden="true">${enEdition.icone}</span>
            <form class="journal__corps journal__edition" data-edition="${n.id}">
              <textarea class="champ__input journal__texte" name="edition" rows="3" maxlength="1000" aria-label="Modifier la note">${echapper(n.texte)}</textarea>
              <div class="journal__icones" role="group" aria-label="Icône de la note">
                ${ICONES_NOTE.map((e) => `<button class="journal__icone" type="button" data-icone-edition="${e}" aria-pressed="${e === enEdition.icone}">${e}</button>`).join('')}
              </div>
              <div class="journal__actions">
                <button class="btn-texte" type="button" data-annuler-edition>Annuler</button>
                <button class="btn btn--primaire journal__ajout" type="submit">Enregistrer</button>
              </div>
            </form>
          </li>`;
  }

  function dessiner() {
    const aujourdhui = dateIsoLocale();
    const notes = journalDe(idPlante);
    // On garde ce qui est en train d'etre ecrit quand on redessine
    const brouillon = zone.querySelector('[name="note"]')?.value ?? '';
    const texteEdition = zone.querySelector('[name="edition"]')?.value;
    zone.innerHTML = `
      <h2 class="carte__titre">Journal</h2>
      <form class="journal__form" autocomplete="off">
        <textarea class="champ__input journal__texte" name="note" rows="2" maxlength="1000"
          aria-label="Nouvelle note" placeholder="Qu'as-tu remarqué aujourd'hui ?"></textarea>
        <div class="journal__icones" role="group" aria-label="Icône de la note">
          ${ICONES_NOTE.map((e) => `<button class="journal__icone" type="button" data-icone="${e}" aria-pressed="false">${e}</button>`).join('')}
        </div>
        <div class="journal__actions">
          <label class="btn-texte journal__photo-bouton">
            ${icone('appareil')} ${photoChoisie ? 'Photo jointe ✓' : 'Photo'}
            <input class="fichier" type="file" accept="image/*" aria-label="Joindre une photo">
          </label>
          <button class="btn btn--primaire journal__ajout" type="submit"${envoi ? ' disabled' : ''}>${envoi ? 'Envoi…' : 'Ajouter'}</button>
        </div>
      </form>
      ${notes.length ? `<ul class="journal">
        ${notes.map((n) => (enEdition?.id === n.id ? noteEnEdition(n) : `
          <li class="journal__note">
            <span class="journal__pastille journal__pastille--${classeIcone(iconeNote(n))}" aria-hidden="true">${iconeNote(n)}</span>
            <div class="journal__corps">
              <span class="journal__date">${echapper(dateRelative(n.date_note, aujourdhui))}</span>
              <p class="journal__contenu">${echapper(n.texte)}</p>
              ${vignetteDe(n)}
            </div>
            <button class="btn-icone" type="button" data-modifier="${n.id}" aria-label="Modifier cette note">${icone('crayon')}</button>
            <button class="btn-icone" type="button" data-supprimer="${n.id}" aria-label="Supprimer cette note">${icone('corbeille')}</button>
          </li>`)).join('')}
      </ul>` : ''}`;
    zone.querySelector('[name="note"]').value = brouillon;
    if (texteEdition != null && zone.querySelector('[name="edition"]')) zone.querySelector('[name="edition"]').value = texteEdition;
    marquerIcones();
  }

  // Met en avant l'icone choisie (ou devinee d'apres ce qui est ecrit)
  function marquerIcones() {
    const actuelle = iconeManuelle || detecterIcone(zone.querySelector('[name="note"]')?.value);
    zone.querySelectorAll('.journal__icone').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.icone === actuelle)));
    return actuelle;
  }

  zone.addEventListener('input', (e) => { if (e.target.name === 'note') marquerIcones(); });

  zone.addEventListener('change', (e) => {
    if (!e.target.matches('input.fichier')) return;
    photoChoisie = e.target.files[0] || null;
    dessiner();
  });

  zone.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (e.target.matches('[data-edition]')) {
      const texte = e.target.elements.edition.value.trim();
      if (!texte) { e.target.elements.edition.focus(); return; }
      try {
        await modifierNote(e.target.dataset.edition, texte, enEdition.icone);
        message('Note modifiée');
        enEdition = null;
      } catch (erreur) {
        message(expliquerErreur(erreur), 'erreur');
      }
      dessiner();
      return;
    }
    if (envoi) return;
    const champ = zone.querySelector('[name="note"]');
    const texte = champ.value.trim();
    if (!texte) { champ.focus(); return; }
    envoi = true;
    dessiner();
    try {
      const note = await ajouterNote(idPlante, texte, photoChoisie, iconeManuelle || detecterIcone(texte));
      photoChoisie = null;
      iconeManuelle = null;
      zone.querySelector('[name="note"]').value = '';
      const photo = photosDe(idPlante).find((p) => p.id === note.photo_id);
      if (photo) await chargerUrls([photo.chemin, cheminVignette(photo.chemin)]).catch(() => {});
      message('Note ajoutée');
    } catch (erreur) {
      message(expliquerErreur(erreur), 'erreur');
    }
    envoi = false;
    dessiner();
  });

  zone.addEventListener('click', async (e) => {
    const puce = e.target.closest('[data-icone]');
    if (puce) { iconeManuelle = puce.dataset.icone; marquerIcones(); return; }
    const puceEdition = e.target.closest('[data-icone-edition]');
    if (puceEdition) { enEdition.icone = puceEdition.dataset.iconeEdition; dessiner(); return; }
    if (e.target.closest('[data-annuler-edition]')) { enEdition = null; dessiner(); return; }
    const crayon = e.target.closest('[data-modifier]');
    if (crayon) {
      const note = journalDe(idPlante).find((n) => n.id === crayon.dataset.modifier);
      if (note) { enEdition = { id: note.id, icone: iconeNote(note) }; dessiner(); zone.querySelector('[name="edition"]')?.focus(); }
      return;
    }
    const bouton = e.target.closest('[data-supprimer]');
    if (!bouton) return;
    const accord = await confirmer({
      titre: 'Supprimer cette note ?',
      texte: 'La photo éventuelle reste dans la galerie de la plante.',
      action: 'Supprimer',
      danger: true,
    });
    if (!accord) return;
    try {
      await supprimerNote(bouton.dataset.supprimer);
      message('Note supprimée');
      dessiner();
    } catch (erreur) {
      message(expliquerErreur(erreur), 'erreur');
    }
  });

  dessiner();
  // Les adresses des vignettes arrivent ensuite, puis on redessine
  const chemins = journalDe(idPlante).map((n) => photosDe(idPlante).find((p) => p.id === n.photo_id))
    .filter(Boolean).map((p) => cheminVignette(p.chemin));
  if (chemins.length) chargerUrls(chemins).then(() => { if (zone.isConnected) dessiner(); });
}
