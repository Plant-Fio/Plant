// Verifications dans un vrai Chromium, au format iPhone, avec captures d'ecran.
// - verifierConnexion : le site "reel" (vrai Supabase) : ecran de connexion, manifest, service worker,
//   mode hors ligne, serveur Supabase joignable, message d'erreur sur un mauvais mot de passe.
// - verifierAppli : une copie du site avec un faux Supabase, pour photographier l'appli connectee.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, devices } from 'playwright';
import jsQR from 'jsqr';
import { annoter, ok, bilan } from './helpers.mjs';

const { defaultBrowserType, ...iphone } = devices['iPhone 14'];

async function ouvrir() {
  // Fausse camera (image de test) pour verifier l'appareil photo de l'appli sans vrai materiel
  const navigateur = await chromium.launch({
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  const contexte = await navigateur.newContext({ ...iphone, locale: 'fr-FR', timezoneId: 'Europe/Paris', permissions: ['camera'] });
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
      for (const table of ['pieces', 'plantes', 'photos', 'arrosages', 'souhaits', 'taches', 'journal', 'problemes', 'appareils_push', 'reglages_notifs']) {
        try {
          const reponse = await fetch(`${urlSupabase}/rest/v1/${table}`, {
            method: 'POST',
            headers: {
              apikey: cle, Authorization: `Bearer ${cle}`,
              'Content-Type': 'application/json', Prefer: 'return=minimal',
            },
            body: JSON.stringify(table === 'photos' ? { chemin: 'verification-ci' }
              : table === 'arrosages' ? { jour: '2000-01-01' }
                : table === 'taches' || table === 'journal' ? { texte: 'verification-ci' }
                  : table === 'problemes' ? { type: 'verification-ci' }
                  : table === 'appareils_push' ? { endpoint: 'verification-ci', p256dh: 'x', auth: 'x' }
                    : table === 'reglages_notifs' ? { heure_matin: 10 } : { nom: 'verification-ci' }),
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

    // Nouvelles colonnes de l'etape 4 : une lecture anonyme est autorisee a repondre (liste vide grace a la RLS),
    // mais si une colonne manque, PostgREST repond 400.
    if (urlSupabase && cle) {
      try {
        const reponse = await fetch(`${urlSupabase}/rest/v1/plantes?select=arrosage_jours,dernier_engrais,dernier_rempotage,en_vente,derniere_feuille,prochain_engrais,mere_id,etape_bouture,date_bouture,type_engrais,vendu_le&limit=1`, {
          headers: { apikey: cle, Authorization: `Bearer ${cle}` },
        });
        if (reponse.ok) ok('table plantes : colonnes de soins (arrosage, engrais, rempotage, feuille, en vente) presentes');
        else annoter('error', titre, `Colonnes de rappel absentes de "plantes" (${reponse.status}) : les scripts supabase/03-rappels.sql et 05-evolutions.sql ont-ils ete lances ?`);
      } catch (e) {
        annoter('error', titre, `Verification des colonnes impossible : ${e.message}`);
      }
    }

    // Colonne date_photo (suivi de l'evolution) sur la table photos
    if (urlSupabase && cle) {
      try {
        const reponse = await fetch(`${urlSupabase}/rest/v1/photos?select=date_photo&limit=1`, {
          headers: { apikey: cle, Authorization: `Bearer ${cle}` },
        });
        if (reponse.ok) ok('table photos : colonne date_photo presente');
        else annoter('error', titre, `Colonne "date_photo" absente de "photos" (${reponse.status}) : le script supabase/05-evolutions.sql a-t-il ete lance ?`);
      } catch (e) {
        annoter('error', titre, `Verification de date_photo impossible : ${e.message}`);
      }
    }

    // Colonne icone (journal)
    if (urlSupabase && cle) {
      try {
        const reponse = await fetch(`${urlSupabase}/rest/v1/journal?select=icone&limit=1`, {
          headers: { apikey: cle, Authorization: `Bearer ${cle}` },
        });
        if (reponse.ok) ok('table journal : colonne icone presente');
        else annoter('error', titre, `Colonne "icone" absente de "journal" (${reponse.status}) : le script supabase/12-journal-icone.sql a-t-il ete lance ?`);
      } catch (e) {
        annoter('error', titre, `Verification de icone impossible : ${e.message}`);
      }
    }

    // Colonne pour_le (taches prevues a l'avance)
    if (urlSupabase && cle) {
      try {
        const reponse = await fetch(`${urlSupabase}/rest/v1/taches?select=pour_le&limit=1`, {
          headers: { apikey: cle, Authorization: `Bearer ${cle}` },
        });
        if (reponse.ok) ok('table taches : colonne pour_le presente');
        else annoter('error', titre, `Colonne "pour_le" absente de "taches" (${reponse.status}) : le script supabase/07-taches-date.sql a-t-il ete lance ?`);
      } catch (e) {
        annoter('error', titre, `Verification de pour_le impossible : ${e.message}`);
      }
    }

    // Bucket "photos" : il doit exister et refuser un depot venant d'un visiteur sans compte.
    // (Bucket absent : "Bucket not found". Bucket present avec RLS : refus "row-level security".)
    if (urlSupabase && cle) {
      try {
        const reponse = await fetch(`${urlSupabase}/storage/v1/object/photos/verification-ci.jpg`, {
          method: 'POST',
          headers: { apikey: cle, Authorization: `Bearer ${cle}`, 'Content-Type': 'image/jpeg' },
          body: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
        });
        const corps = await reponse.json().catch(() => ({}));
        const texte = `${corps.error || ''} ${corps.message || ''}`;
        if (/bucket not found/i.test(texte)) {
          annoter('error', titre, `Le bucket "photos" n'existe pas : le script supabase/02-photos.sql a-t-il ete lance ?`);
        } else if (/row-level security|unauthorized/i.test(texte)) {
          ok('bucket photos : present, depot refuse a un visiteur sans compte');
        } else {
          annoter('error', titre, `Bucket "photos" : reponse inattendue (${reponse.status} ${texte.trim()}). Les regles d'acces sont-elles en place ?`);
        }
      } catch (e) {
        annoter('error', titre, `Bucket "photos" injoignable : ${e.message}`);
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

// Date locale (celle de l'iPhone simule) decalee de n jours, au format AAAA-MM-JJ
const jourRelatif = (page, n) => page.evaluate((decalage) => {
  const d = new Date();
  d.setDate(d.getDate() + decalage);
  const deux = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
}, n);

async function remplirPlante(page, { nom, espece = '', piece = '', date = '', notes = '', arrosage = '' }) {
  await page.fill('[name="nom"]', nom);
  await page.fill('[name="espece"]', espece);
  if (piece) await page.selectOption('#piece', { label: piece });
  if (date) await page.fill('[name="date_acquisition"]', date);
  await page.fill('[name="notes"]', notes);
  if (arrosage) {
    await page.click('[data-onglet="soins"]'); // l'arrosage est dans l'onglet « Soins »
    await page.fill('[name="arrosage_jours"]', String(arrosage));
    await page.click('[data-onglet="infos"]'); // retour sur l'onglet de depart
  }
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
    const nomsPieces = await page.$$eval('#piece option', (o) => o.map((x) => x.textContent.trim()));
    verifier(nomsPieces.join('|') === 'Aucune pièce|Balcon|Bureau|Chambre|Cuisine|Entrée|Salle de bain|Salon', titre,
      'pieces classees de A a Z', `Ordre des pieces : ${nomsPieces.join(', ')}.`);
    await page.click('#form-ok');
    await page.waitForSelector('#form-erreur:not([hidden])');
    ok('le nom de la plante est obligatoire');

    await remplirPlante(page, {
      nom: 'Monstera', espece: 'Monstera deliciosa', piece: 'Salon', date: '2024-03-12', arrosage: 7,
      notes: 'Aime la lumière douce.\nArrosage : une fois par semaine.',
    });
    // Corbeille d'un champ date : efface la valeur puis se cache ; on remet la date ensuite
    await page.click('[data-vider="date_acquisition"]');
    verifier(await page.inputValue('[name="date_acquisition"]') === ''
      && await page.locator('[data-vider="date_acquisition"]').isHidden(), titre,
    'dates : la corbeille efface la valeur (et se cache)', "La corbeille n'efface pas la date.");
    await page.fill('[name="date_acquisition"]', '2024-03-12');
    verifier(await page.locator('[data-vider="date_acquisition"]').isVisible(), titre,
      'dates : la corbeille reapparait quand une date est choisie', 'La corbeille ne reapparait pas.');
    // Quarantaine automatique : l'info apparait des que la date d'acquisition est recente
    verifier(await page.locator('#quarantaine-info').isHidden(), titre,
      'quarantaine : pas de message pour une plante acquise en 2024', 'Le message de quarantaine apparait a tort.');
    await page.fill('[name="date_acquisition"]', await jourRelatif(page, 0));
    verifier(await page.locator('#quarantaine-info').isVisible()
      && (await page.textContent('#quarantaine-info')).includes('Quarantaine'), titre,
    'quarantaine : le formulaire annonce la quarantaine pour une plante acquise aujourd\'hui', 'Pas de message de quarantaine.');
    await capturer(page, dossier, '11-formulaire-quarantaine.png');
    await page.fill('[name="date_acquisition"]', '2024-03-12');
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

    // --- Photos : envoi, compression, couverture, suppression ---
    const petitePhoto = fs.readFileSync('icons/icon-512.png');
    await page.setInputFiles('#hero input[type="file"]', { name: 'monstera.png', mimeType: 'image/png', buffer: petitePhoto });
    // Recadrage : l'ecran s'ouvre ; on tire un coin (le cadre rapetisse), puis « Garder entiere » (photo d'origine)
    await page.waitForSelector('#recadrage #cadre:not([hidden])');
    const avantTirage = await page.evaluate(() => document.querySelector('#cadre').getBoundingClientRect().width);
    const poignee = await page.locator('#cadre [data-coin="se"]').boundingBox();
    await page.mouse.move(poignee.x + poignee.width / 2, poignee.y + poignee.height / 2);
    await page.mouse.down();
    await page.mouse.move(poignee.x + poignee.width / 2 - 100, poignee.y + poignee.height / 2 - 100, { steps: 5 });
    await page.mouse.up();
    const apresTirage = await page.evaluate(() => document.querySelector('#cadre').getBoundingClientRect().width);
    verifier(apresTirage < avantTirage - 60, titre, 'recadrage : tirer un coin reduit le cadre',
      `Le cadre fait ${Math.round(apresTirage)} px au lieu d'environ ${Math.round(avantTirage - 100)} px apres le tirage.`);
    await capturer(page, dossier, '12-recadrage.png');
    await page.click('#recadrage-garder');
    await page.waitForSelector('#recadrage', { state: 'detached' });
    await page.waitForFunction(() => {
      const i = document.querySelector('#hero img');
      return i && i.complete && i.naturalWidth > 0;
    });
    ok('photos : la premiere photo s\'affiche en grand sur la fiche');
    // La photo n'est pas rognee : le cadre a la forme de l'image (ici un carre)
    const forme = await page.evaluate(() => {
      const i = document.querySelector('#hero img');
      const r = i.getBoundingClientRect();
      return { cadre: r.width / r.height, image: i.naturalWidth / i.naturalHeight };
    });
    verifier(Math.abs(forme.cadre - forme.image) < 0.03, titre, 'photos : la grande photo est affichee en entier (non rognee)',
      `Le cadre (${forme.cadre.toFixed(2)}) n'a pas la forme de la photo (${forme.image.toFixed(2)}) : elle est rognee.`);

    // Une grande photo (3000 x 2000) fabriquee dans la page, comme un vrai cliche d'iPhone
    const grandeBase64 = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 3000;
      canvas.height = 2000;
      const c = canvas.getContext('2d');
      const degrade = c.createLinearGradient(0, 0, 3000, 2000);
      degrade.addColorStop(0, '#3B5655');
      degrade.addColorStop(1, '#F6F2E9');
      c.fillStyle = degrade;
      c.fillRect(0, 0, 3000, 2000);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      const octets = new Uint8Array(await blob.arrayBuffer());
      let texte = '';
      for (let i = 0; i < octets.length; i += 8192) texte += String.fromCharCode(...octets.subarray(i, i + 8192));
      return btoa(texte);
    });
    await page.setInputFiles('.bande__ajout input[type="file"]', {
      name: 'grande-photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(grandeBase64, 'base64'),
    });
    // Recadrage en carre : une photo 3000 x 2000 devient 2000 x 2000, puis 1600 x 1600 apres compression
    await page.waitForSelector('#recadrage #cadre:not([hidden])');
    await page.click('[data-format="carre"]');
    await page.click('[data-act="valider"]');
    await page.waitForFunction(() => document.querySelectorAll('.bande__vignette').length === 2);

    const envois = await page.evaluate(() => globalThis.__uploads);
    const cote = (e) => Math.max(e.largeur, e.hauteur);
    const [g1, t1, g2, t2] = envois;
    verifier(envois.length === 4
      && envois.every((e) => e.type === 'image/jpeg' && e.chemin.startsWith('demo/') && e.chemin.endsWith('.jpg')),
    titre, "photos : 2 fichiers JPEG par photo (grande + vignette), dans le dossier de l'utilisatrice",
    `Envois inattendus : ${JSON.stringify(envois)}`);
    verifier(t1?.chemin.endsWith('_t.jpg') && t2?.chemin.endsWith('_t.jpg'), titre,
      'photos : les vignettes portent le suffixe _t.jpg', 'Les vignettes ne sont pas nommees avec _t.jpg.');
    verifier(cote(g1) === 512 && cote(t1) === 400, titre,
      "compression : une petite photo n'est pas agrandie (512 px), sa vignette fait 400 px",
      `Dimensions inattendues pour la petite photo : ${cote(g1)} / ${cote(t1)}.`);
    verifier(cote(g2) === 1600 && cote(t2) === 400, titre,
      'compression : une photo de 3000 px est reduite a 1600 px, sa vignette a 400 px',
      `Dimensions inattendues pour la grande photo : ${cote(g2)} / ${cote(t2)}.`);
    verifier(g2.largeur === g2.hauteur && t2.largeur === t2.hauteur, titre,
      'recadrage : le cadre « Carré » donne bien des photos carrées', `Dimensions apres recadrage carre : ${g2.largeur}x${g2.hauteur}.`);
    verifier(t2.taille < g2.taille, titre, 'compression : la vignette est plus legere que la grande photo',
      'La vignette n\'est pas plus legere que la grande photo.');

    // La premiere photo est la couverture ; on affiche la 2e (derniere ajoutee) et on la choisit
    verifier(await nombre('.couverture') === 0 && await nombre('[data-action="couverture"]') === 1, titre,
      'photos : la premiere photo ajoutee sert de couverture', 'La couverture ne correspond pas a la premiere photo.');
    await page.click('[data-action="couverture"]');
    await page.waitForSelector('.couverture');
    ok('photos : choix de la photo de couverture');

    // Date de la photo : par defaut celle du jour ; modifiable ; la photo la plus ancienne passe en premier
    const aujourdhuiTexte = await page.evaluate(() => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()));
    verifier((await page.textContent('[data-photo-date]')).includes(aujourdhuiTexte), titre,
      "photos : la photo porte la date du jour par defaut", `Date affichee : "${await page.textContent('[data-photo-date]')}".`);
    await page.click('[data-action="date"]');
    await page.waitForSelector('dialog[open] input[type="date"]');
    await page.fill('dialog input[type="date"]', '2025-01-15');
    await page.click('dialog button[value="ok"]');
    await page.waitForFunction(() => document.querySelector('[data-photo-date]').textContent.includes('15 janvier 2025'));
    ok('photos : la date de la photo se modifie');
    const ordre = await page.$$eval('.bande__vignette', (b) => b.map((x) => x.getAttribute('aria-pressed')));
    verifier(ordre[0] === 'true', titre, 'photos : la photo la plus ancienne passe en premier dans la bande',
      `Ordre de la bande : ${ordre.join(',')}.`);

    // Evolution : toutes les photos, de la plus ancienne a la plus recente, avec l'ecart entre elles
    await page.click('a:has-text("Voir l\'évolution")');
    await page.waitForSelector('.evol');
    const legendes = await page.$$eval('.evol__legende', (l) => l.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
    verifier(legendes.length === 2 && legendes[0].includes('15 janvier 2025') && legendes[0].includes('Première photo')
      && /plus tard|lendemain|Le même jour/.test(legendes[1]) && legendes[1].includes(aujourdhuiTexte), titre,
    "evolution : photos classees par date avec l'ecart entre elles", `Legendes : ${JSON.stringify(legendes)}.`);
    await page.waitForFunction(() => [...document.querySelectorAll('.evol img')].length === 2
      && [...document.querySelectorAll('.evol img')].every((i) => i.complete && i.naturalWidth > 0));
    // Frise : le curseur fait defiler les photos (derniere au depart, premiere tout a gauche)
    verifier(await nombre('.frise__curseur') === 1 && (await page.textContent('[data-frise-date]')).includes(aujourdhuiTexte), titre,
      'frise : le curseur demarre sur la photo la plus recente', `Date de la frise : "${await page.textContent('[data-frise-date]')}".`);
    await page.fill('.frise__curseur', '0');
    verifier((await page.textContent('[data-frise-ecart]')).includes('Première photo')
      && (await page.textContent('[data-frise-date]')).includes('15 janvier 2025'), titre,
    'frise : tout a gauche on voit la premiere photo', `Frise : "${await page.textContent('[data-frise-date]')}".`);
    await page.waitForFunction(() => document.querySelectorAll('.frise__img--visible').length === 1);
    await page.fill('.frise__curseur', '1');
    await capturer(page, dossier, '12a-frise.png');
    await capturer(page, dossier, '12-evolution.png');
    await verifierDebordement(page, 'Evolution');
    await page.click('a.retour');
    await page.waitForSelector('#galerie .bande__vignette');

    // Journal de la plante : ajouter une note datee, la voir apparaitre, la supprimer
    verifier(await nombre('#journal textarea[name="note"]') === 1 && await nombre('#journal .journal__note') === 0, titre,
      'journal : la fiche a son journal, vide au depart', 'Le journal est absent ou deja rempli.');
    await page.fill('#journal textarea[name="note"]', 'Nouvelle feuille sortie ce matin');
    await page.click('#journal button[type="submit"]');
    await page.waitForSelector('#journal .journal__note');
    verifier((await page.textContent('#journal .journal__note')).includes('Nouvelle feuille sortie ce matin')
      && (await page.textContent('#journal .journal__date')).includes("Aujourd'hui"), titre,
    'journal : la note apparait avec la date du jour', `Note affichee : "${await page.textContent('#journal .journal__note')}".`);
    verifier((await page.textContent('#journal .journal__pastille')).trim() === '🌱', titre,
      "journal : l'icone est devinee d'apres le texte (feuille = 🌱)", `Icone : "${await page.textContent('#journal .journal__pastille')}".`);
    await page.fill('#journal textarea[name="note"]', 'Cochenilles sous les feuilles');
    verifier(await page.getAttribute('#journal [data-icone="🐛"]', 'aria-pressed') === 'true', titre,
      "journal : l'icone proposee suit ce qu'on ecrit en direct (cochenilles = 🐛)", "L'icone 🐛 n'est pas mise en avant.");
    await page.click('#journal [data-icone="💧"]');
    verifier(await page.getAttribute('#journal [data-icone="💧"]', 'aria-pressed') === 'true', titre,
      "journal : on peut choisir l'icone a la main", "Le choix manuel de l'icone ne marche pas.");
    await page.fill('#journal textarea[name="note"]', '');
    await capturer(page, dossier, '12b-journal.png');
    await page.click('#journal [data-modifier]');
    await page.waitForSelector('#journal textarea[name="edition"]');
    await page.fill('#journal textarea[name="edition"]', 'Note corrigee');
    await page.click('#journal [data-icone-edition="🌸"]');
    await page.click('#journal [data-edition] button[type="submit"]');
    await page.waitForFunction(() => document.querySelector('#journal .journal__contenu')?.textContent.includes('Note corrigee'));
    verifier((await page.textContent('#journal .journal__pastille')).trim() === '🌸', titre,
      "journal : on peut modifier le texte et l'emoji d'une note", `Pastille : "${await page.textContent('#journal .journal__pastille')}".`);
    await page.click('#journal [data-supprimer]');
    await page.click('dialog button[value="ok"]');
    await page.waitForFunction(() => !document.querySelector('#journal .journal__note'));
    ok('journal : la note peut etre supprimee');

    // Appareil photo d'evolution : seulement la derniere photo en transparence, pas de silhouette ni de ligne
    const avantCamera = (await page.evaluate(() => globalThis.__uploads)).length;
    await page.click('[data-action="camera"]');
    await page.waitForSelector('#camera video');
    await page.waitForFunction(() => document.querySelector('#camera video').videoWidth > 0
      && !document.querySelector('#camera-declencheur').disabled);
    ok("camera : l'appareil photo de l'appli s'ouvre et affiche l'image");
    await page.waitForFunction(() => {
      const i = document.querySelector('.camera__fantome');
      return !i.hidden && i.complete && i.naturalWidth > 0;
    });
    ok('camera : la derniere photo apparait en transparence (fantome)');
    verifier(await nombre('.camera__silhouette, .camera__ligne') === 0, titre,
      'camera : plus de silhouette ni de ligne', 'Les anciens reperes sont encore la.');
    await page.click('[data-fantome]');
    verifier(await nombre('.camera__fantome:not([hidden])') === 0, titre,
      'camera : on peut masquer la derniere photo', 'Le fantome reste affiche.');
    await page.click('[data-fantome]');
    await capturer(page, dossier, '12-camera.png');
    await verifierDebordement(page, 'Appareil photo');
    await verifierZonesTactiles(page, 'Appareil photo');
    await page.click('#camera-declencheur');
    await page.waitForFunction(() => document.querySelectorAll('.bande__vignette').length === 3);
    const envoisCamera = (await page.evaluate(() => globalThis.__uploads)).slice(avantCamera);
    const rapport = envoisCamera[0].largeur / envoisCamera[0].hauteur;
    verifier(envoisCamera.length === 2 && Math.abs(rapport - 4 / 3) < 0.03, titre,
      'camera : la photo est enregistree (grande + vignette) au format du cadre, sans les reperes',
      `Envois de la camera : ${JSON.stringify(envoisCamera)}.`);
    // On remet 2 photos pour la suite du parcours (suppression de la 3e, la plus recente)
    await page.click('[data-action="supprimer-photo"]');
    await page.waitForSelector('dialog[open]');
    await page.click('dialog button[value="ok"]');
    await page.waitForFunction(() => document.querySelectorAll('.bande__vignette').length === 2);
    await capturer(page, dossier, '12-fiche-photos.png');
    await verifierDebordement(page, 'Fiche avec photos');
    await verifierZonesTactiles(page, 'Fiche avec photos');

    // Suppression de la photo affichee : la couverture passe a la photo restante
    await page.click('[data-action="supprimer-photo"]');
    await page.waitForSelector('dialog[open]');
    await page.click('dialog button[value="ok"]');
    await page.waitForFunction(() => document.querySelectorAll('.bande__vignette').length === 1);
    verifier(await nombre('.couverture') === 1 && await nombre('#hero img') === 1, titre,
      'photos : apres suppression, la photo restante devient la couverture', 'La couverture n\'a pas ete reportee.');
    verifier(await page.evaluate(() => globalThis.__nombreFichiers()) === 2, titre,
      'photos : les 2 fichiers de la photo supprimee sont retires du stockage',
      'Les fichiers de la photo supprimee sont restes dans le stockage.');

    // --- Liste, recherche, filtre ---
    // Pothos : arrosage tous les 3 jours, acquis hier -> a arroser dans 2 jours (bientot)
    // Ficus : tous les 5 jours, acquis il y a 5 jours -> a arroser aujourd'hui
    await ajouterPlante(page, {
      nom: 'Pothos', espece: 'Epipremnum aureum', piece: 'Bureau', arrosage: 3, date: await jourRelatif(page, -1),
    });
    await ajouterPlante(page, { nom: 'Ficus lyrata', piece: 'Salon', arrosage: 5, date: await jourRelatif(page, -5) });
    await ouvrirListe(page);
    verifier(await nombre('.vignette') === 3, titre, 'liste : 3 plantes en vignettes',
      `La liste affiche ${await nombre('.vignette')} plantes au lieu de 3.`);
    await page.waitForFunction(() => {
      const i = document.querySelector('.vignette__photo img');
      return i && i.complete && i.naturalWidth > 0;
    });
    verifier(await nombre('.vignette:has-text("Monstera") .vignette__photo img') === 1, titre,
      'liste : la photo de couverture s\'affiche sur la vignette', 'La vignette de la Monstera n\'affiche pas sa photo.');
    // Quarantaine : Pothos (acquis hier) et Ficus (il y a 5 jours) sont mis a part, pas la Monstera (2024)
    verifier(await nombre('[data-liste="quarantaine"] .vignette') === 2
      && await nombre('[data-liste="quarantaine"] .vignette:has-text("Monstera")') === 0, titre,
    'quarantaine : 2 plantes recentes mises a part en haut de la liste', 'La section En quarantaine ne contient pas les 2 plantes recentes.');
    verifier((await page.textContent('[data-liste="quarantaine"] .pastille-quarantaine')).includes('Quarantaine'), titre,
      'quarantaine : etiquette sur la vignette', "Pas d'etiquette Quarantaine.");
    await capturer(page, dossier, '13-liste.png');
    await page.click('.puce:has-text("Quarantaine")');
    verifier(await nombre('.vignette') === 2 && await nombre('.section__titre') === 0, titre,
      'quarantaine : le filtre ne montre que les 2 plantes en quarantaine', `Vignettes : ${await nombre('.vignette')}.`);
    await page.click('.puce:has-text("Toutes")');
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

    // Nouvelle plante : la piece ou il y a le plus de plantes (Salon : 2) est proposee d'office
    await page.click('.fab');
    await page.waitForSelector('#form-plante');
    const pieceProposee = await page.$eval('#piece', (s) => s.selectedOptions[0].textContent.trim());
    verifier(pieceProposee === 'Salon', titre, 'nouvelle plante : la piece la plus utilisee (Salon) est proposee',
      `Piece proposee : "${pieceProposee}".`);
    await page.click('a.retour');
    await page.waitForSelector('#puces');

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

    // --- En vente : etiquette, pastille sur la vignette, filtre ---
    await page.click('a:has-text("Modifier")');
    await page.waitForSelector('#form-plante');
    await page.click('[data-onglet="vente"]');
    await page.check('[name="statut"][value="vente"]');
    await page.click('#form-ok');
    await page.waitForSelector('[data-statut="vente"][aria-pressed="true"]');
    ok('en vente : statut « En vente » sur la fiche');
    // Statut en un geste depuis la fiche : Vendu (avec la date), puis retour a En vente
    await page.click('[data-statut="vendu"]');
    await page.waitForSelector('.statut__date');
    verifier((await page.textContent('.statut__date')).includes('Vendue le'), titre,
      'vendu : la fiche affiche la date de vente', `Date : "${await page.textContent('.statut__date')}".`);
    await page.click('[data-statut="vente"]');
    await page.waitForFunction(() => !document.querySelector('.statut__date'));
    ok('vendu : repasser a « En vente » efface la date');
    await ouvrirListe(page);
    await page.waitForSelector('#puces');
    verifier(await nombre('.vignette .pastille-vente') === 1, titre, 'en vente : pastille sur la vignette',
      'La pastille « En vente » est absente de la liste.');
    await page.click('.puce:has-text("En vente")');
    verifier(await nombre('.vignette') === 1, titre, 'en vente : le filtre ne garde que les plantes en vente',
      'Le filtre « En vente » devrait afficher 1 plante.');
    await capturer(page, dossier, '14-liste-en-vente.png');
    await page.click('.puce:has-text("Toutes")');
    await page.click('.vignette:has-text("Monstera")');
    await page.waitForSelector('.fiche__nom');

    // --- Rappels : fiche (soins), ecran Aujourd'hui, pastille ---
    const soin = async (nomSoin) => (await page.textContent(`[data-soin="${nomSoin}"]`)).trim();
    verifier(await soin('frequence') === 'Tous les 7 jours', titre, 'soins : frequence affichee sur la fiche',
      `Frequence affichee : "${await soin('frequence')}".`);
    verifier((await soin('prochain')).startsWith('En retard de'), titre,
      'soins : Monstera (acquise en 2024, tous les 7 jours) est en retard', `Prochain arrosage : "${await soin('prochain')}".`);
    await capturer(page, dossier, '12-fiche-soins.png');
    await verifierDebordement(page, 'Fiche avec soins');
    await verifierZonesTactiles(page, 'Fiche avec soins');

    // Frequence invalide : refusee avec un message
    await page.click('a:has-text("Modifier")');
    await page.waitForSelector('#form-plante');
    await page.click('[data-onglet="soins"]');
    await capturer(page, dossier, '25-form-onglets.png');
    await page.fill('[name="arrosage_jours"]', '400');
    await page.click('#form-ok');
    await page.waitForSelector('#form-erreur:not([hidden])');
    ok('formulaire : une frequence de 400 jours est refusee');
    await page.click('a.retour');
    await page.waitForSelector('.fiche__nom');

    await page.click('[data-tab="aujourdhui"]');
    await page.waitForSelector('.tache');
    verifier(await nombre('[data-liste="afaire"] .tache') === 2, titre,
      "aujourd'hui : 2 plantes a arroser (Monstera en retard, Ficus du jour)",
      `${await nombre('[data-liste="afaire"] .tache')} plantes a arroser au lieu de 2.`);
    verifier((await page.textContent('[data-liste="afaire"] .tache:first-child .tache__nom')).includes('Monstera'), titre,
      "aujourd'hui : la plus en retard est en premier", 'La Monstera devrait etre la premiere de la liste.');
    verifier((await page.textContent('[data-liste="bientot"] .tache__info')).trim() === 'Dans 2 jours', titre,
      "aujourd'hui : le Pothos est annonce \"Dans 2 jours\"", 'Le Pothos devrait etre annonce "Dans 2 jours".');
    verifier((await page.textContent('.tabbar__badge')).trim() === '2', titre,
      "pastille de l'onglet : 2 arrosages a faire", `Pastille : "${await page.textContent('.tabbar__badge')}".`);
    await capturer(page, dossier, '18-aujourdhui.png');
    await verifierDebordement(page, "Aujourd'hui");
    await verifierZonesTactiles(page, "Aujourd'hui");

    await page.click('.tache:has-text("Ficus") [data-arroser]');
    await page.waitForSelector('[data-liste="faites"] .tache:has-text("Ficus")');
    verifier((await page.textContent('.tabbar__badge')).trim() === '1' && await nombre('[data-liste="afaire"] .tache') === 1, titre,
      'arrosee : la plante passe dans "Arrosées aujourd\'hui", la pastille tombe a 1', 'Le bouton Arrosée ne met pas a jour la liste ou la pastille.');
    await capturer(page, dossier, '18-aujourdhui-arrosee.png');
    await page.click('.tache:has-text("Ficus") [data-annuler]');
    await page.waitForSelector('[data-liste="afaire"] .tache:has-text("Ficus")');
    verifier((await page.textContent('.tabbar__badge')).trim() === '2', titre,
      'annuler : la plante revient a arroser, la pastille remonte a 2', "L'annulation ne remet pas la plante a arroser.");
    await page.click('.tache:has-text("Ficus") [data-arroser]');
    await page.waitForSelector('[data-liste="faites"] .tache:has-text("Ficus")');

    // Fiche de la Monstera : arrosage, historique, annulation, engrais, rempotage
    await page.click('.tache:has-text("Monstera") .tache__lien');
    await page.waitForSelector('[data-action="arroser"]');
    await page.click('[data-action="arroser"]');
    await page.waitForSelector('[data-action="arroser"][disabled]');
    verifier(await soin('dernier') === "Aujourd'hui" && (await soin('prochain')) === 'Dans 7 jours', titre,
      'soins : arrosage note, prochain arrosage dans 7 jours', `Dernier : "${await soin('dernier')}", prochain : "${await soin('prochain')}".`);
    verifier(await nombre('[data-historique] li') === 1, titre, "soins : l'arrosage apparait dans l'historique",
      "L'historique est vide apres un arrosage.");
    await page.click('[data-annuler]');
    await page.waitForSelector('dialog[open]');
    await page.click('dialog button[value="ok"]');
    await page.waitForFunction(() => !document.querySelector('[data-historique]'));
    verifier((await soin('prochain')).startsWith('En retard de'), titre,
      "soins : supprimer l'arrosage recalcule le prochain arrosage", 'Le prochain arrosage ne revient pas en retard.');
    await page.click('[data-action="engrais"]');
    await page.waitForFunction(() => document.querySelector('[data-soin="engrais"]').textContent.trim() === "Aujourd'hui");
    await page.click('[data-action="rempotage"]');
    await page.waitForFunction(() => document.querySelector('[data-soin="rempotage"]').textContent.trim() === "Aujourd'hui");
    ok('soins : engrais et rempotage notes "Aujourd\'hui"');
    verifier(await nombre('[data-soin="feuille"]') === 0 && await nombre('[data-action="feuille"]') === 0, titre,
      'soins : la ligne « Dernière feuille » a disparu (remplacée par le journal)', 'La ligne ou le bouton « Dernière feuille » est encore là.');

    // Suivi des problemes : signaler, voir la relance, traiter, resoudre
    await page.click('#problemes [data-ouvrir]');
    await page.selectOption('#problemes select[name="type"]', 'Cochenilles');
    await page.fill('#problemes textarea[name="note"]', 'Savon noir');
    await page.selectOption('#problemes select[name="relance"]', '3');
    await page.click('#problemes button[type="submit"]');
    await page.waitForSelector('#problemes .probleme');
    verifier((await page.textContent('#problemes .probleme')).includes('Cochenilles')
      && (await page.textContent('#problemes .probleme__relance')).includes('dans 3 jours'), titre,
    'problemes : un probleme signale apparait avec sa relance', `Probleme : "${await page.textContent('#problemes .probleme')}".`);
    await capturer(page, dossier, '20-probleme-fiche.png');
    // « Autre » : on precise le probleme ; « Autre duree » : on choisit le nombre de jours
    await page.click('#problemes [data-ouvrir]');
    verifier(await page.isHidden('#problemes input[name="type_autre"]') && await page.isHidden('#problemes input[name="relance_autre"]'), titre,
      'problemes : les champs « preciser » sont caches par defaut', 'Les champs de precision sont visibles trop tot.');
    await page.selectOption('#problemes select[name="type"]', 'Autre');
    await page.fill('#problemes input[name="type_autre"]', 'Thrips');
    await page.selectOption('#problemes select[name="relance"]', 'autre');
    await page.fill('#problemes input[name="relance_autre"]', '10');
    await page.click('#problemes button[type="submit"]');
    await page.waitForFunction(() => [...document.querySelectorAll('#problemes .probleme')].some((l) => l.textContent.includes('Thrips') && l.textContent.includes('dans 10 jours')));
    ok('problemes : « Autre » precise (Thrips) et relance personnalisee (10 jours)');
    await capturer(page, dossier, '20b-probleme-autre.png');
    // Regle generale : aucune zone de texte visible ne colle son texte au bord du haut
    await page.click('#problemes [data-ouvrir]');
    const zonesCollees = await page.$$eval('textarea', (zones) => zones.filter((z) => z.offsetParent !== null && parseFloat(getComputedStyle(z).paddingTop) < 10)
      .map((z) => z.name || z.id || z.className));
    verifier(zonesCollees.length === 0, titre, 'champs : aucune zone de texte n\'a son texte colle au bord du haut',
      `Zones de texte sans espace en haut : ${zonesCollees.join(', ')}.`);
    await page.click('#problemes [data-annuler]');
    await page.click('#problemes [data-resolu]');
    await page.waitForSelector('#problemes .probleme--resolu');
    ok('problemes : « Résolu » range le probleme dans les resolus');

    // Petits : « Ajouter un baby » depuis la mere, bandeau + etapes sur la fiche du petit, retour vers la mere
    const adresseMere = await page.evaluate(() => location.hash);
    verifier((await page.textContent('#petits')).includes('Pas encore de baby'), titre,
      'petits : une plante sans petit le dit', `Carte petits : "${await page.textContent('#petits')}".`);
    await page.click('#petits [data-rattacher]');
    verifier(await page.isVisible('#petits [data-rattacher-liste]'), titre,
      'petits : « Rattacher une plante deja creee » ouvre la liste', 'La liste de rattachement ne s\'ouvre pas.');
    await page.click('#petits a:has-text("Nouveau baby")');
    await page.waitForSelector('#form-plante');
    await page.click('[data-onglet="baby"]');
    verifier(await page.isVisible('#bloc-petit') && (await page.inputValue('input[name="mere_id"]')) !== '', titre,
      'petits : le formulaire arrive avec la mere deja choisie', 'La mere n\'est pas preselectionnee.');
    await page.click('#mere-choix [data-mere-ouvrir]');
    await page.waitForSelector('#mere-lignes [data-mere-id]');
    verifier((await page.$$('#mere-lignes .mere-ligne__photo')).length > 0, titre,
      'petits : la liste des meres montre une photo par plante', 'Pas de vignette dans la liste des meres.');
    await page.click('#mere-lignes [data-mere-id]');
    verifier(await page.isHidden('#mere-liste') && (await page.inputValue('input[name="mere_id"]')) !== '', titre,
      'petits : choisir une mere dans la liste la selectionne', 'La mere choisie n\'est pas retenue.');
    await capturer(page, dossier, '24-choix-mere.png');
    await page.click('[data-onglet="infos"]');
    await page.fill('input[name="nom"]', 'Mini bouture');
    await page.click('#form-ok');
    await page.waitForSelector('.bandeau-petit');
    verifier((await page.textContent('.bandeau-petit')).includes('Baby de'), titre,
      'petits : la fiche du petit montre « Baby de … »', `Bandeau : "${await page.textContent('.bandeau-petit')}".`);
    verifier(await page.getAttribute('[data-etape="preleve"]', 'aria-pressed') === 'true', titre,
      'petits : un nouveau baby commence a l\'etape « Prelevé »', 'L\'etape de depart n\'est pas « Prelevé ».');
    await page.click('[data-etape="eau"]');
    await page.waitForFunction(() => document.querySelector('[data-etape="eau"]').getAttribute('aria-pressed') === 'true');
    ok('petits : on touche une etape pour avancer (Dans l\'eau)');
    await capturer(page, dossier, '22-petit-fiche.png');
    await page.click('.bandeau-petit');
    await page.waitForSelector('#petits .petit');
    verifier((await page.textContent('#petits')).includes('Ses babies · 1') && (await page.textContent('#petits .petit')).includes('dans l\'eau'), titre,
      'petits : la mere liste son petit avec son etape', `Carte petits : "${await page.textContent('#petits')}".`);
    await capturer(page, dossier, '23-petits-mere.png');
    // On supprime le petit pour ne pas fausser la suite
    await page.click('#petits .petit');
    await page.waitForSelector('.bandeau-petit');
    await page.click('a:has-text("Modifier")');
    await page.waitForSelector('#supprimer');
    await page.click('#supprimer');
    await page.click('dialog button[value="ok"]');
    await page.waitForSelector('.vignette, .vide');
    await page.evaluate((h) => { location.hash = h; }, adresseMere);
    await page.waitForSelector('#petits');
    ok('petits : le petit supprime, retour sur la mere');

    // --- Etiquettes QR : lisibles (meme reduites a la finesse de l'imprimante), a la bonne taille, et le QR rouvre la fiche ---
    const idMereEtiquette = adresseMere.split('/')[2];
    const codeAttendu = await page.evaluate(async (id) => (await import('./js/etiquette.js')).idVersCode(id), idMereEtiquette);
    await page.click('a:has-text("Étiquette QR")');
    await page.waitForSelector('#etiquette-canvas');
    for (const [id, largeur, hauteur] of [['transparente', 480, 224], ['blanche', 640, 224], ['verte', 640, 192]]) {
      await page.click(`[data-format="${id}"]`);
      await page.waitForFunction(([l, h]) => { const c = document.querySelector('#etiquette-canvas'); return c.width === l && c.height === h; }, [largeur, hauteur]);
      // Lecture a taille d'impression : l'image est reduite de moitie (8 points/mm), comme sur l'imprimante
      const image = await page.evaluate(() => {
        const c = document.querySelector('#etiquette-canvas');
        const reduit = document.createElement('canvas');
        reduit.width = c.width / 2; reduit.height = c.height / 2;
        const ctx = reduit.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, reduit.width, reduit.height);
        ctx.drawImage(c, 0, 0, reduit.width, reduit.height);
        const d = ctx.getImageData(0, 0, reduit.width, reduit.height);
        return { l: reduit.width, h: reduit.height, data: Array.from(d.data) };
      });
      const lu = jsQR(Uint8ClampedArray.from(image.data), image.l, image.h);
      verifier(lu && lu.data.endsWith(`#/q/${codeAttendu}`), titre,
        `etiquette ${id} : le QR est lisible a la finesse de l'imprimante et contient la bonne plante`, `QR illisible ou faux (lu : ${lu ? lu.data : 'rien'}).`);
    }
    await capturer(page, dossier, '26-etiquette.png');
    await page.evaluate((c) => { location.hash = `#/q/${c}`; }, codeAttendu);
    await page.waitForFunction((h) => location.hash === h, adresseMere);
    await page.waitForSelector('#petits');
    ok('etiquette : le lien du QR (#/q/...) ouvre la fiche de la plante');

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
    verifier(await page.evaluate(() => globalThis.__nombreFichiers()) === 0, titre,
      "suppression d'une plante : ses fichiers photo sont supprimes aussi",
      'Des fichiers photo sont restes dans le stockage apres la suppression de la plante.');

    // --- Pieces ---
    await page.click('[data-tab="reglages"]');
    await page.waitForSelector('a[href="#/reglages/pieces"]');
    await capturer(page, dossier, '16-reglages.png');
    // Bilan du mois
    await page.click('a[href="#/reglages/bilan"]');
    await page.waitForSelector('.bilan__tuiles, [data-mois]');
    verifier(await nombre('.bilan__tuile') === 6 || await nombre('.vide') === 1, titre, 'bilan : le bilan du mois s\'affiche',
      'Le bilan du mois ne s\'affiche pas.');
    // Une pression sur la fleche = un seul mois (apres plusieurs visites de l'ecran)
    await page.click('a.retour');
    await page.waitForSelector('a[href="#/reglages/bilan"]');
    await page.click('a[href="#/reglages/bilan"]');
    await page.waitForSelector('[data-mois="-1"]');
    const moisAvant = await page.textContent('.bilan__titre');
    await page.click('[data-mois="-1"]');
    const moisApres = await page.textContent('.bilan__titre');
    const attendu = await page.evaluate(() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
      const t = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(d); return t.charAt(0).toUpperCase() + t.slice(1); });
    verifier(moisApres.trim() === attendu, titre, 'bilan : la fleche recule d\'un seul mois, meme apres plusieurs visites',
      `Avant : "${moisAvant}", apres : "${moisApres}", attendu : "${attendu}".`);
    await page.click('[data-mois="1"]');
    await capturer(page, dossier, '21-bilan.png');
    await page.click('a.retour');
    await page.waitForSelector('a[href="#/reglages/pieces"]');
    await verifierDebordement(page, 'Reglages');
    await verifierZonesTactiles(page, 'Reglages');
    const emailAffiche = (await page.textContent('[data-email]')).trim();
    verifier(emailAffiche === 'demo@example.com', titre, 'reglages : e-mail du compte',
      `E-mail affiche "${emailAffiche}" au lieu de demo@example.com.`);
    // Bouton « Verifier les mises a jour » : il repond par un message (a jour, ou impossible ici)
    await page.click('#maj');
    await page.waitForSelector('.message');
    ok('reglages : le bouton « Verifier les mises a jour » repond');
    const versionAffichee = (await page.textContent('[data-version]')).trim();
    verifier(versionAffichee.includes(version), titre, `reglages : version ${version}`,
      `Les reglages affichent "${versionAffichee}" au lieu de ${version}.`);

    // --- Notifications : etat de l'appareil (iPhone non installe), reglages des heures ---
    verifier((await page.textContent('#notifs-etat')).includes("écran d'accueil") && await page.locator('#notifs-activer').isHidden(), titre,
      "notifications : sur iPhone non installe, l'appli explique d'ajouter l'ecran d'accueil", `Message : "${await page.textContent('#notifs-etat')}".`);
    verifier(await page.inputValue('#heure-matin') === '10' && await page.inputValue('#heure-soir') === '20'
      && await page.isChecked('#matin-actif') && await page.isChecked('#soir-actif'), titre,
    'notifications : par defaut 10 h le matin et 20 h le soir', 'Les heures par defaut ne sont pas 10 h et 20 h.');
    await verifierZonesTactiles(page, 'Reglages (notifications)');
    await page.selectOption('#heure-matin', '8');
    await page.uncheck('#soir-actif');
    await page.waitForSelector('.message:has-text("Réglages enregistrés")');
    await page.click('[data-tab="plantes"]');
    await page.waitForSelector('#puces, .vide');
    await page.click('[data-tab="reglages"]');
    await page.waitForSelector('#notifs');
    await page.waitForFunction(() => document.querySelector('#heure-matin').value === '8');
    verifier(!(await page.isChecked('#soir-actif')), titre,
      'notifications : les reglages sont enregistres et retrouves', 'Les reglages de notification ne sont pas retrouves.');
    await capturer(page, dossier, '17-notifications.png');

    // --- Themes : Herbier (defaut), Serre de nuit, Fleuriste ---
    const fondDe = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const polices = () => page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, ''));
    });
    const fondHerbier = await fondDe();
    verifier(await nombre('.theme') === 3, titre, 'themes : trois choix dans Reglages',
      `${await nombre('.theme')} vignettes de theme au lieu de 3.`);
    const attendus = { serre: 'Bodoni Moda', fleuriste: 'Young Serif', herbier: 'Cormorant Garamond' };
    for (const [id, police] of [['serre', attendus.serre], ['fleuriste', attendus.fleuriste], ['herbier', attendus.herbier]]) {
      await page.click(`[data-theme-id="${id}"]`);
      const attribut = await page.evaluate(() => document.documentElement.dataset.theme);
      verifier(attribut === id, titre, `theme ${id} : applique tout de suite`, `data-theme vaut "${attribut}" au lieu de "${id}".`);
      const fond = await fondDe();
      if (id !== 'herbier') {
        verifier(fond !== fondHerbier, titre, `theme ${id} : le fond change`, `Le fond reste ${fond}.`);
      }
      const charges = await polices();
      verifier(charges.includes(police), titre, `theme ${id} : police ${police} chargee`,
        `Polices chargees : ${charges.join(', ') || 'aucune'}.`);
      const presse = await page.getAttribute(`[data-theme-id="${id}"]`, 'aria-pressed');
      verifier(presse === 'true', titre, `theme ${id} : la vignette est marquee choisie`, `aria-pressed = ${presse}.`);
      await page.waitForTimeout(400); // laisse finir les transitions de couleur avant la capture
      await capturer(page, dossier, `17-theme-${id}-reglages.png`);
      await verifierDebordement(page, `Reglages (${id})`);
      await verifierZonesTactiles(page, `Reglages (${id})`);
      if (id !== 'herbier') {
        await page.click('[data-tab="plantes"]');
        await page.waitForSelector('.vignette, .vide');
        if (id === 'fleuriste') {
          const teintes = await page.evaluate(() => [...document.querySelectorAll('.vignette[data-teinte]')].map((v) => getComputedStyle(v).backgroundColor));
          verifier(teintes.length > 0 && teintes.every((t) => t !== 'rgb(255, 255, 255)' && t !== 'rgba(0, 0, 0, 0)'), titre,
            'theme fleuriste : les cartes prennent la teinte de leur piece', `Fonds des cartes : ${teintes.join(' | ') || 'aucune carte avec piece'}.`);
        }
        await page.waitForTimeout(400);
        await capturer(page, dossier, `17-theme-${id}-liste.png`);
        await verifierDebordement(page, `Liste (${id})`);
        await verifierZonesTactiles(page, `Liste (${id})`);
        await page.click('[data-tab="aujourdhui"]');
        await page.waitForSelector('.section__titre, .vide');
        await capturer(page, dossier, `17-theme-${id}-aujourdhui.png`);
        await page.click('[data-tab="reglages"]');
        await page.waitForSelector('.theme');
      }
    }
    // Le choix est garde : on prend Serre de nuit, puis un nouvel onglet l'applique des l'ouverture
    await page.click('[data-theme-id="serre"]');
    const autre = await page.context().newPage();
    await autre.goto(base, { waitUntil: 'domcontentloaded' });
    const dansNouvelOnglet = await autre.evaluate(() => document.documentElement.dataset.theme);
    await autre.close();
    verifier(dansNouvelOnglet === 'serre', titre, 'theme : garde et applique des l\'ouverture', `data-theme vaut "${dansNouvelOnglet}".`);
    await page.click('[data-theme-id="herbier"]');

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

    // --- Liste de souhaits ---
    await page.click('[data-tab="souhaits"]');
    await page.waitForSelector('.vide__titre:has-text("Ta liste est vide")');
    ok('souhaits : message de liste vide');
    await capturer(page, dossier, '20-souhaits-vide.png');
    await page.click('.fab');
    await page.waitForSelector('#form-souhait');
    await page.click('#form-ok');
    await page.waitForSelector('#form-erreur:not([hidden])');
    ok('souhaits : le nom est obligatoire');
    await page.fill('[name="nom"]', 'Calathea orbifolia');
    await page.fill('[name="espece"]', 'Goeppertia orbifolia');
    await page.fill('[name="note"]', 'Vue chez le fleuriste du marche, environ 25 EUR.');
    // Annuler le recadrage : aucune photo n'est ajoutee
    await page.setInputFiles('#apercu input[type="file"]', { name: 'test.png', mimeType: 'image/png', buffer: fs.readFileSync('icons/icon-512.png') });
    await page.waitForSelector('#recadrage');
    await page.click('[data-act="annuler"]');
    await page.waitForSelector('#recadrage', { state: 'detached' });
    verifier(await nombre('#apercu img') === 0, titre, 'souhaits : annuler le recadrage n\'ajoute pas la photo',
      'Une photo est apparue malgre l\'annulation du recadrage.');
    const avantEnvois = (await page.evaluate(() => globalThis.__uploads)).length;
    await page.setInputFiles('#apercu input[type="file"]', { name: 'calathea.png', mimeType: 'image/png', buffer: fs.readFileSync('icons/icon-512.png') });
    await page.waitForSelector('#recadrage #cadre:not([hidden])');
    await page.click('#recadrage-garder');
    await page.waitForSelector('#apercu img');
    // Bug corrige en 0.5.1 : le champ photo invisible recouvrait tout le formulaire une fois la photo choisie
    await page.locator('[name="note"]').scrollIntoViewIfNeeded();
    const surLaNote = await page.evaluate(() => {
      const r = document.querySelector('[name="note"]').getBoundingClientRect();
      return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.getAttribute('name');
    });
    verifier(surLaNote === 'note', titre, 'souhaits : apres le choix de la photo, les champs restent cliquables',
      "Le champ photo recouvre le formulaire : toucher la note ouvrirait la photothèque.");
    await capturer(page, dossier, '20-souhaits-formulaire.png');
    await verifierDebordement(page, 'Formulaire de souhait');
    await page.click('#form-ok');
    await page.waitForSelector('#je-lai');
    const envoisSouhait = (await page.evaluate(() => globalThis.__uploads)).slice(avantEnvois);
    verifier(envoisSouhait.length === 2 && envoisSouhait.every((e) => e.chemin.startsWith('demo/souhaits/')), titre,
      "souhaits : la photo d'inspiration est compressee et rangee dans le dossier souhaits/",
      `Envois inattendus : ${JSON.stringify(envoisSouhait)}`);
    verifier((await page.textContent('.fiche__nom')).includes('Calathea') && (await page.textContent('.notes')).includes('25 EUR'), titre,
      'souhaits : fiche du souhait (nom, note)', 'La fiche du souhait est incomplete.');
    await page.waitForFunction(() => {
      const i = document.querySelector('#photo-souhait img');
      return i && i.complete && i.naturalWidth > 0;
    });
    ok("souhaits : la photo d'inspiration s'affiche");
    await capturer(page, dossier, '20-souhait-fiche.png');
    await verifierDebordement(page, 'Fiche de souhait');
    await verifierZonesTactiles(page, 'Fiche de souhait');

    // Un deuxieme souhait, sans photo, puis la liste
    await page.click('a:has-text("Souhaits")');
    await page.waitForSelector('.fab');
    await page.click('.fab');
    await page.waitForSelector('#form-souhait');
    await page.fill('[name="nom"]', 'Alocasia');
    await page.click('#form-ok');
    await page.waitForSelector('#je-lai');
    await page.click('a:has-text("Souhaits")');
    await page.waitForSelector('[data-liste-souhaits]');
    verifier(await nombre('[data-liste-souhaits] .vignette') === 2, titre, 'souhaits : 2 souhaits dans la liste',
      `${await nombre('[data-liste-souhaits] .vignette')} souhaits au lieu de 2.`);
    await page.waitForFunction(() => document.querySelector('[data-liste-souhaits] img')?.naturalWidth > 0);
    await capturer(page, dossier, '20-souhaits-liste.png');
    await verifierDebordement(page, 'Liste de souhaits');
    await verifierZonesTactiles(page, 'Liste de souhaits');

    // Supprimer le souhait sans photo (avec confirmation)
    await page.click('.vignette:has-text("Alocasia")');
    await page.click('a:has-text("Modifier")');
    await page.waitForSelector('#supprimer');
    await page.click('#supprimer');
    await page.waitForSelector('dialog[open]');
    await page.click('dialog button[value="ok"]');
    await page.waitForSelector('[data-liste-souhaits]');
    verifier(await nombre('[data-liste-souhaits] .vignette') === 1, titre, 'souhaits : suppression', "Le souhait n'a pas ete supprime.");

    // "Je l'ai !" : devient une plante, avec sa photo, et quitte la liste
    await page.click('[data-tab="plantes"]');
    await page.waitForSelector('#puces');
    const plantesAvant = await nombre('.vignette');
    await page.click('[data-tab="souhaits"]');
    await page.click('.vignette:has-text("Calathea")');
    await page.click('#je-lai');
    await page.waitForSelector('dialog[open]');
    await page.click('dialog button[value="ok"]');
    await page.waitForSelector('#galerie .bande__vignette'); // fiche de la plante (et non du souhait)
    verifier((await page.textContent('.fiche__nom')).includes('Calathea') && await nombre('.bande__vignette') === 1, titre,
      "souhaits : « Je l'ai ! » cree la plante avec la photo d'inspiration", 'La plante creee depuis le souhait est incomplete.');
    verifier((await page.textContent('.notes')).includes('25 EUR'), titre, 'souhaits : la note devient les notes de la plante',
      'La note du souhait est perdue.');
    await page.click('[data-tab="souhaits"]');
    await page.waitForSelector('.vide__titre:has-text("Ta liste est vide")');
    ok('souhaits : le souhait realise a quitte la liste');
    await page.click('[data-tab="plantes"]');
    await page.waitForSelector('#puces');
    verifier(await nombre('.vignette') === plantesAvant + 1, titre, 'souhaits : une plante de plus dans la collection',
      'Le nombre de plantes ne correspond pas.');

    // --- Aujourd'hui + deconnexion ---
    await page.click('[data-tab="aujourdhui"]');
    await page.waitForSelector('.vue__titre:has-text("aujourd")');
    await page.waitForSelector('[data-liste="faites"] .tache:has-text("Ficus")');
    // Engrais : une « prochaine dose » fixee a aujourd'hui apparait dans Aujourd'hui (et dans la pastille)
    await page.click('[data-tab="plantes"]');
    await page.waitForSelector('#puces');
    await page.click('.vignette:has-text("Pothos")');
    await page.waitForSelector('#soins');
    await page.click('a:has-text("Modifier")');
    await page.waitForSelector('#form-plante');
    await page.click('[data-onglet="soins"]');
    await page.fill('[name="prochain_engrais"]', await jourRelatif(page, 0));
    await page.click('#form-ok');
    await page.waitForSelector('#soins');
    verifier((await soin('prochain-engrais')) === "Aujourd'hui", titre, "engrais : « Prochaine dose » affichee sur la fiche",
      `Prochaine dose : "${await soin('prochain-engrais')}".`);
    await page.click('[data-tab="aujourdhui"]');
    await page.waitForSelector('[data-liste="engrais"] .tache:has-text("Pothos")');
    verifier((await page.textContent('.tabbar__badge')).trim() === '1', titre,
      "engrais : la pastille compte aussi l'engrais du jour", `Pastille : "${await page.textContent('.tabbar__badge')}".`);
    await capturer(page, dossier, '18-aujourdhui-engrais.png');
    await page.click('[data-liste="engrais"] .tache:has-text("Pothos") [data-engrais]');
    await page.waitForSelector('[data-liste="engrais"]', { state: 'detached' });
    ok('engrais : « Fait » retire la plante de la liste');
    await page.click('[data-tab="plantes"]');
    await page.waitForSelector('#puces');
    await page.click('.vignette:has-text("Pothos")');
    await page.waitForSelector('#soins');
    verifier((await soin('engrais')) === "Aujourd'hui" && (await soin('prochain-engrais')) === '—', titre,
      'engrais : dernier engrais = aujourd\'hui, prochaine dose effacee', `Dernier : "${await soin('engrais')}", prochaine : "${await soin('prochain-engrais')}".`);
    await page.click('[data-tab="aujourdhui"]');
    await page.waitForSelector('[data-vide]');
    verifier(await nombre('[data-vide]') === 1 && await nombre('.tabbar__badge:not([hidden])') === 0, titre,
      "aujourd'hui : plus rien a arroser, message \"Tout est a jour\", pastille cachee",
      'Apres suppression de la Monstera, l\'ecran Aujourd\'hui devrait afficher "Tout est à jour".');
    await capturer(page, dossier, '19-aujourdhui-a-jour.png');

    // --- Taches libres ---
    verifier((await page.getAttribute('#form-tache [name="texte"]', 'placeholder')) === 'Nouvelle tâche…', titre,
      'taches : le champ a juste une invitation (« Nouvelle tâche… »), pas d\'exemple', 'Le champ de tache n\'a pas la bonne invitation.');
    await page.click('[data-quand="aujourdhui"]');
    await page.fill('#form-tache [name="texte"]', 'Vaporiser les plantes du salon');
    await page.click('#form-tache button[type="submit"]');
    await page.waitForSelector('[data-liste="mes-taches"] .tache');
    verifier(await nombre('[data-liste="mes-taches"] .tache:has-text("Vaporiser les plantes du salon")') === 1
      && (await page.textContent('.tabbar__badge')).trim() === '1', titre,
    'taches : la tache est ajoutee et comptee dans la pastille', 'La tache libre ne s\'affiche pas ou n\'est pas comptee.');
    await page.fill('#form-tache [name="texte"]', 'Nettoyer les feuilles du Ficus');
    await capturer(page, dossier, '19-aujourdhui-taches.png');
    await page.click('[data-tache-fait]');
    await page.waitForSelector('.tache--faite');
    verifier(await nombre('.tache--faite') === 1 && await page.inputValue('#form-tache [name="texte"]') === 'Nettoyer les feuilles du Ficus'
      && await nombre('.tabbar__badge:not([hidden])') === 0, titre,
    'taches : cocher la tache la barre (sans perdre le texte en cours de saisie)', 'Cocher la tache ne marche pas ou efface le champ.');
    await page.click('[data-tache-annuler]');
    await page.waitForSelector('[data-tache-fait]');
    ok('taches : on peut annuler le « fait »');
    verifier((await page.textContent('[data-tache] .tache__pastille')).trim() === '💧', titre,
      'taches : la pastille emoji est devinee d\'apres le texte (vaporiser = 💧)', `Pastille : "${await page.textContent('[data-tache] .tache__pastille')}".`);
    await page.click('[data-tache-menu]');
    await page.click('[data-tache-suppr]');
    await page.waitForFunction(() => !document.querySelector('[data-tache]'));
    ok('taches : la tache peut etre supprimee (en touchant son texte)');
    // Tache prevue pour demain (on la saisit le soir) : section « A venir », pas encore dans la pastille
    await page.click('[data-quand="demain"]');
    await page.fill('#form-tache [name="texte"]', 'Vaporiser demain');
    await page.click('#form-tache button[type="submit"]');
    await page.waitForSelector('[data-liste="a-venir"] .tache');
    verifier(await nombre('[data-liste="a-venir"] .tache:has-text("Demain")') === 1
      && await nombre('[data-liste="mes-taches"] .tache') === 0 && await nombre('.tabbar__badge:not([hidden])') === 0, titre,
    'taches : une tache pour demain va dans « A venir » (pas dans Mes taches ni la pastille)', 'La tache de demain est mal rangee.');
    await page.click('[data-quand="autre"]');
    await page.waitForSelector('#tache-date');
    ok('taches : le choix « Autre date » affiche un calendrier');
    await capturer(page, dossier, '19-aujourdhui-a-venir.png');
    await page.click('[data-tache-menu]');
    await page.click('[data-tache-suppr]');
    await page.waitForFunction(() => !document.querySelector('[data-tache]'));
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

