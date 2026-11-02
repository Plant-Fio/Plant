// Acces aux donnees (Supabase) + copie gardee sur l'appareil pour consulter hors ligne.
// Les ecrans lisent uniquement cet etat en memoire ; chaque modification passe par ici.
import { supabase } from './client.js';
import { preparerPhoto, envoyerFichiers, supprimerFichiers, viderUrls } from './photos.js';
import { dateIsoLocale, ajouterJours } from './outils.js';

const CLE_CACHE = 'plantes-cache-v1';
const PIECES_PAR_DEFAUT = ['Salon', 'Chambre', 'Cuisine', 'Salle de bain', 'Bureau', 'Entrée', 'Balcon'];

const etat = {
  pieces: [],
  plantes: [],
  photos: [],
  arrosages: [], // historique des 180 derniers jours
  souhaits: [], // liste de souhaits
  taches: [], // petites taches libres (ecran Aujourd'hui)
  journal: [], // notes datees des plantes (fiche)
  problemes: [], // parasites, maladies : en cours ou resolus
  charge: false,
  horsLigne: false, // true = on affiche la copie locale, la modification est impossible
  userId: null,
};

export const lireEtat = () => etat;
export const trouverPlante = (id) => etat.plantes.find((p) => p.id === id) || null;
// Date d'une photo (repli sur le jour d'envoi pour une copie locale ancienne)
// Numero de teinte (0 a 4) d'une piece, stable : selon l'ordre de creation des pieces.
// Sert au theme Fleuriste (une couleur pastel par piece) ; les autres themes l'ignorent.
export function teintePiece(idPiece) {
  if (!idPiece) return '';
  const ordre = [...etat.pieces].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id));
  const rang = ordre.findIndex((p) => p.id === idPiece);
  return rang < 0 ? '' : String(rang % 5);
}

export const datePhoto = (photo) => photo.date_photo || String(photo.created_at || '').slice(0, 10);
// Photos d'une plante de la plus ancienne a la plus recente (selon leur date, modifiable)
export const photosDe = (idPlante) => etat.photos
  .filter((p) => p.plante_id === idPlante)
  .sort((a, b) => datePhoto(a).localeCompare(datePhoto(b)) || String(a.created_at).localeCompare(String(b.created_at)));
// Couverture = la photo choisie, sinon la premiere photo de la plante
export const photoCouverture = (plante) => (plante
  ? photosDe(plante.id).find((p) => p.id === plante.photo_principale_id) || photosDe(plante.id)[0] || null
  : null);
export const trouverSouhait = (id) => etat.souhaits.find((s) => s.id === id) || null;
export const journalDe = (idPlante) => etat.journal.filter((n) => n.plante_id === idPlante);
export const problemesDe = (idPlante) => etat.problemes.filter((q) => q.plante_id === idPlante);
export const arrosagesDe = (idPlante) => etat.arrosages
  .filter((a) => a.plante_id === idPlante)
  .sort((a, b) => b.jour.localeCompare(a.jour));
export const trouverPiece = (id) => etat.pieces.find((p) => p.id === id) || null;
// Piece ou elle met le plus de plantes (proposee d'office pour une nouvelle plante), ou '' s'il n'y en a pas
export function pieceLaPlusUtilisee() {
  const compte = new Map();
  for (const plante of etat.plantes) {
    if (plante.piece_id && trouverPiece(plante.piece_id)) compte.set(plante.piece_id, (compte.get(plante.piece_id) || 0) + 1);
  }
  let meilleure = '';
  let max = 0;
  for (const piece of etat.pieces) { // ordre alphabetique : en cas d'egalite, la premiere gagne
    if ((compte.get(piece.id) || 0) > max) { meilleure = piece.id; max = compte.get(piece.id); }
  }
  return meilleure;
}
export const nomPiece = (id) => trouverPiece(id)?.nom || '';
export const nombrePlantesDans = (idPiece) => etat.plantes.filter((p) => p.piece_id === idPiece).length;

// ---------- Copie locale (localStorage) ----------

