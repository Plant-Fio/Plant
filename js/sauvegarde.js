// Sauvegarde : export (donnees seules, ou avec les photos dans un .zip) et import.
// Le zip est fabrique ici, sans bibliotheque : les photos sont deja compressees (JPEG), donc on les
// range telles quelles (methode « stocke »), ce qui suffit et reste tres simple.
import { supabase } from './client.js';
import { lireEtat } from './donnees.js';
import { cheminVignette } from './photos.js';
import { dateIsoLocale } from './outils.js';

const FORMAT = 'plantes-sauvegarde';
const TABLES = ['pieces', 'plantes', 'photos', 'arrosages', 'souhaits', 'taches', 'journal', 'problemes'];
const TAILLE_LOT = 200;

// ---------- Lecture de toutes les lignes (Supabase rend 1000 lignes au maximum par requete) ----------

async function toutLire(table) {
  const lignes = [];
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await supabase.from(table).select('*').order('created_at').order('id').range(debut, debut + 999);
    if (error) throw error;
    lignes.push(...data);
    if (data.length < 1000) break;
  }
  return lignes;
}

export async function lireToutesLesDonnees() {
  const tables = {};
  for (const nom of TABLES) tables[nom] = await toutLire(nom);
  return { format: FORMAT, version: 1, exporte_le: new Date().toISOString(), utilisateur: lireEtat().userId, tables };
}

// Chemins des fichiers du bucket a sauvegarder : photos (+ vignettes) et photos d'inspiration des souhaits
export function cheminsDesPhotos(donnees) {
  const chemins = [];
  for (const p of donnees.tables.photos) if (p.chemin) chemins.push(p.chemin, cheminVignette(p.chemin));
  for (const s of donnees.tables.souhaits) if (s.photo_chemin) chemins.push(s.photo_chemin);
  return chemins;
}

// ---------- Zip minimal (methode « stocke ») ----------

