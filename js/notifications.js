// Notifications de rappel : abonnement de l'appareil (Web Push) et reglages (heures du matin et du soir).
// L'envoi lui-meme est fait par la fonction Supabase "rappels" (supabase/functions/rappels/index.ts).
import { supabase } from './client.js';

// Cle publique (VAPID) : faite pour etre visible. La cle privee reste secrete, cote Supabase.
const CLE_PUBLIQUE = 'BOqQZU8u26BM7ynhZ5kIv5v73bG2V8lDUkFy4V76ey4SrE1Ol4XosxyKi7Y2tM4CjHTPekexDu8AC8G4hBbZwO8';

export const REGLAGES_PAR_DEFAUT = { matin_actif: true, heure_matin: 10, soir_actif: true, heure_soir: 20 };

const estIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const estInstallee = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

// 'ok' | 'a-installer' (iPhone : il faut d'abord ajouter l'appli a l'ecran d'accueil) | 'indisponible'
export function disponibilite() {
  if (estIphone() && !estInstallee()) return 'a-installer';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'indisponible';
  return 'ok';
}

export const permission = () => ('Notification' in window ? Notification.permission : 'denied');

async function abonnementActuel() {
  const enregistrement = await navigator.serviceWorker.ready;
  return enregistrement.pushManager.getSubscription();
}

export async function estAbonne() {
  if (disponibilite() !== 'ok' || permission() !== 'granted') return false;
  try { return !!(await abonnementActuel()); } catch { return false; }
}

function versOctets(base64url) {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

const fuseau = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris';

export async function lireReglagesNotifs() {
  const { data, error } = await supabase.from('reglages_notifs').select('*').maybeSingle();
  if (error) throw error;
  return { ...REGLAGES_PAR_DEFAUT, ...(data || {}) };
}

// Enregistre les reglages (et le fuseau horaire de l'appareil, pour que "10 h" soit l'heure d'ici)
export async function enregistrerReglagesNotifs(userId, champs) {
  const { error } = await supabase.from('reglages_notifs')
    .upsert({ user_id: userId, ...champs, fuseau: fuseau() }, { onConflict: 'user_id' });
  if (error) throw error;
}

// A appeler depuis un geste de l'utilisatrice (toucher un bouton) : iOS l'exige pour demander l'autorisation.
export async function activerNotifications(userId) {
  const reponse = await Notification.requestPermission();
  if (reponse !== 'granted') return reponse;
  const enregistrement = await navigator.serviceWorker.ready;
  const abonnement = (await enregistrement.pushManager.getSubscription())
    || await enregistrement.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: versOctets(CLE_PUBLIQUE) });
  const json = abonnement.toJSON();
  const { error } = await supabase.from('appareils_push')
    .upsert({ user_id: userId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth }, { onConflict: 'endpoint' });
  if (error) throw error;
  return 'granted';
}

export async function desactiverNotifications() {
  const abonnement = await abonnementActuel();
  if (!abonnement) return;
  const endpoint = abonnement.endpoint;
  await abonnement.unsubscribe().catch(() => {});
  await supabase.from('appareils_push').delete().eq('endpoint', endpoint);
}

// Envoie tout de suite une notification de test a l'appareil
export async function envoyerTest() {
  const { data, error } = await supabase.functions.invoke('rappels', { body: { test: true } });
  if (error) throw error;
  return data;
}
