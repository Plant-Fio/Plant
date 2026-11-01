// Faux "Supabase" pour la CI : remplace vendor/supabase.js dans une copie du site,
// afin de photographier l'appli CONNECTEE sans avoir de vrais identifiants.
let session = { user: { id: 'demo', email: 'demo@example.com' } };
const ecouteurs = new Set();

export function createClient() {
  return {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      onAuthStateChange: (rappel) => {
        ecouteurs.add(rappel);
        return { data: { subscription: { unsubscribe: () => ecouteurs.delete(rappel) } } };
      },
      signInWithPassword: async () => ({ data: { session }, error: null }),
      signOut: async () => {
        session = null;
        ecouteurs.forEach((rappel) => rappel('SIGNED_OUT', null));
        return { error: null };
      },
    },
  };
}
