// Mes plantes - socle (etape 1) : connexion + navigation par onglets.
// Les ecrans "Plantes" et "Aujourd'hui" sont des emplacements : ils se remplissent aux etapes suivantes.

// vendor/supabase.js est fabrique par la CI (voir scripts/build.sh) : la bibliotheque Supabase
// est embarquee dans le site, ce qui permet de la mettre en cache pour le mode hors ligne.
import { createClient } from '../vendor/supabase.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const VERSION = globalThis.APP_VERSION || '?';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

const racine = document.getElementById('app');
let session = null;

// ---------- Petits outils ----------

// Protege l'affichage de texte venant de l'exterieur (ex. l'e-mail) dans du HTML.
function echapper(texte) {
  return String(texte).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const CHEMINS_ICONES = {
  feuille:
    '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/>' +
    '<path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
  goutte:
    '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
  reglages:
    '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>' +
    '<line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>' +
    '<line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>' +
    '<line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/>' +
    '<line x1="17" y1="16" x2="23" y2="16"/>',
};

function icone(nom) {
  return `<svg class="icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
    `${CHEMINS_ICONES[nom]}</svg>`;
}

// "dimanche 1 novembre" -> "Dimanche 1 novembre"
function dateDuJour() {
  const texte = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date());
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

// ---------- Connexion ----------

function traduireErreur(erreur) {
  const message = String(erreur?.message || '');
  if (!navigator.onLine || erreur?.name === 'AuthRetryableFetchError' || /fetch|network/i.test(message)) {
    return 'Impossible de joindre le serveur. Vérifie ta connexion internet.';
  }
  if (/invalid login credentials/i.test(message)) {
    return 'E-mail ou mot de passe incorrect.';
  }
  return 'Connexion impossible pour le moment. Réessaie dans un instant.';
}

function afficherConnexion() {
  racine.innerHTML = `
    <main class="connexion">
      <div class="connexion__logo">${icone('feuille')}</div>
      <h1 class="connexion__titre">Mes plantes</h1>
      <p class="connexion__sous">Connecte-toi pour retrouver tes plantes.</p>
      <form id="login-form" novalidate>
        <label class="champ">
          <span class="champ__label">E-mail</span>
          <input class="champ__input" id="email" name="email" type="email" inputmode="email"
                 autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required>
        </label>
        <label class="champ">
          <span class="champ__label">Mot de passe</span>
          <input class="champ__input" id="password" name="password" type="password"
                 autocomplete="current-password" required>
        </label>
        <p class="erreur-form" id="login-error" role="alert" hidden></p>
        <button class="btn btn--primaire" id="login-submit" type="submit">Se connecter</button>
      </form>
      <p class="version" data-version>Version ${echapper(VERSION)}</p>
    </main>`;

  const formulaire = document.getElementById('login-form');
  const zoneErreur = document.getElementById('login-error');
  const bouton = document.getElementById('login-submit');

  const montrerErreur = (texte) => { zoneErreur.textContent = texte; zoneErreur.hidden = false; };

  formulaire.addEventListener('submit', async (evenement) => {
    evenement.preventDefault();
    zoneErreur.hidden = true;
    const email = formulaire.elements.email.value.trim();
    const motDePasse = formulaire.elements.password.value;
    if (!email || !motDePasse) {
      montrerErreur('Renseigne ton e-mail et ton mot de passe.');
      return;
    }
    bouton.disabled = true;
    bouton.textContent = 'Connexion…';
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: motDePasse });
      if (error) throw error;
      // Succes : onAuthStateChange (plus bas) affiche l'appli.
    } catch (erreur) {
      montrerErreur(traduireErreur(erreur));
      bouton.disabled = false;
      bouton.textContent = 'Se connecter';
    }
  });
}

// ---------- Appli (apres connexion) ----------

const ONGLETS = [
  { id: 'plantes', libelle: 'Plantes', icone: 'feuille' },
  { id: 'aujourdhui', libelle: "Aujourd'hui", icone: 'goutte' },
  { id: 'reglages', libelle: 'Réglages', icone: 'reglages' },
];

function ongletCourant() {
  const id = location.hash.replace(/^#\//, '');
  return ONGLETS.some((o) => o.id === id) ? id : 'plantes';
}

function carteVide(nomIcone, titre, texte) {
  return `
    <section class="carte vide">
      <div class="vide__bulle">${icone(nomIcone)}</div>
      <h2 class="vide__titre">${titre}</h2>
      <p class="vide__texte">${texte}</p>
    </section>`;
}

const VUES = {
  plantes: () => `
    <p class="vue__legende">Ma collection</p>
    <h1 class="vue__titre">Mes plantes</h1>
    ${carteVide('feuille', 'Bientôt ici', 'Toutes tes plantes, en grandes photos.')}`,

  aujourdhui: () => `
    <p class="vue__legende">${echapper(dateDuJour())}</p>
    <h1 class="vue__titre">À faire aujourd'hui</h1>
    ${carteVide('goutte', 'Rien à signaler', "Les arrosages du jour s'afficheront ici.")}`,

  reglages: () => `
    <p class="vue__legende">Mon compte</p>
    <h1 class="vue__titre">Réglages</h1>
    <section class="carte">
      <h2 class="carte__titre">Compte</h2>
      <div class="ligne">
        <span class="ligne__label">E-mail</span>
        <span class="ligne__valeur" data-email>${echapper(session?.user?.email || '')}</span>
      </div>
      <button class="btn btn--douce" id="logout" type="button">Se déconnecter</button>
    </section>
    <section class="carte">
      <h2 class="carte__titre">À propos</h2>
      <div class="ligne">
        <span class="ligne__label">Version</span>
        <span class="ligne__valeur" data-version>${echapper(VERSION)}</span>
      </div>
    </section>`,
};

function afficherAppli() {
  if (!document.getElementById('tabbar')) {
    racine.innerHTML = `
      <main class="vue" id="vue"></main>
      <nav class="tabbar" id="tabbar" aria-label="Navigation principale">
        ${ONGLETS.map((o) => `
          <a class="tabbar__onglet" href="#/${o.id}" data-tab="${o.id}">
            <span class="tabbar__pastille">${icone(o.icone)}</span>
            <span>${o.libelle}</span>
          </a>`).join('')}
      </nav>`;
  }
  afficherVue();
}

function afficherVue() {
  const id = ongletCourant();
  document.getElementById('vue').innerHTML = VUES[id]();
  document.querySelectorAll('.tabbar__onglet').forEach((lien) => {
    if (lien.dataset.tab === id) lien.setAttribute('aria-current', 'page');
    else lien.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);

  const deconnexion = document.getElementById('logout');
  if (deconnexion) {
    deconnexion.addEventListener('click', async () => {
      deconnexion.disabled = true;
      await supabase.auth.signOut();
      session = null;
      afficherEcran();
    });
  }
}

function afficherEcran() {
  if (session) afficherAppli();
  else afficherConnexion();
}

// ---------- Service worker (mode hors ligne de base) ----------

function enregistrerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const avaitUnControleur = !!navigator.serviceWorker.controller;
  let rechargement = false;
  // Quand une nouvelle version prend la main, on recharge une fois pour l'afficher.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (avaitUnControleur && !rechargement) {
      rechargement = true;
      location.reload();
    }
  });
  navigator.serviceWorker.register('sw.js')
    .then((enregistrement) => enregistrement.update())
    .catch(() => { /* pas bloquant : l'appli marche sans le mode hors ligne */ });
}

// ---------- Demarrage ----------

async function demarrer() {
  enregistrerServiceWorker();
  window.addEventListener('hashchange', () => { if (session) afficherVue(); });

  try {
    const { data } = await supabase.auth.getSession();
    session = data?.session ?? null;
  } catch {
    session = null;
  }

  // Ne fait rien d'asynchrone ici : on met juste a jour l'etat et l'affichage.
  supabase.auth.onAuthStateChange((_evenement, nouvelleSession) => {
    const change = (nouvelleSession?.user?.id ?? null) !== (session?.user?.id ?? null)
      || !!nouvelleSession !== !!session;
    session = nouvelleSession;
    if (change) afficherEcran();
  });

  afficherEcran();
}

demarrer();
