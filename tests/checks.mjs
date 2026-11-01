// Verifications dans un vrai Chromium, au format iPhone, avec captures d'ecran.
// - verifierConnexion : le site "reel" (vrai Supabase) : ecran de connexion, manifest, service worker,
//   mode hors ligne, serveur Supabase joignable, message d'erreur sur un mauvais mot de passe.
// - verifierAppli : une copie du site avec un faux Supabase, pour photographier l'appli connectee.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, devices } from 'playwright';
import { annoter, ok, bilan } from './helpers.mjs';

const { defaultBrowserType, ...iphone } = devices['iPhone 14'];

async function ouvrir() {
  const navigateur = await chromium.launch();
  const contexte = await navigateur.newContext({ ...iphone, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  const page = await contexte.newPage();
  const etat = { horsLigne: false, problemes: [] };

  page.on('pageerror', (e) => etat.problemes.push(`Erreur JavaScript : ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) {
      etat.problemes.push(`Message d'erreur dans la console : ${m.text()}`);
    }
  });
  page.on('requestfailed', (r) => {
    const raison = r.failure()?.errorText || '';
    if (!etat.horsLigne && !/ERR_ABORTED/.test(raison)) etat.problemes.push(`Requete echouee (${raison}) : ${r.url()}`);
  });
  page.on('response', (r) => {
    // Une reponse 400 de Supabase est normale lors du test "mauvais mot de passe"
    if (r.status() >= 400 && !new URL(r.url()).hostname.endsWith('supabase.co')) {
      etat.problemes.push(`Reponse HTTP ${r.status()} : ${r.url()}`);
    }
  });
  return { navigateur, contexte, page, etat };
}

async function terminer({ navigateur, page, etat }, dossier, titre) {
  for (const probleme of etat.problemes) annoter('error', titre, probleme);
  if (!etat.problemes.length) ok('aucune erreur dans la console ni sur le reseau');
  bilan(titre);
  await page.close().catch(() => {});
  await navigateur.close();
}

async function capturer(page, dossier, nom) {
  fs.mkdirSync(dossier, { recursive: true });
  await page.screenshot({ path: path.join(dossier, nom) });
}

// Verifie qu'aucun element ne depasse de l'ecran en largeur
async function verifierDebordement(page, contexteTexte) {
  const depasse = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (depasse) annoter('error', 'Mise en page', `${contexteTexte} : la page deborde en largeur (defilement horizontal).`);
  else ok(`${contexteTexte} : pas de defilement horizontal`);
}

// Avertit si une zone tactile est plus petite que 44 px (recommandation Apple)
async function verifierZonesTactiles(page, contexteTexte) {
  const petits = await page.$$eval('button, a, input, select, textarea', (els) => els
    .filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && (r.height < 44 || r.width < 44);
    })
    .map((e) => e.outerHTML.slice(0, 90)));
  if (petits.length) annoter('warning', 'Zones tactiles', `${contexteTexte} : ${petits.length} element(s) de moins de 44 px : ${petits.join(' | ')}`);
  else ok(`${contexteTexte} : zones tactiles d'au moins 44 px`);
}

