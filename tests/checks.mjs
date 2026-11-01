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

    // Tables et RLS : un visiteur sans compte (cle anon seule) ne doit rien pouvoir ecrire.
    // On tente d'inserer une ligne : si la RLS est active, Postgres refuse (code 42501) AVANT
    // toute verification des champs, donc rien n'est jamais ajoute.
    if (urlSupabase && cle) {
      for (const table of ['pieces', 'plantes']) {
        try {
          const reponse = await fetch(`${urlSupabase}/rest/v1/${table}`, {
            method: 'POST',
            headers: {
              apikey: cle, Authorization: `Bearer ${cle}`,
              'Content-Type': 'application/json', Prefer: 'return=minimal',
            },
            body: JSON.stringify({ nom: 'verification-ci' }),
          });
          const corps = await reponse.json().catch(() => ({}));
          if (corps.code === '42501') ok(`table ${table} : presente, RLS active (un visiteur sans compte est refuse)`);
          else if (reponse.status === 404 || corps.code === 'PGRST205') {
            annoter('error', titre, `La table "${table}" n'existe pas : le script SQL du dossier supabase/ a-t-il ete lance ?`);
          } else {
            annoter('error', titre, `Table "${table}" : reponse inattendue (${reponse.status} ${corps.code || ''} ${corps.message || ''}). La RLS est-elle bien activee ?`);
          }
        } catch (e) {
          annoter('error', titre, `Table "${table}" injoignable : ${e.message}`);
        }
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

// ---------- Parcours complet de l'appli connectee (faux Supabase) ----------

function verifier(condition, titre, succes, echec) {
  if (condition) ok(succes);
  else annoter('error', titre, echec);
}

async function remplirPlante(page, { nom, espece = '', piece = '', date = '', notes = '' }) {
  await page.fill('[name="nom"]', nom);
  await page.fill('[name="espece"]', espece);
  if (piece) await page.selectOption('#piece', { label: piece });
  if (date) await page.fill('[name="date_acquisition"]', date);
  await page.fill('[name="notes"]', notes);
}

async function ajouterPlante(page, champs) {
  await page.click('[data-tab="plantes"]');
  await page.click('.fab');
  await page.waitForSelector('#form-plante');
  await remplirPlante(page, champs);
  await page.click('#form-ok');
  await page.waitForSelector('.fiche__nom');
}

async function ouvrirListe(page) {
  await page.click('[data-tab="plantes"]');
  await page.waitForSelector('.fab');
}

export async function verifierAppli(base, dossier, { version }) {
  const titre = "Parcours de l'appli connectee (faux Supabase)";
  const nav = await ouvrir();
  const { page } = nav;
  const nombre = (selecteur) => page.locator(selecteur).count();
  try {
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForSelector('#tabbar', { timeout: 15000 });
    await page.waitForSelector('.fab');
    ok("barre d'onglets affichee apres connexion");

    // --- Liste vide ---
    verifier(await nombre('.vide__titre:has-text("Ta collection est vide")'), titre,
      "collection vide : message d'accueil", 'Le message de collection vide est absent.');
    await capturer(page, dossier, '10-liste-vide.png');
    await verifierDebordement(page, 'Liste vide');
    await verifierZonesTactiles(page, 'Liste vide');

    // --- Formulaire : pieces de depart, nom obligatoire ---
    await page.click('.fab');
    await page.waitForSelector('#form-plante');
    const options = await page.$$eval('#piece option', (o) => o.length);
    verifier(options === 8, titre, 'pieces de depart creees (7 + "Aucune pièce")',
      `Le formulaire propose ${options} choix de piece au lieu de 8.`);
    await page.click('#form-ok');
    await page.waitForSelector('#form-erreur:not([hidden])');
    ok('le nom de la plante est obligatoire');

    await remplirPlante(page, {
      nom: 'Monstera', espece: 'Monstera deliciosa', piece: 'Salon', date: '2024-03-12',
      notes: 'Aime la lumière douce.\nArrosage : une fois par semaine.',
    });
    await capturer(page, dossier, '11-formulaire.png');
    await verifierDebordement(page, 'Formulaire');
    await verifierZonesTactiles(page, 'Formulaire');
    await page.click('#form-ok');

    // --- Fiche ---
    await page.waitForSelector('.fiche__nom');
    verifier((await page.textContent('.fiche__nom')).trim() === 'Monstera', titre,
      'fiche : nom affiche', 'Le nom de la plante est faux sur la fiche.');
    verifier((await page.textContent('[data-date]')).includes('12 mars 2024'), titre,
      'fiche : date en francais (12 mars 2024)', 'La date n\'est pas affichee en francais.');
    verifier((await page.textContent('.notes')).includes('une fois par semaine'), titre,
      'fiche : notes affichees', 'Les notes sont absentes de la fiche.');
    await capturer(page, dossier, '12-fiche.png');
    await verifierDebordement(page, 'Fiche');
    await verifierZonesTactiles(page, 'Fiche');

    // --- Liste, recherche, filtre ---
    await ajouterPlante(page, { nom: 'Pothos', espece: 'Epipremnum aureum', piece: 'Bureau' });
    await ajouterPlante(page, { nom: 'Ficus lyrata', piece: 'Salon' });
    await ouvrirListe(page);
    verifier(await nombre('.vignette') === 3, titre, 'liste : 3 plantes en vignettes',
      `La liste affiche ${await nombre('.vignette')} plantes au lieu de 3.`);
    await capturer(page, dossier, '13-liste.png');
    await verifierDebordement(page, 'Liste');
    await verifierZonesTactiles(page, 'Liste');

    await page.fill('#recherche', 'pot');
    verifier(await nombre('.vignette') === 1, titre, 'recherche : "pot" trouve le Pothos',
      'La recherche "pot" devrait trouver une seule plante.');
    await page.fill('#recherche', 'EPIPREMNUM');
    verifier(await nombre('.vignette') === 1, titre, "recherche : insensible a la casse, trouve par l'espece",
      'La recherche par espece ne fonctionne pas.');
    await page.fill('#recherche', 'zzz');
    verifier(await nombre('.aucun-resultat') === 1, titre, 'recherche : message si aucun resultat',
      'Pas de message quand aucune plante ne correspond.');
    await page.fill('#recherche', '');
    await page.click('.puce:has-text("Salon")');
    verifier(await nombre('.vignette') === 2, titre, 'filtre par piece : Salon = 2 plantes',
      'Le filtre "Salon" devrait afficher 2 plantes.');
    await capturer(page, dossier, '14-liste-filtre-salon.png');
    await page.click('.puce:has-text("Toutes")');

    // --- Modification ---
    await page.click('.vignette:has-text("Monstera")');
    await page.waitForSelector('.fiche__nom');
    await page.click('a:has-text("Modifier")');
    await page.waitForSelector('#form-plante');
    verifier(await page.inputValue('[name="nom"]') === 'Monstera'
      && await page.inputValue('[name="date_acquisition"]') === '2024-03-12', titre,
    'modification : le formulaire est pre-rempli', 'Le formulaire de modification n\'est pas pre-rempli.');
    await page.fill('[name="nom"]', 'Monstera adansonii');
    await page.click('#form-ok');
    await page.waitForSelector('.fiche__nom');
    verifier((await page.textContent('.fiche__nom')).includes('adansonii'), titre,
      'modification enregistree', 'La modification n\'apparait pas sur la fiche.');

    // --- Suppression (avec confirmation) ---
    await page.click('a:has-text("Modifier")');
    await page.waitForSelector('#supprimer');
    await page.click('#supprimer');
    await page.waitForSelector('dialog[open]');
    await capturer(page, dossier, '15-confirmation-suppression.png');
    await page.click('dialog button[value="annuler"]');
    await page.waitForSelector('dialog', { state: 'detached' });
    ok('suppression : on peut annuler');
    await page.click('#supprimer');
    await page.waitForSelector('dialog[open]');
    await page.click('dialog button[value="ok"]');
    await page.waitForSelector('.fab');
    verifier(await nombre('.vignette') === 2, titre, 'suppression : la plante a disparu de la liste',
      'La plante supprimee est toujours dans la liste.');

    // --- Pieces ---
    await page.click('[data-tab="reglages"]');
    await page.waitForSelector('a[href="#/reglages/pieces"]');
    await capturer(page, dossier, '16-reglages.png');
    await verifierDebordement(page, 'Reglages');
    await verifierZonesTactiles(page, 'Reglages');
    const emailAffiche = (await page.textContent('[data-email]')).trim();
    verifier(emailAffiche === 'demo@example.com', titre, 'reglages : e-mail du compte',
      `E-mail affiche "${emailAffiche}" au lieu de demo@example.com.`);
    const versionAffichee = (await page.textContent('[data-version]')).trim();
    verifier(versionAffichee.includes(version), titre, `reglages : version ${version}`,
      `Les reglages affichent "${versionAffichee}" au lieu de ${version}.`);

    await page.click('a[href="#/reglages/pieces"]');
    await page.waitForSelector('.piece');
    verifier(await nombre('.piece') === 7, titre, 'pieces : les 7 pieces de depart',
      `${await nombre('.piece')} pieces affichees au lieu de 7.`);
    await page.fill('#form-piece [name="nom"]', 'Véranda');
    await page.click('#form-piece button[type="submit"]');
    await page.waitForSelector('.piece:has-text("Véranda")');
    ok('pieces : ajout');

    await page.click('.piece:has-text("Véranda") [data-action="renommer"]');
    await page.waitForSelector('dialog[open] input');
    await page.fill('dialog input', "Jardin d'hiver");
    await page.click('dialog button[value="ok"]');
    await page.waitForSelector(`.piece:has-text("Jardin d'hiver")`);
    ok('pieces : renommage');
    await capturer(page, dossier, '17-pieces.png');
    await verifierDebordement(page, 'Pieces');
    await verifierZonesTactiles(page, 'Pieces');

    await page.click(`.piece:has-text("Jardin d'hiver") [data-action="supprimer"]`);
    await page.waitForSelector('dialog[open]');
    await page.click('dialog button[value="ok"]');
    await page.waitForFunction(() => document.querySelectorAll('.piece').length === 7);
    ok('pieces : suppression');

    // Supprimer une piece ne supprime pas ses plantes : elles passent "Sans piece"
    await page.click('.piece:has-text("Bureau") [data-action="supprimer"]');
    await page.waitForSelector('dialog[open]');
    await page.click('dialog button[value="ok"]');
    await page.waitForFunction(() => document.querySelectorAll('.piece').length === 6);
    await ouvrirListe(page);
    verifier(await nombre('.vignette') === 2 && await nombre('.puce:has-text("Sans pièce")') === 1, titre,
      'supprimer une piece garde ses plantes (elles passent "Sans pièce")',
      'Les plantes de la piece supprimee ont disparu ou ne sont pas classees "Sans pièce".');

    // --- Aujourd'hui + deconnexion ---
    await page.click('[data-tab="aujourdhui"]');
    await page.waitForSelector('.vue__titre:has-text("aujourd")');
    await capturer(page, dossier, '18-aujourdhui.png');
    await page.click('[data-tab="reglages"]');
    await page.click('#logout');
    await page.waitForSelector('#login-form', { timeout: 10000 });
    ok("deconnexion : retour a l'ecran de connexion");
  } catch (e) {
    annoter('error', titre, e.message);
    await capturer(page, dossier, 'erreur.png').catch(() => {});
  } finally {
    await terminer(nav, dossier, titre);
  }
}

