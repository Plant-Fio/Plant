// Mes plantes - chef d'orchestre : connexion, navigation par onglets, choix de l'ecran a afficher.
import { supabase } from './client.js';
import { echapper, icone, dateIsoLocale } from './outils.js';
import { charger, viderEtat, lireEtat } from './donnees.js';
import { vueListe, vueFiche, vueFormulaire, vueEvolution } from './vues-plantes.js';
import { vueReglages, vuePieces } from './vues-reglages.js';
import { vueSouhaits, vueSouhait, vueFormulaireSouhait } from './vues-souhaits.js';
import { vueAujourdhui } from './vue-aujourdhui.js';
import { compterAFaire } from './rappels.js';
import { appliquerTheme, lireTheme } from './themes.js';

const VERSION = globalThis.APP_VERSION || '?';

const racine = document.getElementById('app');
let session = null;

// ---------- Connexion ----------

function traduireErreurConnexion(erreur) {
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
      montrerErreur(traduireErreurConnexion(erreur));
      bouton.disabled = false;
      bouton.textContent = 'Se connecter';
    }
  });
}

async function deconnecter() {
  try { await supabase.auth.signOut(); } catch { /* on deconnecte quand meme l'ecran */ }
  viderEtat();
  session = null;
  afficherEcran();
}

// ---------- Navigation ----------

const ONGLETS = [
  { id: 'plantes', libelle: 'Plantes', icone: 'feuille' },
  { id: 'aujourdhui', libelle: "Aujourd'hui", icone: 'goutte' },
  { id: 'souhaits', libelle: 'Souhaits', icone: 'coeur' },
  { id: 'reglages', libelle: 'Réglages', icone: 'reglages' },
];

// "#/plantes/abc/modifier" -> { onglet: 'plantes', reste: ['abc', 'modifier'] }
function lireAdresse() {
  const morceaux = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const onglet = ONGLETS.some((o) => o.id === morceaux[0]) ? morceaux[0] : 'plantes';
  return { onglet, reste: morceaux[0] === onglet ? morceaux.slice(1) : [] };
}

// Pastille sur l'onglet "Aujourd'hui" : nombre d'arrosages a faire
function majPastille() {
  const pastille = document.querySelector('.tabbar__badge');
  if (!pastille) return;
  const { plantes, arrosages, taches, problemes, charge } = lireEtat();
  // Pastille : arrosages a faire + taches libres pas encore cochees + traitements a refaire
  const jour = dateIsoLocale();
  const nombre = charge
    ? compterAFaire(plantes, arrosages) + taches.filter((t) => !t.fait_le && (!t.pour_le || t.pour_le <= jour)).length
      + problemes.filter((q) => !q.resolu_le && q.relance_le && q.relance_le <= jour).length : 0;
  pastille.textContent = nombre > 99 ? '99+' : String(nombre);
  pastille.hidden = nombre === 0;
  const lien = pastille.closest('.tabbar__onglet');
  lien.setAttribute('aria-label', nombre ? `Aujourd'hui, ${nombre} à faire` : "Aujourd'hui");
}

// Un numero par affichage : si l'utilisatrice change d'ecran pendant un chargement, l'ancien est ignore.
let numeroAffichage = 0;

async function afficherAppli() {
  const numero = ++numeroAffichage;
  if (!document.getElementById('tabbar')) {
    racine.innerHTML = `
      <main class="vue" id="vue"></main>
      <nav class="tabbar" id="tabbar" aria-label="Navigation principale">
        ${ONGLETS.map((o) => `
          <a class="tabbar__onglet" href="#/${o.id}" data-tab="${o.id}">
            <span class="tabbar__pastille">${icone(o.icone)}${o.id === 'aujourdhui' ? '<span class="tabbar__badge" hidden></span>' : ''}</span>
            <span>${o.libelle}</span>
          </a>`).join('')}
      </nav>`;
  }
  const conteneur = document.getElementById('vue');

  if (!lireEtat().charge) {
    conteneur.innerHTML = '<div class="chargement" role="status" aria-label="Chargement"></div>';
    try {
      await charger(session);
    } catch {
      if (numero !== numeroAffichage) return;
      conteneur.innerHTML = `
        <section class="carte vide">
          <h2 class="vide__titre">Chargement impossible</h2>
          <p class="vide__texte">Vérifie ta connexion internet puis réessaie.</p>
          <button class="btn btn--primaire" id="reessayer" type="button">Réessayer</button>
        </section>`;
      document.getElementById('reessayer').addEventListener('click', afficherAppli);
      return;
    }
    if (numero !== numeroAffichage) return;
  }
  afficherVue();
}

