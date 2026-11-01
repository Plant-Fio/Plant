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
      for (const table of ['pieces', 'plantes', 'photos', 'arrosages', 'souhaits']) {
        try {
          const reponse = await fetch(`${urlSupabase}/rest/v1/${table}`, {
            method: 'POST',
            headers: {
              apikey: cle, Authorization: `Bearer ${cle}`,
              'Content-Type': 'application/json', Prefer: 'return=minimal',
            },
            body: JSON.stringify(table === 'photos' ? { chemin: 'verification-ci' }
              : table === 'arrosages' ? { jour: '2000-01-01' } : { nom: 'verification-ci' }),
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
        const reponse = await fetch(`${urlSupabase}/rest/v1/plantes?select=arrosage_jours,dernier_engrais,dernier_rempotage,en_vente,derniere_feuille,prochain_engrais&limit=1`, {
          headers: { apikey: cle, Authorization: `Bearer ${cle}` },
        });
        if (reponse.ok) ok('table plantes : colonnes de soins (arrosage, engrais, rempotage, feuille, en vente) presentes');
        else annoter('error', titre, `Colonnes de rappel absentes de "plantes" (${reponse.status}) : les scripts supabase/03-rappels.sql et 05-evolutions.sql ont-ils ete lances ?`);
      } catch (e) {
        annoter('error', titre, `Verification des colonnes impossible : ${e.message}`);
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
  if (arrosage) await page.fill('[name="arrosage_jours"]', String(arrosage));
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
    await page.check('[name="en_vente"]');
    await page.click('#form-ok');
    await page.waitForSelector('.pastille-vente--fiche');
    ok('en vente : etiquette sur la fiche');
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
    await page.click('[data-action="feuille"]');
    await page.waitForFunction(() => document.querySelector('[data-soin="feuille"]').textContent.trim() === "Aujourd'hui");
    ok('soins : derniere feuille notee "Aujourd\'hui"');

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
    verifier(await nombre('[data-vide]') === 1 && await nombre('.tabbar__badge:not([hidden])') === 0, titre,
      "aujourd'hui : plus rien a arroser, message \"Tout est a jour\", pastille cachee",
      'Apres suppression de la Monstera, l\'ecran Aujourd\'hui devrait afficher "Tout est à jour".');
    await capturer(page, dossier, '19-aujourdhui-a-jour.png');
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

