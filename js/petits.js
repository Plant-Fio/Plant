// Petits : boutures et bulbilles rattachees a leur plante mere (fiche de la mere, fiche du petit).
import { lireEtat, trouverPlante, nomPiece, definirEtapeBouture, rattacherPetit, expliquerErreur } from './donnees.js';
import { photoVignetteHtml, remplirPhotos } from './vues-plantes.js';
import { echapper, normaliser, formaterDate, dateIsoLocale, joursEntre } from './outils.js';
import { message } from './dialogues.js';

export const ETAPES = [
  { id: 'preleve', emoji: '✂️', libelle: 'Prélevé' },
  { id: 'eau', emoji: '💧', libelle: "Dans l'eau" },
  { id: 'terre', emoji: '🌱', libelle: 'En terre' },
  { id: 'adopte', emoji: '🪴', libelle: 'Adopté' },
  { id: 'donne', emoji: '🎁', libelle: 'Donné' },
];
const etapeDe = (id) => ETAPES.find((e) => e.id === id) || null;

export const petitsDe = (idMere) => lireEtat().plantes.filter((p) => p.mere_id === idMere);
export const mereDe = (plante) => (plante?.mere_id ? trouverPlante(plante.mere_id) : null);

// "il y a 5 j", "il y a 3 sem.", "il y a 2 mois", "il y a 1 an"
function ageCourt(iso) {
  const jours = joursEntre(iso, dateIsoLocale());
  if (jours < 1) return "aujourd'hui";
  if (jours < 14) return `il y a ${jours} j`;
  if (jours < 60) return `il y a ${Math.round(jours / 7)} sem.`;
  if (jours < 730) return `il y a ${Math.round(jours / 30.4)} mois`;
  return `il y a ${Math.round(jours / 365)} an${jours >= 1095 ? 's' : ''}`;
}
const naissance = (p) => p.date_bouture || String(p.created_at || '').slice(0, 10) || dateIsoLocale();

// Carte « Ses babies » (fiche de la mere)
export function initialiserPetits(zone, idMere) {
  const petits = petitsDe(idMere).sort((a, b) => naissance(b).localeCompare(naissance(a)));
  zone.innerHTML = `
    <h2 class="carte__titre">Ses babies${petits.length ? ` · ${petits.length}` : ''}</h2>
    ${petits.length ? `<div class="petits">${petits.map((p) => {
    const etape = etapeDe(p.etape_bouture);
    return `
      <a class="petit" href="#/plantes/${p.id}">
        ${photoVignetteHtml(p, 'petit__photo')}
        <b class="petit__nom">${echapper(p.nom)}</b>
        <small>née ${echapper(ageCourt(naissance(p)))}</small>
        ${etape ? `<span class="etape etape--${etape.id}">${etape.emoji} ${echapper(etape.libelle.toLowerCase())}</span>` : ''}
      </a>`;
  }).join('')}</div>` : '<p class="probleme__vide">Pas encore de baby.</p>'}
    <div class="petits__actions">
      <a class="btn btn--douce btn--espace" href="#/plantes/nouvelle/${idMere}">＋ Nouveau baby</a>
      <button class="btn btn--douce btn--espace" type="button" data-rattacher>🔗 Rattacher un baby</button>
    </div>
    <div class="mere-liste" data-rattacher-liste hidden>
      <input class="champ__input" type="search" data-rattacher-recherche placeholder="Chercher une plante…" autocomplete="off">
      <div class="mere-liste__lignes" data-rattacher-lignes></div>
    </div>`;
  remplirPhotos(zone);

  // Rattacher une plante existante : on choisit dans la liste (photo, nom, espece, piece)
  const mere = trouverPlante(idMere);
  const liste = zone.querySelector('[data-rattacher-liste]');
  const lignes = zone.querySelector('[data-rattacher-lignes]');
  const recherche = zone.querySelector('[data-rattacher-recherche]');
  const detail = (p) => [p.espece, p.piece_id ? nomPiece(p.piece_id) : ''].filter(Boolean).join(' · ');
  function afficher() {
    const q = normaliser(recherche.value);
    const candidates = lireEtat().plantes.filter((p) => p.id !== idMere && p.id !== mere?.mere_id && p.mere_id !== idMere
      && (!q || normaliser(`${p.nom} ${p.espece || ''}`).includes(q)));
    lignes.innerHTML = candidates.length ? candidates.map((p) => `
      <button class="mere-ligne" type="button" data-petit-id="${p.id}">
        ${photoVignetteHtml(p, 'mere-ligne__photo')}
        <span class="mere-ligne__texte"><strong>${echapper(p.nom)}</strong><small>${echapper(detail(p))}</small></span>
      </button>`).join('') : '<p class="aide">Aucune plante trouvée.</p>';
    remplirPhotos(lignes);
  }
  recherche.addEventListener('input', afficher);
  zone.querySelector('[data-rattacher]').addEventListener('click', () => {
    liste.hidden = !liste.hidden;
    if (!liste.hidden) { recherche.value = ''; afficher(); }
  });
  lignes.addEventListener('click', async (e) => {
    const ligne = e.target.closest('[data-petit-id]');
    if (!ligne) return;
    try {
      await rattacherPetit(ligne.dataset.petitId, idMere);
      message('Plante rattachée');
      initialiserPetits(zone, idMere);
    } catch (erreur) {
      message(expliquerErreur(erreur), 'erreur');
    }
  });
}

