// Champ de date en trois menus (Jour / Mois / Annee) : plus fiable que le calendrier du telephone,
// qui demande parfois de choisir le mois et l'annee avant de pouvoir toucher le jour.
// Le champ « vrai » est un <input type="hidden"> (valeur AAAA-MM-JJ) : le reste de l'appli le lit comme avant.
import { echapper } from './outils.js';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const pad = (n) => String(n).padStart(2, '0');
const joursDans = (annee, mois) => new Date(annee, mois, 0).getDate(); // mois de 1 a 12

// min / max : bornes AAAA-MM-JJ (facultatives)
export function champDateHtml({ nom = '', id = '', valeur = '', min = '', max = '', libelle = 'Date', required = false } = {}) {
  const [a, m, j] = /^\d{4}-\d{2}-\d{2}$/.test(valeur) ? valeur.split('-').map(Number) : [0, 0, 0];
  const courante = new Date().getFullYear();
  let fin = max ? Number(max.slice(0, 4)) : courante + 3;
  let debut = min ? Number(min.slice(0, 4)) : courante - 30;
  if (a) { fin = Math.max(fin, a); debut = Math.min(debut, a); }
  const annees = [];
  for (let y = fin; y >= debut; y -= 1) annees.push(y);
  const option = (v, texte, choisi) => `<option value="${v}"${choisi ? ' selected' : ''}>${texte}</option>`;
  const base = id || `date-${nom}`;
  return `
    <div class="date3" data-date3${min ? ` data-min="${echapper(min)}"` : ''}${max ? ` data-max="${echapper(max)}"` : ''}>
      <input type="hidden" ${id ? `id="${echapper(id)}"` : ''} name="${echapper(nom)}" value="${echapper(valeur)}" data-date>
      <select class="champ__input champ__select date3__j" id="${echapper(base)}-j" data-part="j" aria-label="Jour : ${echapper(libelle)}"${required ? ' required' : ''}>
        ${option('', 'Jour', !j)}${Array.from({ length: 31 }, (_, i) => option(i + 1, i + 1, j === i + 1)).join('')}
      </select>
      <select class="champ__input champ__select date3__m" data-part="m" aria-label="Mois : ${echapper(libelle)}">
        ${option('', 'Mois', !m)}${MOIS.map((nomMois, i) => option(i + 1, nomMois, m === i + 1)).join('')}
      </select>
      <select class="champ__input champ__select date3__a" data-part="a" aria-label="Année : ${echapper(libelle)}">
        ${option('', 'Année', !a)}${annees.map((y) => option(y, y, a === y)).join('')}
      </select>
    </div>`;
}

// Affiche dans les menus la valeur du champ cache (apres un « Supprimer la date », par exemple)
export function synchroniserDate(champ) {
  const racine = champ.closest('[data-date3]');
  if (!racine) return;
  const [a, m, j] = /^\d{4}-\d{2}-\d{2}$/.test(champ.value) ? champ.value.split('-').map(Number) : ['', '', ''];
  racine.querySelector('[data-part="a"]').value = String(a);
  racine.querySelector('[data-part="m"]').value = String(m);
  racine.querySelector('[data-part="j"]').value = String(j);
}

// A appeler une fois sur un conteneur : met a jour le champ cache quand on touche un menu,
// puis lui fait envoyer un evenement « change » (les formulaires l'ecoutent comme celui d'une vraie date).
export function lierChampsDate(racineDom) {
  racineDom.addEventListener('change', (e) => {
    const menu = e.target.closest?.('[data-date3] select');
    if (!menu) return;
    const boite = menu.closest('[data-date3]');
    const champ = boite.querySelector('input[data-date]');
    const val = (p) => Number(boite.querySelector(`[data-part="${p}"]`).value) || 0;
    let [a, m, j] = [val('a'), val('m'), val('j')];
    if (a && m && j) {
      j = Math.min(j, joursDans(a, m)); // 31 fevrier -> 28 ou 29
      boite.querySelector('[data-part="j"]').value = String(j);
      let iso = `${a}-${pad(m)}-${pad(j)}`;
      const { min, max } = boite.dataset;
      if (min && iso < min) iso = min;
      if (max && iso > max) iso = max;
      if (iso !== `${a}-${pad(m)}-${pad(j)}`) { champ.value = iso; synchroniserDate(champ); } else champ.value = iso;
    } else {
      champ.value = '';
    }
    champ.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