function sauvegarderCache() {
  try {
    localStorage.setItem(CLE_CACHE, JSON.stringify({
      userId: etat.userId, pieces: etat.pieces, plantes: etat.plantes, photos: etat.photos,
      arrosages: etat.arrosages, souhaits: etat.souhaits, taches: etat.taches, journal: etat.journal, problemes: etat.problemes,
    }));
  } catch { /* stockage plein ou bloque : pas grave */ }
  // Previent l'appli (pastille de l'onglet "Aujourd'hui", etc.) que les donnees ont change
  window.dispatchEvent(new Event('donnees-modifiees'));
}

function lireCache(userId) {
  try {
    const cache = JSON.parse(localStorage.getItem(CLE_CACHE));
    return cache && cache.userId === userId ? cache : null;
  } catch {
    return null;
  }
}

// A appeler a la deconnexion : la copie des donnees ne doit pas rester sur l'appareil.
export function viderEtat() {
  etat.pieces = [];
  etat.plantes = [];
  etat.photos = [];
  etat.arrosages = [];
  etat.souhaits = [];
  etat.taches = [];
  etat.journal = [];
  etat.problemes = [];
  etat.charge = false;
  etat.horsLigne = false;
  etat.userId = null;
  viderUrls();
  try { localStorage.removeItem(CLE_CACHE); } catch { /* rien a faire */ }
}

// ---------- Tri ----------

