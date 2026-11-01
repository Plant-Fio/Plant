// Faux "Supabase" pour la CI : remplace vendor/supabase.js dans une copie du site,
// afin de photographier et tester l'appli CONNECTEE sans identifiants ni vraie base.
// Il imite juste ce que l'appli utilise : auth + from(table).select/insert/update/delete/eq/order/single.
let session = { user: { id: 'demo', email: 'demo@example.com', user_metadata: {} } };
const ecouteurs = new Set();
const tables = { pieces: [], plantes: [], photos: [], arrosages: [], souhaits: [], taches: [], appareils_push: [], reglages_notifs: [] };
const valeursParDefaut = {
  pieces: () => ({ position: 0 }),
  plantes: () => ({
    espece: null, piece_id: null, date_acquisition: null, notes: null, photo_principale_id: null,
    arrosage_jours: null, dernier_engrais: null, dernier_rempotage: null,
    derniere_feuille: null, en_vente: false, prochain_engrais: null,
  }),
  photos: () => ({ date_photo: new Date().toLocaleDateString('sv-SE') }),
  arrosages: () => ({}),
  souhaits: () => ({ espece: null, note: null, photo_chemin: null }),
  taches: () => ({ fait_le: null, pour_le: null }),
  appareils_push: () => ({}),
  reglages_notifs: () => ({
    matin_actif: true, heure_matin: 10, soir_actif: true, heure_soir: 20, fuseau: 'Europe/Paris', dernier_matin: null, dernier_soir: null,
  }),
};
const copie = (x) => JSON.parse(JSON.stringify(x));

// Faux stockage : garde les fichiers en memoire et note ce qui a ete envoye (pour que les tests
// puissent verifier la compression : type, taille, dimensions, nom des fichiers).
const fichiers = new Map(); // chemin -> Blob
const adressesObjet = new Map(); // chemin -> blob:...
globalThis.__uploads = [];
globalThis.__nombreFichiers = () => fichiers.size;

const stockage = {
  from: () => ({
    upload: async (chemin, blob, options) => {
      const image = await createImageBitmap(blob);
      globalThis.__uploads.push({
        chemin, type: blob.type || options?.contentType, taille: blob.size,
        largeur: image.width, hauteur: image.height,
      });
      fichiers.set(chemin, blob);
      return { data: { path: chemin }, error: null };
    },
    createSignedUrls: async (chemins) => ({
      data: chemins.map((chemin) => {
        if (!fichiers.has(chemin)) return { path: chemin, signedUrl: null, error: 'introuvable' };
        if (!adressesObjet.has(chemin)) adressesObjet.set(chemin, URL.createObjectURL(fichiers.get(chemin)));
        return { path: chemin, signedUrl: adressesObjet.get(chemin), error: null };
      }),
      error: null,
    }),
    remove: async (chemins) => {
      chemins.forEach((chemin) => { fichiers.delete(chemin); adressesObjet.delete(chemin); });
      return { data: [], error: null };
    },
  }),
};

class Requete {
  constructor(table) {
    this.table = table; this.op = 'select'; this.charge = null;
    this.filtres = []; this.tris = []; this.minimums = []; this.maximum = null; this.retourne = false; this.unique = null;
  }
  select() { this.retourne = true; return this; }
  order(colonne, options) { this.tris.push([colonne, options?.ascending === false]); return this; }
  gte(colonne, valeur) { this.minimums.push([colonne, valeur]); return this; }
  limit(nombre) { this.maximum = nombre; return this; }
  eq(colonne, valeur) { this.filtres.push([colonne, valeur]); return this; }
  insert(lignes) { this.op = 'insert'; this.charge = lignes; return this; }
  upsert(lignes, options) { this.op = 'upsert'; this.charge = lignes; this.conflit = options?.onConflict || 'id'; return this; }
  update(modifs) { this.op = 'update'; this.charge = modifs; return this; }
  delete() { this.op = 'delete'; return this; }
  single() { this.unique = 'single'; return this; }
  maybeSingle() { this.unique = 'maybe'; return this; }
  then(resolve, reject) { return Promise.resolve(this.executer()).then(resolve, reject); }