const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(octets) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < octets.length; i += 1) c = TABLE_CRC[(c ^ octets[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// fichiers : [{ nom, octets: Uint8Array }] -> Blob .zip
export function fabriquerZip(fichiers) {
  const encodeur = new TextEncoder();
  const morceaux = [];
  const centrale = [];
  let decalage = 0;
  const maintenant = new Date();
  const heure = (maintenant.getHours() << 11) | (maintenant.getMinutes() << 5) | (maintenant.getSeconds() >> 1);
  const jour = ((maintenant.getFullYear() - 1980) << 9) | ((maintenant.getMonth() + 1) << 5) | maintenant.getDate();
  for (const { nom, octets } of fichiers) {
    const nomOctets = encodeur.encode(nom);
    const crc = crc32(octets);
    const entete = new DataView(new ArrayBuffer(30));
    entete.setUint32(0, 0x04034b50, true);
    entete.setUint16(4, 20, true);
    entete.setUint16(6, 0x0800, true); // noms en UTF-8
    entete.setUint16(10, heure, true);
    entete.setUint16(12, jour, true);
    entete.setUint32(14, crc, true);
    entete.setUint32(18, octets.length, true);
    entete.setUint32(22, octets.length, true);
    entete.setUint16(26, nomOctets.length, true);
    morceaux.push(entete.buffer, nomOctets, octets);
    const fiche = new DataView(new ArrayBuffer(46));
    fiche.setUint32(0, 0x02014b50, true);
    fiche.setUint16(4, 20, true);
    fiche.setUint16(6, 20, true);
    fiche.setUint16(8, 0x0800, true);
    fiche.setUint16(12, heure, true);
    fiche.setUint16(14, jour, true);
    fiche.setUint32(16, crc, true);
    fiche.setUint32(20, octets.length, true);
    fiche.setUint32(24, octets.length, true);
    fiche.setUint16(28, nomOctets.length, true);
    fiche.setUint32(42, decalage, true);
    centrale.push(fiche.buffer, nomOctets);
    decalage += 30 + nomOctets.length + octets.length;
  }
  const tailleCentrale = centrale.reduce((somme, m) => somme + (m.byteLength ?? m.length), 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, fichiers.length, true);
  fin.setUint16(10, fichiers.length, true);
  fin.setUint32(12, tailleCentrale, true);
  fin.setUint32(16, decalage, true);
  return new Blob([...morceaux, ...centrale, fin.buffer], { type: 'application/zip' });
}

// Lit un .zip : { nom -> async () => Uint8Array }. Gere « stocke » et « deflate » (zips refaits ailleurs).
export async function lireZip(blob) {
  const tout = new Uint8Array(await blob.arrayBuffer());
  const vue = new DataView(tout.buffer);
  let fin = -1;
  for (let i = tout.length - 22; i >= Math.max(0, tout.length - 70000); i -= 1) {
    if (vue.getUint32(i, true) === 0x06054b50) { fin = i; break; }
  }
  if (fin < 0) throw new Error('Ce fichier n\'est pas un zip valide.');
  const nombre = vue.getUint16(fin + 10, true);
  let position = vue.getUint32(fin + 16, true);
  const decodeur = new TextDecoder();
  const entrees = new Map();
  for (let i = 0; i < nombre; i += 1) {
    if (vue.getUint32(position, true) !== 0x02014b50) throw new Error('Zip abîmé.');
    const methode = vue.getUint16(position + 10, true);
    const taille = vue.getUint32(position + 20, true);
    const tailleNom = vue.getUint16(position + 28, true);
    const tailleExtra = vue.getUint16(position + 30, true);
    const tailleCom = vue.getUint16(position + 32, true);
    const debutLocal = vue.getUint32(position + 42, true);
    const nom = decodeur.decode(tout.subarray(position + 46, position + 46 + tailleNom));
    entrees.set(nom, async () => {
      const debut = debutLocal + 30 + vue.getUint16(debutLocal + 26, true) + vue.getUint16(debutLocal + 28, true);
      const brut = tout.subarray(debut, debut + taille);
      if (methode === 0) return brut;
      if (methode === 8 && 'DecompressionStream' in globalThis) {
        const flux = new Blob([brut]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Uint8Array(await new Response(flux).arrayBuffer());
      }
      throw new Error('Ce zip utilise une compression non prise en charge.');
    });
    position += 46 + tailleNom + tailleExtra + tailleCom;
  }
  return entrees;
}

// ---------- Export ----------

const dateDuJour = () => dateIsoLocale();

export async function preparerExportDonnees(progres = () => {}) {
  progres(0, 'Lecture des données…');
  const donnees = await lireToutesLesDonnees();
  const texte = JSON.stringify(donnees, null, 1);
  return { blob: new Blob([texte], { type: 'application/json' }), nom: `plantes-donnees-${dateDuJour()}.json`, donnees };
}

export async function preparerExportComplet(progres = () => {}) {
  progres(0, 'Lecture des données…');
  const donnees = await lireToutesLesDonnees();
  const chemins = [...new Set(cheminsDesPhotos(donnees))];
  const fichiers = [{ nom: 'donnees.json', octets: new TextEncoder().encode(JSON.stringify(donnees, null, 1)) }];
  const bucket = supabase.storage.from('photos');
  let manquantes = 0;
  for (let i = 0; i < chemins.length; i += 1) {
    progres(i / chemins.length, `Photos : ${i} sur ${chemins.length}`);
    const { data, error } = await bucket.download(chemins[i]);
    if (error || !data) { manquantes += 1; continue; } // une vignette absente n'empeche pas la sauvegarde
    fichiers.push({ nom: `photos/${chemins[i]}`, octets: new Uint8Array(await data.arrayBuffer()) });
  }
  progres(1, 'Création du fichier…');
  return { blob: fabriquerZip(fichiers), nom: `plantes-sauvegarde-${dateDuJour()}.zip`, donnees, manquantes };
}

// Donne le fichier a l'utilisateur : feuille de partage de l'iPhone (Enregistrer dans Fichiers), sinon telechargement
export async function remettreFichier({ blob, nom }) {
  const fichier = new File([blob], nom, { type: blob.type });
  if (navigator.canShare?.({ files: [fichier] })) {
    try {
      await navigator.share({ files: [fichier], title: nom });
      return;
    } catch (erreur) {
      if (erreur?.name === 'AbortError') return;
    }
  }
  const adresse = URL.createObjectURL(blob);
  const lien = Object.assign(document.createElement('a'), { href: adresse, download: nom });
  document.body.append(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(adresse), 60000);
}

// ---------- Import ----------

// Ouvre un fichier choisi (.json ou .zip) : { donnees, photos: Map(chemin -> async octets) | null }
export async function ouvrirSauvegarde(fichier) {
  let donnees;
  let photos = null;
  if (/\.zip$/i.test(fichier.name) || fichier.type === 'application/zip') {
    const entrees = await lireZip(fichier);
    if (!entrees.has('donnees.json')) throw new Error('Ce zip ne contient pas de « donnees.json ».');
    donnees = JSON.parse(new TextDecoder().decode(await entrees.get('donnees.json')()));
    photos = new Map([...entrees].filter(([nom]) => nom.startsWith('photos/')).map(([nom, lire]) => [nom.slice(7), lire]));
  } else {
    donnees = JSON.parse(await fichier.text());
  }
  if (donnees?.format !== FORMAT || !donnees.tables) throw new Error('Ce fichier n\'est pas une sauvegarde de l\'appli.');
  for (const nom of TABLES) if (!Array.isArray(donnees.tables[nom])) donnees.tables[nom] = [];
  return { donnees, photos };
}

export const resumeSauvegarde = ({ donnees, photos }) => ({
  plantes: donnees.tables.plantes.length,
  photos: donnees.tables.photos.length,
  fichiers: photos ? photos.size : 0,
  journal: donnees.tables.journal.length,
  date: String(donnees.exporte_le || '').slice(0, 10),
});

async function enregistrerParLots(table, lignes, progres) {
  for (let i = 0; i < lignes.length; i += TAILLE_LOT) {
    const { error } = await supabase.from(table).upsert(lignes.slice(i, i + TAILLE_LOT), { onConflict: 'id' });
    if (error) throw new Error(`Table « ${table} » : ${error.message}`);
    progres();
  }
}

// Remet tout dans le compte connecte : on ajoute ou met a jour (par identifiant), on ne supprime jamais rien.
export async function importerSauvegarde({ donnees, photos }, progres = () => {}) {
  const uid = lireEtat().userId;
  const t = donnees.tables;
  // Les chemins commencent par l'identifiant de l'ancien compte : on met celui du compte actuel
  const nouveauChemin = (chemin) => (chemin ? `${uid}/${chemin.split('/').slice(1).join('/')}` : chemin);
  const miens = (lignes) => lignes.map((l) => ({ ...l, user_id: uid }));
  const total = TABLES.length + 1 + (photos ? photos.size : 0);
  let fait = 0;
  const avancer = (texte) => { fait += 1; progres(Math.min(1, fait / total), texte); };

  // Les plantes se referencent (mere_id) et pointent vers leurs photos : on les enregistre d'abord
  // sans ces liens, puis on remet les liens une fois les photos en place.
  const liens = t.plantes.map((p) => ({ ...p, user_id: uid }));
  const sansLiens = liens.map((p) => ({ ...p, mere_id: null, photo_principale_id: null }));
  await enregistrerParLots('pieces', miens(t.pieces), () => {}); avancer('Pièces');
  await enregistrerParLots('plantes', sansLiens, () => {}); avancer('Plantes');
  await enregistrerParLots('photos', miens(t.photos).map((p) => ({ ...p, chemin: nouveauChemin(p.chemin) })), () => {}); avancer('Photos');
  await enregistrerParLots('plantes', liens, () => {}); avancer('Liens entre plantes');
  await enregistrerParLots('arrosages', miens(t.arrosages), () => {}); avancer('Arrosages');
  await enregistrerParLots('souhaits', miens(t.souhaits).map((s) => ({ ...s, photo_chemin: nouveauChemin(s.photo_chemin) })), () => {}); avancer('Souhaits');
  await enregistrerParLots('taches', miens(t.taches), () => {}); avancer('Tâches');
  await enregistrerParLots('journal', miens(t.journal), () => {}); avancer('Journal');
  await enregistrerParLots('problemes', miens(t.problemes), () => {}); avancer('Problèmes');

  let echecs = 0;
  if (photos) {
    const bucket = supabase.storage.from('photos');
    for (const [chemin, lire] of photos) {
      try {
        const octets = await lire();
        const { error } = await bucket.upload(nouveauChemin(chemin), new Blob([octets], { type: 'image/jpeg' }),
          { contentType: 'image/jpeg', cacheControl: '31536000', upsert: true });
        if (error) throw error;
      } catch { echecs += 1; }
      avancer(`Photos : ${fait - TABLES.length - 1} sur ${photos.size}`);
    }
  }
  progres(1, 'Terminé');
  return { echecs };
}