const comparerNoms = (a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' });
const trierPlantes = () => etat.plantes.sort(comparerNoms);
// Pieces classees de A a Z (la colonne "position" de la base n'est plus utilisee)
const trierPieces = () => etat.pieces.sort(comparerNoms);

// ---------- Chargement ----------

async function creerPiecesParDefaut() {
  const lignes = PIECES_PAR_DEFAUT.map((nom, i) => ({ nom, position: i }));
  const { data, error } = await supabase.from('pieces').insert(lignes).select();
  if (error) return; // on retentera a la prochaine ouverture
  etat.pieces = data;
  // On le note une fois pour toutes : si elle supprime tout expres, on ne recree rien.
  await supabase.auth.updateUser({ data: { pieces_initialisees: true } });
}

export async function charger(session) {
  etat.userId = session.user.id;
  try {
    // On ne charge que les 180 derniers jours (et 1000 lignes au maximum, limite de Supabase)
    const depuis = ajouterJours(dateIsoLocale(), -180);
    const [pieces, plantes, photos, arrosages, souhaits, taches, journal, problemes] = await Promise.all([
      supabase.from('pieces').select('*').order('position').order('nom'),
      supabase.from('plantes').select('*').order('nom'),
      supabase.from('photos').select('*').order('created_at'),
      supabase.from('arrosages').select('*').gte('jour', depuis).order('jour', { ascending: false }).limit(1000),
      supabase.from('souhaits').select('*').order('created_at', { ascending: false }),
      supabase.from('taches').select('*').order('created_at'),
      supabase.from('journal').select('*').order('date_note', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('problemes').select('*').order('debut', { ascending: false }).order('created_at', { ascending: false }),
    ]);
    if (pieces.error) throw pieces.error;
    if (plantes.error) throw plantes.error;
    if (photos.error) throw photos.error;
    if (arrosages.error) throw arrosages.error;
    if (souhaits.error) throw souhaits.error;
    if (taches.error) throw taches.error;
    etat.pieces = pieces.data;
    etat.plantes = plantes.data;
    etat.photos = photos.data;
    etat.arrosages = arrosages.data;
    etat.souhaits = souhaits.data;
    etat.taches = taches.data;
    etat.journal = journal.error ? [] : journal.data; // le journal ne doit jamais bloquer le reste de l'appli
    etat.problemes = problemes.error ? [] : problemes.data;
    etat.horsLigne = false;
    if (!etat.pieces.length && !session.user.user_metadata?.pieces_initialisees) {
      await creerPiecesParDefaut();
    }
    trierPieces();
    trierPlantes();
    sauvegarderCache();
  } catch (erreur) {
    const cache = lireCache(etat.userId);
    if (!cache) throw erreur;
    etat.pieces = cache.pieces;
    etat.plantes = cache.plantes;
    etat.photos = cache.photos || [];
    etat.arrosages = cache.arrosages || [];
    etat.souhaits = cache.souhaits || [];
    etat.taches = cache.taches || [];
    etat.journal = cache.journal || [];
    etat.problemes = cache.problemes || [];
    etat.horsLigne = true;
  }
  etat.charge = true;
}

// ---------- Plantes ----------

// Nettoie ce qui vient d'un formulaire : espaces retires, champ vide = rien (null).
function nettoyerPlante(champs) {
  const entier = (v) => {
    const n = Number.parseInt(v, 10);
    return Number.isInteger(n) ? n : null;
  };
  const texte = (v) => (v == null ? null : String(v).trim() || null);
  return {
    nom: texte(champs.nom),
    espece: texte(champs.espece),
    piece_id: champs.piece_id || null,
    date_acquisition: champs.date_acquisition || null,
    notes: texte(champs.notes),
    arrosage_jours: entier(champs.arrosage_jours),
    dernier_engrais: champs.dernier_engrais || null,
    dernier_rempotage: champs.dernier_rempotage || null,
    // L'ancien champ « derniere_feuille » n'est plus affiche (le journal le remplace) : on ne l'efface pas
    ...(champs.derniere_feuille !== undefined ? { derniere_feuille: champs.derniere_feuille || null } : {}),
    prochain_engrais: champs.prochain_engrais || null,
    en_vente: champs.en_vente === true || champs.en_vente === 'on',
  };
}

export async function creerPlante(champs) {
  const { data, error } = await supabase.from('plantes').insert(nettoyerPlante(champs)).select().single();
  if (error) throw error;
  etat.plantes.push(data);
  trierPlantes();
  sauvegarderCache();
  return data;
}

export async function modifierPlante(id, champs) {
  const { data, error } = await supabase.from('plantes')
    .update({ ...nettoyerPlante(champs), updated_at: new Date().toISOString() })
    .eq('id', id).select().single();
  if (error) throw error;
  etat.plantes = etat.plantes.map((p) => (p.id === id ? data : p));
  trierPlantes();
  sauvegarderCache();
  return data;
}

export async function supprimerPlante(id) {
  // Les lignes "photos" partent toutes seules avec la plante, mais pas les fichiers du bucket :
  // on les supprime d'abord, pour ne laisser aucun fichier orphelin.
  await supprimerFichiers(photosDe(id).map((p) => p.chemin));
  const { error } = await supabase.from('plantes').delete().eq('id', id);
  if (error) throw error;
  etat.plantes = etat.plantes.filter((p) => p.id !== id);
  etat.photos = etat.photos.filter((p) => p.plante_id !== id);
  etat.arrosages = etat.arrosages.filter((a) => a.plante_id !== id); // supprimes aussi par la base
  etat.journal = etat.journal.filter((n) => n.plante_id !== id);
  etat.problemes = etat.problemes.filter((q) => q.plante_id !== id);
  sauvegarderCache();
}

// ---------- Soins : arrosages, engrais, rempotage ----------

// Note un arrosage (par defaut aujourd'hui). Deja note ce jour-la : on ne fait rien de plus.
export async function arroserPlante(idPlante, jour = dateIsoLocale()) {
  const { data, error } = await supabase.from('arrosages')
    .insert({ plante_id: idPlante, jour }).select().single();
  if (error && error.code !== '23505') throw error;
  let ligne = data;
  if (error) { // deja note (autre appareil, double clic...) : on recupere la ligne existante
    const existant = await supabase.from('arrosages').select('*')
      .eq('plante_id', idPlante).eq('jour', jour).maybeSingle();
    if (existant.error) throw existant.error;
    ligne = existant.data;
  }
  if (ligne && !etat.arrosages.some((a) => a.id === ligne.id)) etat.arrosages.push(ligne);
  sauvegarderCache();
  return ligne;
}

export async function annulerArrosage(idArrosage) {
  const { error } = await supabase.from('arrosages').delete().eq('id', idArrosage);
  if (error) throw error;
  etat.arrosages = etat.arrosages.filter((a) => a.id !== idArrosage);
  sauvegarderCache();
}

// champ : 'dernier_engrais' ou 'dernier_rempotage'
export async function marquerFait(idPlante, champ, jour = dateIsoLocale()) {
  const { data, error } = await supabase.from('plantes')
    // Engrais fait : la prochaine dose est effacee (a elle d'en choisir une nouvelle)
    .update({ [champ]: jour, ...(champ === 'dernier_engrais' ? { prochain_engrais: null } : {}), updated_at: new Date().toISOString() })
    .eq('id', idPlante).select().single();
  if (error) throw error;
  etat.plantes = etat.plantes.map((p) => (p.id === idPlante ? data : p));
  sauvegarderCache();
}

// ---------- Photos ----------

export async function definirCouverture(idPlante, idPhoto) {
  const { data, error } = await supabase.from('plantes')
    .update({ photo_principale_id: idPhoto, updated_at: new Date().toISOString() })
    .eq('id', idPlante).select().single();
  if (error) throw error;
  etat.plantes = etat.plantes.map((p) => (p.id === idPlante ? data : p));
  sauvegarderCache();
}

// Compresse, envoie les deux fichiers, enregistre la photo. La premiere devient la couverture.
export async function ajouterPhoto(idPlante, fichier) {
  const prepares = await preparerPhoto(fichier);
  const id = crypto.randomUUID();
  const chemin = `${etat.userId}/${idPlante}/${id}.jpg`;
  await envoyerFichiers(chemin, prepares);
  // Date de la photo : celle du fichier (photo prise ce jour-la), sinon aujourd'hui. Modifiable ensuite.
  const modifiee = fichier.lastModified ? dateIsoLocale(new Date(fichier.lastModified)) : dateIsoLocale();
  const date = modifiee > dateIsoLocale() || modifiee < '2000-01-01' ? dateIsoLocale() : modifiee;
  const { data, error } = await supabase.from('photos')
    .insert({ id, plante_id: idPlante, chemin, date_photo: date }).select().single();
  if (error) {
    await supprimerFichiers([chemin]).catch(() => {});
    throw error;
  }
  etat.photos.push(data);
  const plante = trouverPlante(idPlante);
  if (plante && !plante.photo_principale_id) await definirCouverture(idPlante, data.id);
  sauvegarderCache();
  return data;
}

export async function modifierDatePhoto(idPhoto, date) {
  const { data, error } = await supabase.from('photos').update({ date_photo: date }).eq('id', idPhoto).select().single();
  if (error) throw error;
  etat.photos = etat.photos.map((p) => (p.id === idPhoto ? data : p));
  sauvegarderCache();
}

export async function supprimerPhoto(idPhoto) {
  const photo = etat.photos.find((p) => p.id === idPhoto);
  if (!photo) return;
  await supprimerFichiers([photo.chemin]);
  const { error } = await supabase.from('photos').delete().eq('id', idPhoto);
  if (error) throw error;
  etat.photos = etat.photos.filter((p) => p.id !== idPhoto);
  etat.journal = etat.journal.map((n) => (n.photo_id === idPhoto ? { ...n, photo_id: null } : n)); // la base fait pareil
  const plante = trouverPlante(photo.plante_id);
  if (plante?.photo_principale_id === idPhoto) {
    // La base remet la couverture a vide ; on passe a la photo suivante s'il en reste une
    const suivante = photosDe(plante.id)[0] || null;
    if (suivante) await definirCouverture(plante.id, suivante.id);
    else etat.plantes = etat.plantes.map((p) => (p.id === plante.id ? { ...p, photo_principale_id: null } : p));
  }
  sauvegarderCache();
}

// ---------- Liste de souhaits ----------
// La photo d'inspiration est stockee comme celles des plantes (2 fichiers JPEG), dans <utilisatrice>/souhaits/.

function nettoyerSouhait(champs) {
  const texte = (v) => (v == null ? null : String(v).trim() || null);
  return { nom: texte(champs.nom), espece: texte(champs.espece), note: texte(champs.note) };
}

async function envoyerPhotoSouhait(fichier) {
  const prepares = await preparerPhoto(fichier);
  const chemin = `${etat.userId}/souhaits/${crypto.randomUUID()}.jpg`;
  await envoyerFichiers(chemin, prepares);
  return chemin;
}

export async function creerSouhait(champs, fichier = null) {
  const chemin = fichier ? await envoyerPhotoSouhait(fichier) : null;
  const { data, error } = await supabase.from('souhaits')
    .insert({ ...nettoyerSouhait(champs), photo_chemin: chemin }).select().single();
  if (error) {
    if (chemin) await supprimerFichiers([chemin]).catch(() => {});
    throw error;
  }
  etat.souhaits.unshift(data);
  sauvegarderCache();
  return data;
}

// photo : { fichier } pour remplacer la photo, { retirer: true } pour l'enlever
export async function modifierSouhait(id, champs, photo = {}) {
  const actuel = trouverSouhait(id);
  let chemin = actuel?.photo_chemin ?? null;
  let nouveau = null;
  let aSupprimer = null;
  if (photo.fichier) {
    nouveau = await envoyerPhotoSouhait(photo.fichier);
    aSupprimer = chemin;
    chemin = nouveau;
  } else if (photo.retirer && chemin) {
    aSupprimer = chemin;
    chemin = null;
  }
  const { data, error } = await supabase.from('souhaits')
    .update({ ...nettoyerSouhait(champs), photo_chemin: chemin }).eq('id', id).select().single();
  if (error) {
    if (nouveau) await supprimerFichiers([nouveau]).catch(() => {});
    throw error;
  }
  etat.souhaits = etat.souhaits.map((s) => (s.id === id ? data : s));
  if (aSupprimer) await supprimerFichiers([aSupprimer]).catch(() => {});
  sauvegarderCache();
  return data;
}

export async function supprimerSouhait(id) {
  const souhait = trouverSouhait(id);
  if (souhait?.photo_chemin) await supprimerFichiers([souhait.photo_chemin]);
  const { error } = await supabase.from('souhaits').delete().eq('id', id);
  if (error) throw error;
  etat.souhaits = etat.souhaits.filter((s) => s.id !== id);
  sauvegarderCache();
}

// "Je l'ai !" : le souhait devient une vraie plante. La photo d'inspiration devient sa premiere photo
// (les fichiers ne bougent pas : on les rattache simplement a la plante).
export async function realiserSouhait(id) {
  const souhait = trouverSouhait(id);
  if (!souhait) throw new Error('Souhait introuvable');
  const plante = await creerPlante({
    nom: souhait.nom, espece: souhait.espece, notes: souhait.note, date_acquisition: dateIsoLocale(),
  });
  if (souhait.photo_chemin) {
    const { data, error } = await supabase.from('photos')
      .insert({ id: crypto.randomUUID(), plante_id: plante.id, chemin: souhait.photo_chemin }).select().single();
    if (error) throw error;
    etat.photos.push(data);
    await definirCouverture(plante.id, data.id);
  }
  const { error } = await supabase.from('souhaits').delete().eq('id', id);
  if (error) throw error;
  etat.souhaits = etat.souhaits.filter((s) => s.id !== id);
  sauvegarderCache();
  return plante;
}

// ---------- Pieces ----------

export async function creerPiece(nom) {
  const position = etat.pieces.reduce((max, p) => Math.max(max, p.position), -1) + 1;
  const { data, error } = await supabase.from('pieces').insert({ nom: nom.trim(), position }).select().single();
  if (error) throw error;
  etat.pieces.push(data);
  trierPieces();
  sauvegarderCache();
  return data;
}

export async function renommerPiece(id, nom) {
  const { data, error } = await supabase.from('pieces').update({ nom: nom.trim() }).eq('id', id).select().single();
  if (error) throw error;
  etat.pieces = etat.pieces.map((p) => (p.id === id ? data : p));
  trierPieces();
  sauvegarderCache();
}

export async function supprimerPiece(id) {
  const { error } = await supabase.from('pieces').delete().eq('id', id);
  if (error) throw error;
  etat.pieces = etat.pieces.filter((p) => p.id !== id);
  // La base met piece_id a vide pour les plantes de cette piece : on fait pareil ici.
  etat.plantes = etat.plantes.map((p) => (p.piece_id === id ? { ...p, piece_id: null } : p));
  sauvegarderCache();
}

// Transforme une erreur technique en phrase claire pour l'utilisatrice.
export function expliquerErreur(erreur) {
  if (erreur?.code === '23505') return 'Cette pièce existe déjà.';
  if (erreur?.code === 'PHOTO_ILLISIBLE') return "Cette photo n'a pas pu être lue. Essaie une autre image.";
  if (!navigator.onLine || erreur?.name === 'AuthRetryableFetchError' || /fetch|network/i.test(String(erreur?.message))) {
    return 'Impossible de joindre le serveur. Vérifie ta connexion internet.';
  }
  return "Une erreur est survenue. Réessaie dans un instant.";
}

// ---------- Taches libres (ecran Aujourd'hui) ----------
// "Vaporiser les plantes du salon" : une tache reste la tant qu'elle n'est pas cochee ;
// cochee (fait_le = jour), elle reste visible ce jour-la puis disparait.

// pourLe : jour prevu ("2026-11-02"), ou null pour "des maintenant"
export async function creerTache(texte, pourLe = null) {
  const { data, error } = await supabase.from('taches')
    .insert({ texte: String(texte).trim().slice(0, 120), pour_le: pourLe }).select().single();
  if (error) throw error;
  etat.taches.push(data);
  sauvegarderCache();
  return data;
}

// jour = date du jour pour cocher, null pour decocher
export async function marquerTache(id, jour) {
  const { data, error } = await supabase.from('taches').update({ fait_le: jour }).eq('id', id).select().single();
  if (error) throw error;
  etat.taches = etat.taches.map((t) => (t.id === id ? data : t));
  sauvegarderCache();
  return data;
}

export async function supprimerTache(id) {
  const { error } = await supabase.from('taches').delete().eq('id', id);
  if (error) throw error;
  etat.taches = etat.taches.filter((t) => t.id !== id);
  sauvegarderCache();
}

// ---------- Journal de la plante ----------
// Une note = un texte + la date du jour, avec (si on veut) une photo. La photo rejoint la galerie
// de la plante comme les autres (compressee pareil) ; supprimer la note ne supprime pas la photo.
export async function ajouterNote(idPlante, texte, fichier = null) {
  let idPhoto = null;
  if (fichier) idPhoto = (await ajouterPhoto(idPlante, fichier)).id;
  const { data, error } = await supabase.from('journal')
    .insert({ plante_id: idPlante, texte, date_note: dateIsoLocale(), photo_id: idPhoto }).select().single();
  if (error) throw error;
  etat.journal = [data, ...etat.journal];
  sauvegarderCache();
  return data;
}

export async function supprimerNote(idNote) {
  const { error } = await supabase.from('journal').delete().eq('id', idNote);
  if (error) throw error;
  etat.journal = etat.journal.filter((n) => n.id !== idNote);
  sauvegarderCache();
}

// ---------- Suivi des problemes (parasites, maladies) ----------
// relanceJours : dans combien de jours refaire le traitement (null = pas de relance)
export async function creerProbleme(idPlante, { type, note, relanceJours }) {
  const aujourdhui = dateIsoLocale();
  const { data, error } = await supabase.from('problemes').insert({
    plante_id: idPlante, type, note: note || null, debut: aujourdhui,
    relance_le: relanceJours ? ajouterJours(aujourdhui, relanceJours) : null,
  }).select().single();
  if (error) throw error;
  etat.problemes = [data, ...etat.problemes];
  sauvegarderCache();
  return data;
}

async function majProbleme(id, champs) {
  const { data, error } = await supabase.from('problemes').update(champs).eq('id', id).select().single();
  if (error) throw error;
  etat.problemes = etat.problemes.map((q) => (q.id === id ? data : q));
  sauvegarderCache();
}

// "Traite" : le traitement vient d'etre fait, prochaine relance dans N jours
export const traiterProbleme = (id, jours = 7) => majProbleme(id, { relance_le: ajouterJours(dateIsoLocale(), jours) });
export const resoudreProbleme = (id) => majProbleme(id, { resolu_le: dateIsoLocale(), relance_le: null });
export const rouvrirProbleme = (id) => majProbleme(id, { resolu_le: null });

export async function supprimerProbleme(id) {
  const { error } = await supabase.from('problemes').delete().eq('id', id);
  if (error) throw error;
  etat.problemes = etat.problemes.filter((q) => q.id !== id);
  sauvegarderCache();
}