  executer() {
    const lignes = tables[this.table];
    const correspond = (l) => this.filtres.every(([c, v]) => l[c] === v)
      && this.minimums.every(([c, v]) => l[c] >= v);
    let resultat = [];

    if (this.op === 'insert') {
      const maintenant = new Date().toISOString();
      for (const ligne of [].concat(this.charge)) {
        if (this.table === 'pieces' && lignes.some((l) => l.nom === ligne.nom)) {
          return { data: null, error: { code: '23505', message: 'duplicate key value' } };
        }
        // Comme la base : une seule ligne d'arrosage par plante et par jour
        if (this.table === 'arrosages' && lignes.some((l) => l.plante_id === ligne.plante_id && l.jour === ligne.jour)) {
          return { data: null, error: { code: '23505', message: 'duplicate key value' } };
        }
        const nouvelle = {
          id: crypto.randomUUID(), user_id: 'demo', created_at: maintenant, updated_at: maintenant,
          ...valeursParDefaut[this.table](), ...ligne,
        };
        lignes.push(nouvelle);
        resultat.push(nouvelle);
      }
    } else if (this.op === 'upsert') {
      // Comme la base : si la ligne existe deja (meme cle), on la met a jour, sinon on l'ajoute
      for (const ligne of [].concat(this.charge)) {
        const existante = lignes.find((l) => l[this.conflit] === ligne[this.conflit]);
        if (existante) { Object.assign(existante, ligne); resultat.push(existante); continue; }
        const nouvelle = { id: crypto.randomUUID(), user_id: 'demo', created_at: new Date().toISOString(), ...valeursParDefaut[this.table](), ...ligne };
        lignes.push(nouvelle);
        resultat.push(nouvelle);
      }
    } else if (this.op === 'update') {
      resultat = lignes.filter(correspond);
      resultat.forEach((l) => Object.assign(l, this.charge));
    } else if (this.op === 'delete') {
      const supprimees = lignes.filter(correspond).map((l) => l.id);
      tables[this.table] = lignes.filter((l) => !correspond(l));
      // Comme la base : supprimer une plante supprime ses photos
      if (this.table === 'plantes') {
        tables.photos = tables.photos.filter((p) => !supprimees.includes(p.plante_id));
        tables.arrosages = tables.arrosages.filter((a) => !supprimees.includes(a.plante_id));
      }
      // ... et supprimer la photo de couverture remet la couverture a vide
      if (this.table === 'photos') {
        tables.plantes.forEach((p) => { if (supprimees.includes(p.photo_principale_id)) p.photo_principale_id = null; });
      }
    } else {
      resultat = lignes.filter(correspond);
    }

    resultat = copie(resultat);
    for (const [colonne, decroissant] of [...this.tris].reverse()) {
      resultat.sort((a, b) => (decroissant ? -1 : 1) * (typeof a[colonne] === 'number'
        ? a[colonne] - b[colonne]
        : String(a[colonne]).localeCompare(String(b[colonne]), 'fr')));
    }
    if (this.maximum != null) resultat = resultat.slice(0, this.maximum);

    if (!this.retourne && this.op !== 'select') return { data: null, error: null };
    if (this.unique === 'single') {
      return resultat.length === 1
        ? { data: resultat[0], error: null }
        : { data: null, error: { code: 'PGRST116', message: 'Aucune ligne' } };
    }
    if (this.unique === 'maybe') return { data: resultat[0] ?? null, error: null };
    return { data: resultat, error: null };
  }
}

export function createClient() {
  return {
    from: (table) => new Requete(table),
    storage: stockage,
    // Fonctions Supabase : ici, la fonction de rappels repond toujours "envoye"
    functions: { invoke: async () => ({ data: { envoye: 1 }, error: null }) },
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      onAuthStateChange: (rappel) => {
        ecouteurs.add(rappel);
        return { data: { subscription: { unsubscribe: () => ecouteurs.delete(rappel) } } };
      },
      signInWithPassword: async () => ({ data: { session }, error: null }),
      updateUser: async ({ data }) => {
        session = { user: { ...session.user, user_metadata: { ...session.user.user_metadata, ...data } } };
        return { data: { user: session.user }, error: null };
      },
      signOut: async () => {
        session = null;
        ecouteurs.forEach((rappel) => rappel('SIGNED_OUT', null));
        return { error: null };
      },
    },
  };
}
