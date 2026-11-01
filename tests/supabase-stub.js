// Faux "Supabase" pour la CI : remplace vendor/supabase.js dans une copie du site,
// afin de photographier et tester l'appli CONNECTEE sans identifiants ni vraie base.
// Il imite juste ce que l'appli utilise : auth + from(table).select/insert/update/delete/eq/order/single.
let session = { user: { id: 'demo', email: 'demo@example.com', user_metadata: {} } };
const ecouteurs = new Set();
const tables = { pieces: [], plantes: [] };
const valeursParDefaut = {
  pieces: () => ({ position: 0 }),
  plantes: () => ({ espece: null, piece_id: null, date_acquisition: null, notes: null }),
};
const copie = (x) => JSON.parse(JSON.stringify(x));

class Requete {
  constructor(table) {
    this.table = table; this.op = 'select'; this.charge = null;
    this.filtres = []; this.tris = []; this.retourne = false; this.unique = null;
  }
  select() { this.retourne = true; return this; }
  order(colonne) { this.tris.push(colonne); return this; }
  eq(colonne, valeur) { this.filtres.push([colonne, valeur]); return this; }
  insert(lignes) { this.op = 'insert'; this.charge = lignes; return this; }
  update(modifs) { this.op = 'update'; this.charge = modifs; return this; }
  delete() { this.op = 'delete'; return this; }
  single() { this.unique = 'single'; return this; }
  maybeSingle() { this.unique = 'maybe'; return this; }
  then(resolve, reject) { return Promise.resolve(this.executer()).then(resolve, reject); }

  executer() {
    const lignes = tables[this.table];
    const correspond = (l) => this.filtres.every(([c, v]) => l[c] === v);
    let resultat = [];

    if (this.op === 'insert') {
      const maintenant = new Date().toISOString();
      for (const ligne of [].concat(this.charge)) {
        if (this.table === 'pieces' && lignes.some((l) => l.nom === ligne.nom)) {
          return { data: null, error: { code: '23505', message: 'duplicate key value' } };
        }
        const nouvelle = {
          id: crypto.randomUUID(), user_id: 'demo', created_at: maintenant, updated_at: maintenant,
          ...valeursParDefaut[this.table](), ...ligne,
        };
        lignes.push(nouvelle);
        resultat.push(nouvelle);
      }
    } else if (this.op === 'update') {
      resultat = lignes.filter(correspond);
      resultat.forEach((l) => Object.assign(l, this.charge));
    } else if (this.op === 'delete') {
      tables[this.table] = lignes.filter((l) => !correspond(l));
    } else {
      resultat = lignes.filter(correspond);
    }

    resultat = copie(resultat);
    for (const colonne of [...this.tris].reverse()) {
      resultat.sort((a, b) => (typeof a[colonne] === 'number'
        ? a[colonne] - b[colonne]
        : String(a[colonne]).localeCompare(String(b[colonne]), 'fr')));
    }

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
