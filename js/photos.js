// Photos : compression sur l'appareil avant envoi, envoi / suppression dans le bucket prive,
// et adresses temporaires ("signed URLs") pour les afficher.
//
// Pour chaque photo on envoie DEUX fichiers JPEG :
//   <utilisateur>/<plante>/<id>.jpg     la grande (1600 px max) pour la fiche
//   <utilisateur>/<plante>/<id>_t.jpg   la vignette (400 px max) pour la liste, legere a charger
import { supabase } from './client.js';

const COTE_GRANDE = 1600;
const COTE_VIGNETTE = 400;
const DUREE_URL = 3600; // une heure

export const cheminVignette = (chemin) => chemin.replace(/\.jpg$/, '_t.jpg');

// ---------- Compression ----------

function redimensionner(image, coteMax, qualite) {
  const largeur = image.naturalWidth;
  const hauteur = image.naturalHeight;
  // Jamais d'agrandissement : une petite image reste petite
  const echelle = Math.min(1, coteMax / Math.max(largeur, hauteur));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(largeur * echelle));
  canvas.height = Math.max(1, Math.round(hauteur * echelle));
  const contexte = canvas.getContext('2d');
  contexte.fillStyle = '#ffffff'; // fond blanc : un PNG transparent ne devient pas noir en JPEG
  contexte.fillRect(0, 0, canvas.width, canvas.height);
  contexte.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      // Safari garde la memoire des canvas : on les vide explicitement
      canvas.width = 0;
      canvas.height = 0;
      if (blob) resolve(blob);
      else reject(new Error('Compression impossible'));
    }, 'image/jpeg', qualite);
  });
}

// Lit la photo choisie et renvoie { grande, vignette } (deux Blob JPEG).
// Le navigateur applique tout seul l'orientation de l'iPhone (EXIF) quand il dessine l'image.
export async function preparerPhoto(fichier) {
  const adresse = URL.createObjectURL(fichier);
  try {
    const image = new Image();
    image.src = adresse;
    try {
      await image.decode();
    } catch {
      const erreur = new Error('Photo illisible');
      erreur.code = 'PHOTO_ILLISIBLE';
      throw erreur;
    }
    const grande = await redimensionner(image, COTE_GRANDE, 0.82);
    const vignette = await redimensionner(image, COTE_VIGNETTE, 0.78);
    return { grande, vignette };
  } finally {
    URL.revokeObjectURL(adresse);
  }
}

// ---------- Stockage ----------

export async function envoyerFichiers(chemin, { grande, vignette }) {
  const bucket = supabase.storage.from('photos');
  const options = { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false };
  const premier = await bucket.upload(chemin, grande, options);
  if (premier.error) throw premier.error;
  const second = await bucket.upload(cheminVignette(chemin), vignette, options);
  if (second.error) {
    await bucket.remove([chemin]); // on ne laisse pas un fichier orphelin
    throw second.error;
  }
}

export async function supprimerFichiers(chemins) {
  const tous = chemins.flatMap((chemin) => [chemin, cheminVignette(chemin)]);
  if (!tous.length) return;
  const { error } = await supabase.storage.from('photos').remove(tous);
  if (error) throw error;
}

// ---------- Adresses temporaires ----------

// Le bucket est prive : pour afficher une photo il faut une adresse valable une heure.
const adresses = new Map(); // chemin -> { url, expire }

export function urlEnCache(chemin) {
  const entree = adresses.get(chemin);
  return entree && entree.expire > Date.now() ? entree.url : null;
}

// Va chercher d'un coup (une seule requete) les adresses qui manquent.
export async function chargerUrls(chemins) {
  const manquants = [...new Set(chemins)].filter((chemin) => !urlEnCache(chemin));
  if (!manquants.length) return;
  try {
    const { data, error } = await supabase.storage.from('photos').createSignedUrls(manquants, DUREE_URL);
    if (error) throw error;
    for (const element of data) {
      if (element.signedUrl) {
        adresses.set(element.path, { url: element.signedUrl, expire: Date.now() + (DUREE_URL - 300) * 1000 });
      }
    }
  } catch {
    /* hors ligne : les photos restent des emplacements vides, le reste de l'appli marche */
  }
}

export function viderUrls() {
  adresses.clear();
}