export async function verifierConnexion(base, dossier, { version }) {
  const titre = 'Verification du site (connexion)';
  const nav = await ouvrir();
  const { contexte, page, etat } = nav;
  try {
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForSelector('#login-form', { timeout: 15000 });
    ok('ecran de connexion affiche');

    const versionAffichee = (await page.textContent('[data-version]')).trim();
    if (versionAffichee.includes(version)) ok(`version ${version} visible dans l'appli`);
    else annoter('error', titre, `La page affiche "${versionAffichee}" au lieu de la version ${version}.`);

    await capturer(page, dossier, '01-connexion.png');
    await verifierDebordement(page, 'Ecran de connexion');
    await verifierZonesTactiles(page, 'Ecran de connexion');

    // Manifest et icones, tels que le navigateur les voit
    const manifestUrl = await page.evaluate(() => document.querySelector('link[rel="manifest"]')?.href);
    const reponseManifest = await page.request.get(manifestUrl);
    if (!reponseManifest.ok()) {
      annoter('error', titre, `Manifest inaccessible (${reponseManifest.status()}) : ${manifestUrl}`);
    } else {
      const manifest = await reponseManifest.json();
      for (const icone of manifest.icons) {
        const r = await page.request.get(new URL(icone.src, manifestUrl).href);
        if (!r.ok()) annoter('error', titre, `Icone inaccessible (${r.status()}) : ${icone.src}`);
      }
      ok('manifest et icones accessibles');
    }

    // Service worker : installe, puis il controle la page
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload({ waitUntil: 'networkidle' });
    const controle = await page.evaluate(() => !!navigator.serviceWorker.controller);
    if (controle) ok('service worker actif');
    else annoter('error', titre, "Le service worker ne controle pas la page apres rechargement.");

    // Mode hors ligne : la page doit toujours s'afficher
    etat.horsLigne = true;
    await contexte.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    try {
      await page.waitForSelector('#login-form', { timeout: 10000 });
      ok('mode hors ligne : l\'ecran s\'affiche sans reseau');
      await capturer(page, dossier, '02-hors-ligne.png');
    } catch {
      annoter('error', titre, "Hors ligne, l'ecran de connexion ne s'affiche pas.");
      await capturer(page, dossier, '02-hors-ligne-ECHEC.png');
    }
    await contexte.setOffline(false);
    etat.horsLigne = false;

    // Supabase : URL + cle valides ? (appel direct depuis le runner)
    const config = await (await page.request.get(new URL('js/config.js', base).href)).text();
    const urlSupabase = config.match(/SUPABASE_URL\s*=\s*'([^']+)'/)?.[1];
    const cle = config.match(/SUPABASE_ANON_KEY\s*=\s*\n?\s*'([^']+)'/)?.[1];
    if (!urlSupabase || !cle) {
      annoter('error', titre, 'URL ou cle Supabase introuvable dans js/config.js.');
    } else {
      try {
        const sante = await fetch(`${urlSupabase}/auth/v1/health`, { headers: { apikey: cle } });
        if (sante.ok) ok(`serveur Supabase joignable (${new URL(urlSupabase).hostname})`);
        else annoter('error', titre, `Supabase repond ${sante.status} : l'URL ou la cle anon est probablement fausse (ou le projet est en pause).`);
      } catch (e) {
        annoter('error', titre, `Supabase injoignable (${urlSupabase}) : ${e.message}`);
      }
    }

    // Mauvais mot de passe : l'appli doit parler a Supabase et afficher un message clair en francais
    await page.fill('#email', 'verification@example.com');
    await page.fill('#password', 'mot-de-passe-incorrect');
    await page.click('#login-submit');
    try {
      await page.waitForSelector('#login-error:not([hidden])', { timeout: 15000 });
      const message = (await page.textContent('#login-error')).trim();
      if (/incorrect/i.test(message)) ok('mauvais mot de passe : message clair en francais');
      else annoter('error', titre, `Message inattendu pour un mauvais mot de passe : "${message}"`);
      await capturer(page, dossier, '03-erreur-connexion.png');
    } catch {
      annoter('error', titre, "Aucun message d'erreur apres un mauvais mot de passe : la connexion a Supabase ne repond pas.");
      await capturer(page, dossier, '03-erreur-connexion-ECHEC.png');
    }
  } catch (e) {
    annoter('error', titre, e.message);
    await capturer(page, dossier, 'erreur.png').catch(() => {});
  } finally {
    await terminer(nav, dossier, titre);
  }
}

export async function verifierAppli(base, dossier, { version }) {
  const titre = 'Verification de l\'appli connectee (faux Supabase)';
  const nav = await ouvrir();
  const { page } = nav;
  try {
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForSelector('#tabbar', { timeout: 15000 });
    ok('barre d\'onglets affichee apres connexion');

    await capturer(page, dossier, '10-plantes.png');
    await verifierDebordement(page, 'Onglet Plantes');
    await verifierZonesTactiles(page, 'Onglet Plantes');

    await page.click('[data-tab="aujourdhui"]');
    await page.waitForSelector('.vue__titre:has-text("aujourd")');
    await capturer(page, dossier, '11-aujourdhui.png');
    ok('onglet Aujourd\'hui');

    await page.click('[data-tab="reglages"]');
    await page.waitForSelector('#logout');
    const email = (await page.textContent('[data-email]')).trim();
    if (email === 'demo@example.com') ok('e-mail du compte affiche dans les reglages');
    else annoter('error', titre, `E-mail affiche "${email}" au lieu de demo@example.com.`);
    const versionAffichee = (await page.textContent('[data-version]')).trim();
    if (versionAffichee.includes(version)) ok(`version ${version} visible dans les reglages`);
    else annoter('error', titre, `Les reglages affichent "${versionAffichee}" au lieu de ${version}.`);
    await capturer(page, dossier, '12-reglages.png');
    await verifierDebordement(page, 'Onglet Reglages');
    await verifierZonesTactiles(page, 'Onglet Reglages');

    await page.click('#logout');
    await page.waitForSelector('#login-form', { timeout: 10000 });
    ok('deconnexion : retour a l\'ecran de connexion');
  } catch (e) {
    annoter('error', titre, e.message);
    await capturer(page, dossier, 'erreur.png').catch(() => {});
  } finally {
    await terminer(nav, dossier, titre);
  }
}
