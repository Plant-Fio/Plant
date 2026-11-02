// Fonction Supabase "rappels" : envoie les notifications (matin et soir) a l'iPhone.
// Elle est appelee chaque heure par l'horloge de Supabase (voir supabase/09-horloge.sql), et par
// le bouton « Envoyer une notification test » des Reglages.
// Secrets a definir dans Supabase (Edge Functions > Secrets) : VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT (ex. mailto:ton-adresse), CRON_SECRET. SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY existent deja.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') || 'mailto:contact@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

const reponseJson = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } });

// ---------- Dates (memes regles que l'appli : jours "YYYY-MM-DD", calcul a midi) ----------

const versDate = (iso: string) => { const [a, m, j] = iso.split('-').map(Number); return new Date(a, m - 1, j, 12); };
const versIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ajouterJours = (iso: string, n: number) => { const d = versDate(iso); d.setDate(d.getDate() + n); return versIso(d); };
const joursEntre = (debut: string, fin: string) => Math.round((versDate(fin).getTime() - versDate(debut).getTime()) / 86400000);

// Jour et heure "d'ici" selon le fuseau de l'utilisatrice
function maintenantDans(fuseau: string) {
  let parties;
  try {
    parties = new Intl.DateTimeFormat('en-CA', { timeZone: fuseau, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  } catch {
    return maintenantDans('Europe/Paris');
  }
  const v = (type: string) => parties.find((p) => p.type === type)!.value;
  return { jour: `${v('year')}-${v('month')}-${v('day')}`, heure: Number(v('hour')) };
}

// ---------- Ce qu'il y a a faire (meme logique que js/rappels.js) ----------

async function listeAFaire(userId: string, jourLimite: string, aujourdhui: string) {
  const [plantes, arrosages, taches, problemes] = await Promise.all([
    admin.from('plantes').select('id,nom,arrosage_jours,date_acquisition,created_at,prochain_engrais').eq('user_id', userId),
    admin.from('arrosages').select('plante_id,jour').eq('user_id', userId).gte('jour', ajouterJours(aujourdhui, -400)),
    admin.from('taches').select('texte,fait_le,pour_le').eq('user_id', userId).is('fait_le', null),
    admin.from('problemes').select('plante_id,type,relance_le').eq('user_id', userId).is('resolu_le', null).not('relance_le', 'is', null),
  ]);
  const dernier = new Map<string, string>();
  for (const a of arrosages.data || []) if (!dernier.has(a.plante_id) || a.jour > dernier.get(a.plante_id)!) dernier.set(a.plante_id, a.jour);

  const arroser: string[] = [];
  const engrais: string[] = [];
  for (const p of plantes.data || []) {
    if (p.arrosage_jours) {
      const dernierJour = dernier.get(p.id);
      const depart = dernierJour || p.date_acquisition || versIso(new Date(p.created_at));
      const prochain = ajouterJours(depart, p.arrosage_jours);
      if (dernierJour !== aujourdhui && prochain <= jourLimite) arroser.push(p.nom);
    }
    if (p.prochain_engrais && p.prochain_engrais <= jourLimite) engrais.push(p.nom);
  }
  const aFaire = (taches.data || []).filter((t) => !t.pour_le || t.pour_le <= jourLimite).map((t) => t.texte);
  const noms = new Map((plantes.data || []).map((p) => [p.id, p.nom]));
  const traitements = (problemes.data || [])
    .filter((q) => q.relance_le <= jourLimite && noms.has(q.plante_id))
    .map((q) => `${q.type} (${noms.get(q.plante_id)})`);
  return { arroser, engrais, taches: aFaire, traitements };
}

const liste = (noms: string[]) => (noms.length > 3 ? `${noms.slice(0, 3).join(', ')} +${noms.length - 3}` : noms.join(', '));

function composer({ arroser, engrais, taches, traitements }: { arroser: string[]; engrais: string[]; taches: string[]; traitements: string[] }, titre: string) {
  const morceaux = [];
  if (arroser.length) morceaux.push(`À arroser : ${liste(arroser)}`);
  if (engrais.length) morceaux.push(`Engrais : ${liste(engrais)}`);
  if (traitements.length) morceaux.push(`Traitements : ${liste(traitements)}`);
  if (taches.length) morceaux.push(`Tâches : ${liste(taches)}`);
  return morceaux.length ? { titre, corps: morceaux.join(' · '), url: '#/aujourdhui' } : null;
}

// ---------- Envoi ----------

async function envoyer(userId: string, message: { titre: string; corps: string; url: string; tag?: string }) {
  const { data: appareils } = await admin.from('appareils_push').select('id,endpoint,p256dh,auth').eq('user_id', userId);
  let envoyes = 0;
  for (const a of appareils || []) {
    try {
      await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, JSON.stringify(message), { TTL: 6 * 3600 });
      envoyes++;
    } catch (erreur) {
      // 404 / 410 : l'appareil s'est desabonne, on l'oublie
      if (erreur.statusCode === 404 || erreur.statusCode === 410) await admin.from('appareils_push').delete().eq('id', a.id);
      else console.error('Envoi impossible', erreur.statusCode, erreur.body);
    }
  }
  return envoyes;
}

// ---------- Point d'entree ----------

Deno.serve(async (requete) => {
  const corps = await requete.json().catch(() => ({}));

  // 1) Test depuis l'appli : l'utilisatrice est reconnue grace a son jeton de connexion
  if (corps.test) {
    const jeton = (requete.headers.get('Authorization') || '').replace('Bearer ', '');
    const { data } = await admin.auth.getUser(jeton);
    if (!data?.user) return reponseJson({ erreur: 'non connectee' }, 401);
    const envoyes = await envoyer(data.user.id, { titre: 'Mes plantes', corps: 'Les notifications fonctionnent 🌿', url: '#/aujourdhui', tag: 'test' });
    return reponseJson({ envoye: envoyes });
  }

  // 2) Appel de l'horloge : protege par un mot de passe secret
  if (requete.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return reponseJson({ erreur: 'refuse' }, 401);

  const { data: reglages } = await admin.from('reglages_notifs').select('*').or('matin_actif.eq.true,soir_actif.eq.true');
  let envoyes = 0;
  for (const r of reglages || []) {
    const { jour, heure } = maintenantDans(r.fuseau);
    // Heure pile, ou jusqu'a 2 h de retard si l'horloge a rate un passage
    const arrive = (h: number) => heure >= h && heure <= h + 2;

    if (r.matin_actif && arrive(r.heure_matin) && r.dernier_matin !== jour) {
      await admin.from('reglages_notifs').update({ dernier_matin: jour }).eq('user_id', r.user_id);
      const message = composer(await listeAFaire(r.user_id, jour, jour), 'Aujourd\'hui');
      if (message) envoyes += await envoyer(r.user_id, { ...message, tag: 'matin' });
    }
    if (r.soir_actif && arrive(r.heure_soir) && r.dernier_soir !== jour) {
      await admin.from('reglages_notifs').update({ dernier_soir: jour }).eq('user_id', r.user_id);
      const message = composer(await listeAFaire(r.user_id, ajouterJours(jour, 1), jour), 'Demain');
      if (message) envoyes += await envoyer(r.user_id, { ...message, tag: 'soir' });
    }
  }
  return reponseJson({ envoye: envoyes });
});
