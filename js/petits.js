// Petits : boutures et bulbilles rattachees a leur plante mere (fiche de la mere, fiche du petit).
import { lireEtat, trouverPlante, definirEtapeBouture, expliquerErreur } from './donnees.js';
import { photoVignetteHtml, remplirPhotos } from './vues-plantes.js';
import { echapper, formaterDate, dateIsoLocale, joursEntre } from './outils.js';
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

// Carte « Ses petits » (fiche de la mere)
export function initialiserPetits(zone, idMere) {
  const petits = petitsDe(idMere).sort((a, b) => naissance(b).localeCompare(naissance(a)));
  zone.innerHTML = `
    <h2 class="carte__titre">Ses petits${petits.length ? ` · ${petits.length}` : ''}</h2>
    ${petits.length ? `<div class="petits">${petits.map((p) => {
    const etape = etapeDe(p.etape_bouture);
    return `
      <a class="petit" href="#/plantes/${p.id}">
        ${photoVignetteHtml(p, 'petit__photo')}
        <b class="petit__nom">${echapper(p.nom)}</b>
        <small>née ${echapper(ageCourt(naissance(p)))}</small>
        ${etape ? `<span class="etape etape--${etape.id}">${etape.emoji} ${echapper(etape.libelle.toLowerCase())}</span>` : ''}
      </a>`;
  }).join('')}</div>` : '<p class="probleme__vide">Pas encore de petit.</p>'}
    <a class="btn btn--douce btn--espace" href="#/plantes/nouvelle/${idMere}">＋ Ajouter un petit</a>`;
  remplirPhotos(zone);
}

// Bandeau « Petit de ... » en haut de la fiche du petit
export function bandeauPetit(plante) {
  const mere = mereDe(plante);
  if (!mere) return '';
  return `
    <a class="bandeau-petit" href="#/plantes/${mere.id}">
      ${photoVignetteHtml(mere, 'bandeau-petit__photo')}
      <span class="bandeau-petit__texte">
        <small>Petit de</small>
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
      <div class="etapes__donne"><button class="btn-texte" type="button" data-etape="donne" aria-pressed="${donne}">🎁 ${donne ? 'Donnée ✓' : 'Je l\\'ai donnée'}</button></div>
      <p class="etapes__date">Née le ${echapper(formaterDate(naissance(plante)))} · ${jours < 14 ? `${Math.max(jours, 0)} j` : jours < 60 ? `${Math.round(jours / 7)} semaines` : `${Math.round(jours / 30.4)} mois`}</p>`;
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
