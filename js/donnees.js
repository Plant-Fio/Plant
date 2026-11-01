// Acces aux donnees (Supabase) + copie gardee sur l'appareil pour consulter hors ligne.
// Les ecrans lisent uniquement cet etat en memoire ; chaque modification passe par ici.
import { supabase } from './client.js';
import { preparerPhoto, envoyerFichiers, supprimerFichiers, viderUrls } from './photos.js';

const CLE_CACHE = 'plantes-cache-v1';
const PIECES_PAR_DEFAUT = ['Salon', 'Chambre', 'Cuisine', 'Salle de bain', 'Bureau', 'Entrée', 'Balcon'];

const etat = {
  pieces: [],
  plantes: [],
  photos: [],
  charge: false,
  horsLigne: false, // true = on affiche la copie locale, la modification est impossible
  userId: null,
};

export const lireEtat = () => etat;
export const trouverPlante = (id) => etat.plantes.find((p) => p.id === id) || null;
export const photosDe = (idPlante) => etat.photos.filter((p) => p.plante_id === idPlante);
// Couverture = la photo choisie, sinon la premiere photo de la plante
export const photoCouverture = (plante) => (plante
  ? photosDe(plante.id).find((p) => p.id === plante.photo_principale_id) || photosDe(plante.id)[0] || null
  : null);
export const trouverPiece = (id) => etat.pieces.find((p) => p.id === id) || null;
export const nomPiece = (id) => trouverPiece(id)?.nom || '';
export const nombrePlantesDans = (idPiece) => etat.plantes.filter((p) => p.piece_id === idPiece).length;

// ---------- Copie locale (localStorage) ----------

function sauvegarderCache() {
  try {
    localStorage.setItem(CLE_CACHE, JSON.stringify({
      userId: etat.userId, pieces: etat.pieces, plantes: etat.plantes, photos: etat.photos,
    }));
  } catch { /* stockage plein ou bloque : pas grave */ }
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
  etat.charge = false;
  etat.horsLigne = false;
  etat.userId = null;
  viderUrls();
  try { localStorage.removeItem(CLE_CACHE); } catch { /* rien a faire */ }
}

// ---------- Tri ----------

const comparerNoms = (a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' });
const trierPlantes = () => etat.plantes.sort(comparerNoms);
const trierPieces = () => etat.pieces.sort((a, b) => (a.position - b.position) || comparerNoms(a, b));

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
    const [pieces, plantes, photos] = await Promise.all([
      supabase.from('pieces').select('*').order('position').order('nom'),
      supabase.from('plantes').select('*').order('nom'),
      supabase.from('photos').select('*').order('created_at'),
    ]);
    if (pieces.error) throw pieces.error;
    if (plantes.error) throw plantes.error;
    if (photos.error) throw photos.error;
    etat.pieces = pieces.data;
    etat.plantes = plantes.data;
    etat.photos = photos.data;
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
    etat.horsLigne = true;
  }
  etat.charge = true;
}

// ---------- Plantes ----------

// Nettoie ce qui vient d'un formulaire : espaces retires, champ vide = rien (null).
function nettoyerPlante(champs) {
  const texte = (v) => (v == null ? null : String(v).trim() || null);
  return {
    nom: texte(champs.nom),
    espece: texte(champs.espece),
    piece_id: champs.piece_id || null,
    date_acquisition: champs.date_acquisition || null,
    notes: texte(champs.notes),
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
  const { data, error } = await supabase.from('photos')
    .insert({ id, plante_id: idPlante, chemin }).select().single();
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

export async function supprimerPhoto(idPhoto) {
  const photo = etat.photos.find((p) => p.id === idPhoto);
  if (!photo) return;
  await supprimerFichiers([photo.chemin]);
  const { error } = await supabase.from('photos').delete().eq('id', idPhoto);
  if (error) throw error;
  etat.photos = etat.photos.filter((p) => p.id !== idPhoto);
  const plante = trouverPlante(photo.plante_id);
  if (plante?.photo_principale_id === idPhoto) {
    // La base remet la couverture a vide ; on passe a la photo suivante s'il en reste une
    const suivante = photosDe(plante.id)[0] || null;
    if (suivante) await definirCouverture(plante.id, suivante.id);
    else etat.plantes = etat.plantes.map((p) => (p.id === plante.id ? { ...p, photo_principale_id: null } : p));
  }
  sauvegarderCache();
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
