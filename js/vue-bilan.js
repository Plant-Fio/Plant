// Bilan du mois : ce qui s'est passe dans le jardin, mois par mois (arrosages, photos, notes, problemes).
import { lireEtat } from './donnees.js';
import { iconeNote } from './journal.js';
import { echapper, icone, dateIsoLocale, formaterDate } from './outils.js';

const MOIS_EN_ARRIERE_MAX = 5; // les arrosages ne sont gardes que sur 6 mois dans l'appli

let moisAffiche = null; // "2026-11"

const decaler = (mois, n) => {
  const [a, m] = mois.split('-').map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const nomMois = (mois) => {
  const [a, m] = mois.split('-').map(Number);
  const texte = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(a, m - 1, 1));
  return texte.charAt(0).toUpperCase() + texte.slice(1);
};
const duMois = (iso, mois) => typeof iso === 'string' && iso.startsWith(mois);
const pluriel = (n, un, plusieurs) => (n > 1 ? plusieurs : un);

export function vueBilan(conteneur) {
  const courant = dateIsoLocale().slice(0, 7);
  moisAffiche = courant; // on repart toujours du mois en cours

  function dessiner() {
    const { plantes, arrosages, photos, journal, problemes } = lireEtat();
    const mois = moisAffiche;
    const nbArrosages = arrosages.filter((a) => duMois(a.jour, mois)).length;
    const nbPlantes = plantes.filter((p) => duMois(p.date_acquisition || String(p.created_at).slice(0, 10), mois)).length;
    const nbPhotos = photos.filter((p) => duMois(p.date_photo || String(p.created_at).slice(0, 10), mois)).length;
    const notes = journal.filter((n) => duMois(n.date_note, mois));
    const signales = problemes.filter((q) => duMois(q.debut, mois)).length;
    const resolus = problemes.filter((q) => duMois(q.resolu_le, mois)).length;
    const nomPlante = new Map(plantes.map((p) => [p.id, p.nom]));

    const tuiles = [
      ['💧', nbArrosages, pluriel(nbArrosages, 'arrosage', 'arrosages')],
      ['📷', nbPhotos, pluriel(nbPhotos, 'photo', 'photos')],
      ['📝', notes.length, pluriel(notes.length, 'note au journal', 'notes au journal')],
      ['🪴', nbPlantes, pluriel(nbPlantes, 'plante ajoutée', 'plantes ajoutées')],
      ['🐛', signales, pluriel(signales, 'problème signalé', 'problèmes signalés')],
      ['✅', resolus, pluriel(resolus, 'problème résolu', 'problèmes résolus')],
    ];
    const vide = tuiles.every(([, n]) => n === 0);
    conteneur.innerHTML = `
      <a class="retour" href="#/reglages">${icone('retour')} Réglages</a>
      <p class="vue__legende">Bilan du mois</p>
      <div class="bilan__mois">
        <button class="btn-icone" type="button" data-mois="-1" aria-label="Mois précédent"${mois <= decaler(courant, -MOIS_EN_ARRIERE_MAX) ? ' disabled' : ''}>${icone('retour')}</button>
        <h1 class="vue__titre bilan__titre">${echapper(nomMois(mois))}</h1>
        <button class="btn-icone bilan__suivant" type="button" data-mois="1" aria-label="Mois suivant"${mois >= courant ? ' disabled' : ''}>${icone('chevron')}</button>
      </div>
      ${vide ? `<section class="carte vide"><div class="vide__bulle">${icone('feuille')}</div>
        <h2 class="vide__titre">Rien ce mois-ci</h2><p class="vide__texte">Les arrosages, photos et notes du mois apparaîtront ici.</p></section>` : `
      <div class="bilan__tuiles">
        ${tuiles.map(([emoji, n, texte]) => `
          <div class="bilan__tuile${n ? '' : ' bilan__tuile--zero'}">
            <span class="bilan__emoji" aria-hidden="true">${emoji}</span>
            <span class="bilan__nombre">${n}</span>
            <span class="bilan__texte">${echapper(texte)}</span>
          </div>`).join('')}
      </div>
      ${notes.length ? `
        <section class="carte">
          <h2 class="carte__titre">Notes du mois</h2>
          <ul class="bilan__notes">
            ${notes.map((n) => `
              <li><span aria-hidden="true">${iconeNote(n)}</span>
                <span><strong>${echapper(nomPlante.get(n.plante_id) || 'Plante supprimée')}</strong>
                  <span class="bilan__date">${echapper(formaterDate(n.date_note))}</span><br>${echapper(n.texte)}</span></li>`).join('')}
          </ul>
        </section>` : ''}`}`;
  }

  // « onclick » (et non addEventListener) : le conteneur est le meme pour tous les ecrans, les ecouteurs
  // s'empileraient a chaque visite et une seule pression decalerait de plusieurs mois.
  conteneur.onclick = (e) => {
    const b = e.target.closest('[data-mois]');
    if (!b || b.disabled) return;
    moisAffiche = decaler(moisAffiche, Number(b.dataset.mois));
    dessiner();
  };
  dessiner();
}