let jourAffiche = dateIsoLocale();

function afficherVue() {
  if (!session || !lireEtat().charge) return;
  const { onglet, reste } = lireAdresse();
  const conteneur = document.getElementById('vue');

  document.querySelectorAll('.tabbar__onglet').forEach((lien) => {
    if (lien.dataset.tab === onglet) lien.setAttribute('aria-current', 'page');
    else lien.removeAttribute('aria-current');
  });

  if (onglet === 'plantes') {
    const [premier, second] = reste;
    if (!premier) vueListe(conteneur);
    else if (premier === 'nouvelle') vueFormulaire(conteneur, null);
    else if (second === 'modifier') vueFormulaire(conteneur, premier);
    else if (second === 'evolution') vueEvolution(conteneur, premier);
    else vueFiche(conteneur, premier);
  } else if (onglet === 'aujourdhui') {
    vueAujourdhui(conteneur);
  } else if (onglet === 'souhaits') {
    const [premier, second] = reste;
    if (!premier) vueSouhaits(conteneur);
    else if (premier === 'nouveau') vueFormulaireSouhait(conteneur, null);
    else if (second === 'modifier') vueFormulaireSouhait(conteneur, premier);
    else vueSouhait(conteneur, premier);
  } else if (reste[0] === 'pieces') {
    vuePieces(conteneur);
  } else {
    vueReglages(conteneur, { email: session.user?.email || '', version: VERSION, deconnecter, chercherMiseAJour });
  }
  majPastille();
  jourAffiche = dateIsoLocale();
  window.scrollTo(0, 0);
}

function afficherEcran() {
  if (session) afficherAppli();
  else afficherConnexion();
}

// ---------- Service worker (mode hors ligne de base) ----------

let enregistrementSW = null;

// Cherche une nouvelle version maintenant. Si elle existe, le service worker s'installe et l'appli
// se recharge toute seule (voir controllerchange plus bas).
async function chercherMiseAJour() {
  try {
    const enregistrement = enregistrementSW || await navigator.serviceWorker?.getRegistration();
    if (!enregistrement) return 'indisponible';
    await enregistrement.update();
    return enregistrement.installing || enregistrement.waiting ? 'nouvelle' : 'a-jour';
  } catch {
    return 'erreur';
  }
}

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
  // updateViaCache: 'none' : le navigateur ne reutilise jamais une ancienne copie de sw.js ni de version.js
  // (sinon GitHub Pages peut les garder en cache ~10 min et l'appli resterait sur l'ancienne version)
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then((enregistrement) => { enregistrementSW = enregistrement; return enregistrement.update(); })
    .catch(() => { /* pas bloquant : l'appli marche sans le mode hors ligne */ });
}

// ---------- Demarrage ----------

async function demarrer() {
  appliquerTheme(lireTheme());
  enregistrerServiceWorker();
  window.addEventListener('hashchange', afficherVue);
  window.addEventListener('donnees-modifiees', majPastille);
  // Quand on rouvre l'appli le lendemain, les rappels du nouveau jour s'affichent
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    enregistrementSW?.update().catch(() => {}); // appli rouverte : on cherche une nouvelle version
    if (jourAffiche !== dateIsoLocale()) afficherVue();
  });

  try {
    const { data } = await supabase.auth.getSession();
    session = data?.session ?? null;
  } catch {
    session = null;
  }

  // Ne fait rien d'asynchrone ici : on met juste a jour l'etat et l'affichage.
  supabase.auth.onAuthStateChange((_evenement, nouvelleSession) => {
    const change = (nouvelleSession?.user?.id ?? null) !== (session?.user?.id ?? null);
    session = nouvelleSession;
    if (change) {
      if (!nouvelleSession) viderEtat();
      afficherEcran();
    }
  });

  afficherEcran();
}

demarrer();
