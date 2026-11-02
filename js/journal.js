// Journal de la fiche d'une plante : notes datees, photo en option.
import { journalDe, photosDe, ajouterNote, supprimerNote, expliquerErreur } from './donnees.js';
import { chargerUrls, urlEnCache, cheminVignette } from './photos.js';
import { echapper, icone, dateRelative, dateIsoLocale } from './outils.js';
import { confirmer, message } from './dialogues.js';

export function initialiserJournal(zone, idPlante) {
  let photoChoisie = null; // fichier choisi pour la prochaine note
  let envoi = false;

  function vignetteDe(note) {
    const photo = note.photo_id ? photosDe(idPlante).find((p) => p.id === note.photo_id) : null;
    if (!photo) return '';
    const url = urlEnCache(cheminVignette(photo.chemin));
    return url ? `<img class="journal__photo" src="${echapper(url)}" alt="Photo de la note" loading="lazy">` : '';
  }

  function dessiner() {
    const aujourdhui = dateIsoLocale();
    const notes = journalDe(idPlante);
    // On garde ce qui est en train d'etre ecrit quand on redessine
    const brouillon = zone.querySelector('[name="note"]')?.value ?? '';
    zone.innerHTML = `
      <h2 class="carte__titre">Journal</h2>
      <form class="journal__form" autocomplete="off">
        <textarea class="champ__input journal__texte" name="note" rows="2" maxlength="1000"
          aria-label="Nouvelle note" placeholder="Nouvelle feuille, cochenilles, rempotage…"></textarea>
        <div class="journal__actions">
          <label class="btn-texte journal__photo-bouton">
            ${icone('appareil')} ${photoChoisie ? 'Photo jointe ✓' : 'Ajouter une photo'}
            <input class="fichier" type="file" accept="image/*" aria-label="Joindre une photo">
          </label>
          <button class="btn btn--primaire journal__ajout" type="submit"${envoi ? ' disabled' : ''}>${envoi ? 'Envoi…' : 'Ajouter'}</button>
        </div>
      </form>
      ${notes.length ? `<ul class="journal">
        ${notes.map((n) => `
          <li class="journal__note">
            <div class="journal__corps">
              <span class="journal__date">${echapper(dateRelative(n.date_note, aujourdhui))}</span>
              <p class="journal__contenu">${echapper(n.texte)}</p>
              ${vignetteDe(n)}
            </div>
            <button class="btn-icone" type="button" data-supprimer="${n.id}" aria-label="Supprimer cette note">${icone('corbeille')}</button>
          </li>`).join('')}
      </ul>` : ''}`;
    zone.querySelector('[name="note"]').value = brouillon;
  }

  zone.addEventListener('change', (e) => {
    if (!e.target.matches('input.fichier')) return;
    photoChoisie = e.target.files[0] || null;
    dessiner();
  });

  zone.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (envoi) return;
    const champ = zone.querySelector('[name="note"]');
    const texte = champ.value.trim();
    if (!texte) { champ.focus(); return; }
    envoi = true;
    dessiner();
    try {
      const note = await ajouterNote(idPlante, texte, photoChoisie);
      photoChoisie = null;
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
