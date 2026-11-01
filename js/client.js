// Le client Supabase, cree une seule fois et partage par tous les fichiers.
// vendor/supabase.js est fabrique par la CI (voir scripts/build.sh) : la bibliotheque est embarquee
// dans le site, ce qui permet de la mettre en cache pour le mode hors ligne.
import { createClient } from '../vendor/supabase.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
