// Calcul des rappels d'arrosage. Fonctions simples, sans acces reseau :
// on leur donne les plantes et les arrosages, elles disent ce qu'il y a a faire.
import { dateIsoLocale, ajouterJours, ajouterUnMois, joursEntre, formaterDate } from './outils.js';

const plurielJours = (n) => (n > 1 ? 'jours' : 'jour');

// Quarantaine : un mois a partir de la date d'acquisition. Automatique, rien a cocher.
// Renvoie { fin, restant } tant qu'elle dure (restant = jours avant la fin), sinon null.
export function quarantaine(dateAcquisition, aujourdhui = dateIsoLocale()) {
  if (!dateAcquisition || joursEntre(dateAcquisition, aujourdhui) < 0) return null;
  const fin = ajouterUnMois(dateAcquisition);
  const restant = joursEntre(aujourdhui, fin);
  return restant > 0 ? { fin, restant } : null;
}

// "Quarantaine · 12 j"
export const libelleQuarantaine = ({ restant }) => `Quarantaine · ${restant} j`;

// Dernier jour d'arrosage d'une plante ("2026-11-01") ou null
export function dernierArrosage(idPlante, arrosages) {
  let dernier = null;
  for (const a of arrosages) {
    if (a.plante_id === idPlante && (!dernier || a.jour > dernier)) dernier = a.jour;
  }
  return dernier;
}

// Point de depart du calcul : dernier arrosage, sinon date d'acquisition, sinon jour d'ajout de la plante
function pointDeDepart(plante, dernier) {
  if (dernier) return dernier;
  if (plante.date_acquisition) return plante.date_acquisition;
  return plante.created_at ? dateIsoLocale(new Date(plante.created_at)) : dateIsoLocale();
}

// statut : 'aucun' (pas de rappel) | 'fait' (arrosee aujourd'hui) | 'retard' | 'aujourdhui' | 'bientot' (1 a 3 jours) | 'plustard'
export function etatArrosage(plante, arrosages, aujourdhui = dateIsoLocale()) {
  const dernier = dernierArrosage(plante.id, arrosages);
  if (!plante.arrosage_jours) return { statut: 'aucun', dernier, prochain: null, ecart: null };
  const prochain = ajouterJours(pointDeDepart(plante, dernier), plante.arrosage_jours);
  const ecart = joursEntre(aujourdhui, prochain); // negatif = en retard
  let statut = 'plustard';
  if (dernier === aujourdhui) statut = 'fait';
  else if (ecart < 0) statut = 'retard';
  else if (ecart === 0) statut = 'aujourdhui';
  else if (ecart <= 3) statut = 'bientot';
  return { statut, dernier, prochain, ecart };
}

// "En retard de 3 jours", "Aujourd'hui", "Demain", "Dans 2 jours", ou la date si c'est plus loin
export function libelleEcheance({ statut, ecart, prochain }) {
  if (statut === 'aucun' || ecart == null) return '';
  if (ecart < 0) return `En retard de ${-ecart} ${plurielJours(-ecart)}`;
  if (ecart === 0) return "Aujourd'hui";
  if (ecart === 1) return 'Demain';
  if (ecart <= 14) return `Dans ${ecart} jours`;
  return formaterDate(prochain);
}

// Prochaine dose d'engrais : une date choisie a la main. Meme vocabulaire que l'arrosage.
export function etatEngrais(plante, aujourdhui = dateIsoLocale()) {
  if (!plante.prochain_engrais) return { statut: 'aucun', prochain: null, ecart: null };
  const ecart = joursEntre(aujourdhui, plante.prochain_engrais);
  let statut = 'plustard';
  if (ecart < 0) statut = 'retard';
  else if (ecart === 0) statut = 'aujourdhui';
  else if (ecart <= 3) statut = 'bientot';
  return { statut, prochain: plante.prochain_engrais, ecart };
}

// Range les plantes en listes pour l'ecran "Aujourd'hui"
export function planifier(plantes, arrosages, aujourdhui = dateIsoLocale()) {
  const aFaire = [];
  const faites = [];
  const bientot = [];
  const engraisAFaire = [];
  const engraisBientot = [];
  let avecRappel = 0;
  for (const plante of plantes) {
    if (plante.vendu_le) continue; // plante vendue : plus de rappel
    const engrais = { plante, ...etatEngrais(plante, aujourdhui) };
    if (engrais.statut !== 'aucun') avecRappel++;
    if (engrais.statut === 'retard' || engrais.statut === 'aujourdhui') engraisAFaire.push(engrais);
    else if (engrais.statut === 'bientot') engraisBientot.push(engrais);
    const etat = { plante, ...etatArrosage(plante, arrosages, aujourdhui) };
    if (etat.statut !== 'aucun') avecRappel++;
    if (etat.statut === 'retard' || etat.statut === 'aujourdhui') aFaire.push(etat);
    else if (etat.statut === 'fait') faites.push(etat);
    else if (etat.statut === 'bientot') bientot.push(etat);
  }
  const parNom = (a, b) => a.plante.nom.localeCompare(b.plante.nom, 'fr', { sensitivity: 'base' });
  aFaire.sort((a, b) => (a.ecart - b.ecart) || parNom(a, b)); // les plus en retard d'abord
  bientot.sort((a, b) => (a.ecart - b.ecart) || parNom(a, b));
  faites.sort(parNom);
  engraisAFaire.sort((a, b) => (a.ecart - b.ecart) || parNom(a, b));
  engraisBientot.sort((a, b) => (a.ecart - b.ecart) || parNom(a, b));
  return { aFaire, faites, bientot, engraisAFaire, engraisBientot, avecRappel };
}

// Nombre de choses a faire aujourd'hui (arrosages + engrais) : c'est le chiffre de la pastille
export function compterAFaire(plantes, arrosages, aujourdhui) {
  const { aFaire, engraisAFaire } = planifier(plantes, arrosages, aujourdhui);
  return aFaire.length + engraisAFaire.length;
}