// Bandeau « Petit de ... » en haut de la fiche du petit
export function bandeauPetit(plante) {
  const mere = mereDe(plante);
  if (!mere) return '';
  return `
    <a class="bandeau-petit" href="#/plantes/${mere.id}">
      ${photoVignetteHtml(mere, 'bandeau-petit__photo')}
      <span class="bandeau-petit__texte">
        <small>Baby de</small>
        <b>🌿 ${echapper(mere.nom)}</b>
        <small class="bandeau-petit__lien">Voir la maman ›</small>
      </span>
    </a>`;
}

// Carte « Sa croissance » : les etapes de la bouture, on touche pour changer
export function initialiserCroissance(zone, idPlante) {
  function dessiner() {
    const plante = trouverPlante(idPlante);
    if (!plante) return;
    const etapes = ETAPES.slice(0, 4);
    const actuelle = plante.etape_bouture;
    const rang = etapes.findIndex((e) => e.id === actuelle);
    const donne = actuelle === 'donne';
    const jours = joursEntre(naissance(plante), dateIsoLocale());
    zone.innerHTML = `
      <h2 class="carte__titre">Sa croissance</h2>
      <div class="etapes" role="group" aria-label="Étape de la bouture">
        ${etapes.map((e, i) => `
          ${i ? `<span class="etapes__trait${i <= rang ? ' etapes__trait--on' : ''}"></span>` : ''}
          <button class="etapes__pas${i <= rang ? ' etapes__pas--on' : ''}" type="button" data-etape="${e.id}" aria-pressed="${e.id === actuelle}">
            <i>${e.emoji}</i>${echapper(e.libelle)}</button>`).join('')}
      </div>
      <div class="etapes__donne"><button class="btn-texte" type="button" data-etape="donne" aria-pressed="${donne}">🎁 ${donne ? 'Donnée ✓' : "Je l'ai donnée"}</button></div>
      <p class="etapes__date">${jours < 1 ? `Née aujourd'hui, le ${echapper(formaterDate(naissance(plante)))}` : `Née le ${echapper(formaterDate(naissance(plante)))} · ${jours < 14 ? `${jours} j` : jours < 60 ? `${Math.round(jours / 7)} semaines` : `${Math.round(jours / 30.4)} mois`}`}</p>`;
  }
  zone.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-etape]');
    if (!b) return;
    try {
      await definirEtapeBouture(idPlante, b.dataset.etape);
      dessiner();
    } catch (erreur) {
      message(expliquerErreur(erreur), 'erreur');
    }
  });
  dessiner();
}
