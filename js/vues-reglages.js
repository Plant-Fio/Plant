// Ecrans des reglages : compte et version, puis gestion des pieces.
import {
  lireEtat, charger, nombrePlantesDans, creerPiece, renommerPiece, supprimerPiece, expliquerErreur,
} from './donnees.js';
import { echapper, icone } from './outils.js';
import {
  preparerExportDonnees, preparerExportComplet, remettreFichier, ouvrirSauvegarde, resumeSauvegarde, importerSauvegarde,
} from './sauvegarde.js';
import { confirmer, demanderTexte, message } from './dialogues.js';
import { THEMES, lireTheme, choisirTheme } from './themes.js';
import {
  disponibilite, permission, estAbonne, activerNotifications, desactiverNotifications, envoyerTest,
  lireReglagesNotifs, enregistrerReglagesNotifs, REGLAGES_PAR_DEFAUT,
} from './notifications.js';

const optionsHeures = () => Array.from({ length: 24 }, (_, h) => `<option value="${h}">${h} h</option>`).join('');

// Carte « Notifications » : etat de l'appareil, reglages des heures, test
function initialiserNotifications(conteneur) {
  const userId = lireEtat().userId;
  const el = (id) => conteneur.querySelector(`#${id}`);
  const champs = {
    matin_actif: el('matin-actif'), heure_matin: el('heure-matin'), soir_actif: el('soir-actif'), heure_soir: el('heure-soir'),
  };
  const montrerReglages = (r) => {
    champs.matin_actif.checked = r.matin_actif;
    champs.heure_matin.value = String(r.heure_matin);
    champs.soir_actif.checked = r.soir_actif;
    champs.heure_soir.value = String(r.heure_soir);
  };
  montrerReglages(REGLAGES_PAR_DEFAUT);

  async function majEtat() {
    const dispo = disponibilite();
    const abonne = dispo === 'ok' && await estAbonne();
    const texte = {
      'a-installer': "Sur iPhone, ajoute d'abord l'appli à l'écran d'accueil (bouton Partager, puis « Sur l'écran d'accueil »), puis ouvre-la depuis son icône.",
      indisponible: "Les notifications ne sont pas disponibles sur cet appareil.",
    }[dispo] || (permission() === 'denied'
      ? 'Les notifications sont bloquées : autorise-les dans les réglages de l\'iPhone (Notifications, puis Plantes).'
      : abonne ? 'Activées sur cet appareil.' : 'Reçois chaque matin et chaque soir ce qu\'il y a à faire.');
    el('notifs-etat').textContent = texte;
    el('notifs-activer').hidden = !(dispo === 'ok' && !abonne && permission() !== 'denied');
    el('notifs-test').hidden = !abonne;
    el('notifs-stop').hidden = !abonne;
  }

  lireReglagesNotifs().then(montrerReglages).catch(() => { /* reglages par defaut */ });
  majEtat();

  conteneur.querySelector('#notifs').addEventListener('change', async (evenement) => {
    if (!evenement.target.closest('.notif-ligne')) return;
    try {
      await enregistrerReglagesNotifs(userId, {
        matin_actif: champs.matin_actif.checked, heure_matin: Number(champs.heure_matin.value),
        soir_actif: champs.soir_actif.checked, heure_soir: Number(champs.heure_soir.value),
      });
      message('Réglages enregistrés');
    } catch (erreur) {
      message(expliquerErreur(erreur), 'erreur');
    }
  });

  el('notifs-activer').addEventListener('click', async (evenement) => {
    const bouton = evenement.currentTarget;
    bouton.disabled = true;
    try {
      const reponse = await activerNotifications(userId);
      if (reponse === 'granted') {
        await enregistrerReglagesNotifs(userId, {
          matin_actif: champs.matin_actif.checked, heure_matin: Number(champs.heure_matin.value),
          soir_actif: champs.soir_actif.checked, heure_soir: Number(champs.heure_soir.value),
        });
        message('Notifications activées');
      }
    } catch (erreur) {
      message(expliquerErreur(erreur), 'erreur');
    }
    bouton.disabled = false;
    majEtat();
  });

  el('notifs-test').addEventListener('click', async (evenement) => {
    const bouton = evenement.currentTarget;
    bouton.disabled = true;
    try {
      await envoyerTest();
      message('Notification envoyée, elle arrive dans un instant');
    } catch (erreur) {
      message("L'envoi du test a échoué. La fonction de rappels est-elle bien installée ?", 'erreur');
    }
    bouton.disabled = false;
  });

  el('notifs-stop').addEventListener('click', async () => {
    await desactiverNotifications().catch(() => {});
    message('Notifications désactivées sur cet appareil');
    majEtat();
  });
}

// Carte « Sauvegarde » : exporter (donnees, ou donnees + photos) et importer
function initialiserSauvegarde(conteneur) {
  const el = (id) => conteneur.querySelector(`#${id}`);
  const jauge = el('sauv-jauge');
  const etatTexte = el('sauv-etat');
  const pret = el('sauv-pret');
  const boutons = ['sauv-donnees', 'sauv-photos', 'sauv-importer'].map(el);
  let fichierPret = null;
  const progres = (part, texte) => {
    jauge.hidden = false;
    jauge.value = Math.round(part * 100);
    if (texte) etatTexte.textContent = texte;
  };
  const occupe = (oui) => boutons.forEach((b) => { b.disabled = oui; });
  const montrerPret = (fichier, texte) => {
    fichierPret = fichier;
    jauge.hidden = true;
    etatTexte.textContent = texte;
    pret.hidden = false;
    pret.textContent = `Enregistrer « ${fichier.nom} »`;
  };
  async function exporter(preparer) {
    occupe(true);
    pret.hidden = true;
    try {
      const fichier = await preparer(progres);
      const manquantes = fichier.manquantes ? ` (${fichier.manquantes} fichier${fichier.manquantes > 1 ? 's' : ''} introuvable${fichier.manquantes > 1 ? 's' : ''})` : '';
      montrerPret(fichier, `Sauvegarde prête${manquantes}. Touche le bouton ci-dessous pour l'enregistrer.`);
    } catch (erreur) {
      jauge.hidden = true;
      etatTexte.textContent = '';
      message(expliquerErreur(erreur), 'erreur');
    }
    occupe(false);
  }
  el('sauv-donnees').addEventListener('click', () => exporter(preparerExportDonnees));
  el('sauv-photos').addEventListener('click', () => exporter(preparerExportComplet));
  pret.addEventListener('click', () => { if (fichierPret) remettreFichier(fichierPret); });

  el('sauv-fichier').addEventListener('change', async (evenement) => {
    const fichier = evenement.target.files[0];
    evenement.target.value = '';
    if (!fichier) return;
    occupe(true);
    try {
      const sauvegarde = await ouvrirSauvegarde(fichier);
      const r = resumeSauvegarde(sauvegarde);
      const ok = await confirmer({
        titre: 'Importer cette sauvegarde ?',
        texte: `${r.plantes} plante${r.plantes > 1 ? 's' : ''}, ${r.photos} photo${r.photos > 1 ? 's' : ''}${r.date ? `, faite le ${r.date}` : ''}`
          + `${sauvegarde.photos ? '' : ' (sans les fichiers photos)'}. Ce qui existe déjà est mis à jour, rien n'est supprimé.`,
        action: 'Importer',
      });
      if (ok) {
        progres(0, 'Import en cours… ne ferme pas l\'appli');
        const { echecs } = await importerSauvegarde(sauvegarde, progres);
        message(echecs ? `Import terminé (${echecs} photo${echecs > 1 ? 's' : ''} non restaurée${echecs > 1 ? 's' : ''})` : 'Import terminé ✓');
        // On relit tout depuis la base puis on redessine l'ecran
        await charger({ user: { id: lireEtat().userId, user_metadata: { pieces_initialisees: true } } });
        window.dispatchEvent(new HashChangeEvent('hashchange'));
        return;
      }
    } catch (erreur) {
      message(erreur?.message || expliquerErreur(erreur), 'erreur');
    }
    jauge.hidden = true;
    etatTexte.textContent = '';
    occupe(false);
  });
  el('sauv-importer').addEventListener('click', () => el('sauv-fichier').click());
}

export function vueReglages(conteneur, { email, version, deconnecter, chercherMiseAJour }) {
  const { pieces, photos } = lireEtat();
  // Estimation : une photo + sa vignette pesent environ 250 Ko apres compression ; l'offre gratuite de Supabase offre 1 Go
  const tailleMo = Math.round(photos.length * 0.25);
  const pourcent = Math.min(100, Math.round((tailleMo / 1024) * 100));
  const themeActuel = lireTheme();
  conteneur.innerHTML = `
    <p class="vue__legende">Mon compte</p>
    <h1 class="vue__titre">Réglages</h1>
    <section class="carte">
      <h2 class="carte__titre">Mon jardin</h2>
      <a class="ligne ligne--lien" href="#/reglages/pieces">
        <span>Mes pièces</span>
        <span class="ligne__valeur">${pieces.length} ${icone('chevron')}</span>
      </a>
      <a class="ligne ligne--lien" href="#/reglages/bilan">
        <span>Bilan du mois</span>
        <span class="ligne__valeur">${icone('chevron')}</span>
      </a>
    </section>
    <section class="carte">
      <h2 class="carte__titre">Apparence</h2>
      <div class="themes" role="group" aria-label="Choisir le thème">
        ${THEMES.map((t) => `
          <button class="theme" type="button" data-theme-id="${t.id}" aria-pressed="${t.id === themeActuel}">
            <span class="theme__apercu" style="background:${t.fond};--coins:${t.coins}">
              <span class="theme__titre" style="background:${t.texte}"></span>
              <span class="theme__carte" style="background:${t.carte};border-radius:${t.coins}"></span>
              <span class="theme__point" style="background:${t.accent}"></span>
            </span>
            <span class="theme__nom">${echapper(t.nom)}</span>
          </button>`).join('')}
      </div>
    </section>
    <section class="carte" id="notifs">
      <h2 class="carte__titre">Notifications</h2>
      <p class="notifs__etat" id="notifs-etat" role="status"></p>
      <button class="btn btn--primaire" id="notifs-activer" type="button" hidden>Activer les notifications</button>
      <div class="notif-ligne">
        <label class="notif-ligne__titre"><input type="checkbox" id="matin-actif"> Rappel du matin</label>
        <select class="champ__input champ__select notif-ligne__heure" id="heure-matin" aria-label="Heure du rappel du matin">${optionsHeures()}</select>
      </div>
      <div class="notif-ligne">
        <label class="notif-ligne__titre"><input type="checkbox" id="soir-actif"> Rappel du soir (pour demain)</label>
        <select class="champ__input champ__select notif-ligne__heure" id="heure-soir" aria-label="Heure du rappel du soir">${optionsHeures()}</select>
      </div>
      <button class="btn btn--douce" id="notifs-test" type="button" hidden>Envoyer une notification test</button>
      <button class="btn-texte" id="notifs-stop" type="button" hidden>Désactiver sur cet appareil</button>
    </section>
    <section class="carte" id="stockage">
      <h2 class="carte__titre">Stockage des photos</h2>
      <div class="ligne">
        <span class="ligne__label">Photos</span>
        <span class="ligne__valeur" data-photos>${photos.length}</span>
      </div>
      <div class="ligne">
        <span class="ligne__label">Place utilisée</span>
        <span class="ligne__valeur" data-stockage>≈ ${tailleMo} Mo sur 1 Go</span>
      </div>
      <progress class="stockage__jauge" max="100" value="${pourcent}" aria-label="Place utilisée : ${pourcent} %"></progress>
      <p class="stockage__aide">Estimation (environ 250 Ko par photo). L'offre gratuite de Supabase offre 1 Go.</p>
    </section>
    <section class="carte" id="sauvegarde">
      <h2 class="carte__titre">Sauvegarde</h2>
      <p class="stockage__aide sauv__aide">Garde une copie de tes plantes sur ton téléphone ou dans Fichiers. Avec les photos, le fichier est plus lourd.</p>
      <button class="btn btn--douce" id="sauv-donnees" type="button">Exporter les données</button>
      <button class="btn btn--douce" id="sauv-photos" type="button">Exporter avec les photos (.zip)</button>
      <button class="btn btn--douce" id="sauv-importer" type="button">Importer une sauvegarde</button>
      <input id="sauv-fichier" type="file" accept=".json,.zip,application/json,application/zip" hidden>
      <progress class="stockage__jauge" id="sauv-jauge" max="100" value="0" hidden aria-label="Avancement"></progress>
      <p class="notifs__etat" id="sauv-etat" role="status"></p>
      <button class="btn btn--primaire" id="sauv-pret" type="button" hidden></button>
      <p class="stockage__aide">Ce n'est pas une sauvegarde automatique : pense à la refaire de temps en temps. Les sauvegardes automatiques de Supabase demandent l'offre payante.</p>
    </section>
    <section class="carte">
      <h2 class="carte__titre">Compte</h2>
      <div class="ligne">
        <span class="ligne__label">E-mail</span>
        <span class="ligne__valeur" data-email>${echapper(email)}</span>
      </div>
      <button class="btn btn--douce" id="logout" type="button">Se déconnecter</button>
    </section>
    <section class="carte">
      <h2 class="carte__titre">À propos</h2>
      <div class="ligne">
        <span class="ligne__label">Version</span>
        <span class="ligne__valeur" data-version>${echapper(version)}</span>
      </div>
      <button class="btn btn--douce" id="maj" type="button">Vérifier les mises à jour</button>
    </section>`;

  initialiserNotifications(conteneur);
  initialiserSauvegarde(conteneur);

  // Choix du theme : il s'applique tout de suite
  conteneur.querySelectorAll('.theme').forEach((vignette) => {
    vignette.addEventListener('click', () => {
      choisirTheme(vignette.dataset.themeId);
      conteneur.querySelectorAll('.theme').forEach((v) => {
        v.setAttribute('aria-pressed', String(v === vignette));
      });
    });
  });

  const bouton = conteneur.querySelector('#logout');
  bouton.addEventListener('click', () => { bouton.disabled = true; deconnecter(); });

  const boutonMaj = conteneur.querySelector('#maj');
  boutonMaj.addEventListener('click', async () => {
    boutonMaj.disabled = true;
    boutonMaj.textContent = 'Vérification…';
    const resultat = await chercherMiseAJour();
    boutonMaj.disabled = false;
    boutonMaj.textContent = 'Vérifier les mises à jour';
    if (resultat === 'nouvelle') message('Nouvelle version trouvée, redémarrage…');
    else if (resultat === 'a-jour') message(`Tu as la dernière version (${version})`);
    else message('Vérification impossible pour le moment', 'erreur');
  });
}

export function vuePieces(conteneur) {
  const { pieces } = lireEtat();

  conteneur.innerHTML = `
    <a class="retour" href="#/reglages">${icone('retour')} Réglages</a>
    <h1 class="vue__titre">Mes pièces</h1>
    <section class="carte">
      <ul class="pieces">
        ${pieces.map((p) => {
          const nombre = nombrePlantesDans(p.id);
          return `
          <li class="piece" data-id="${p.id}">
            <span class="piece__texte">
              <span class="piece__nom">${echapper(p.nom)}</span>
              <span class="piece__nombre">${nombre} plante${nombre > 1 ? 's' : ''}</span>
            </span>
            <button class="btn-icone" type="button" data-action="renommer" aria-label="Renommer ${echapper(p.nom)}">${icone('crayon')}</button>
            <button class="btn-icone" type="button" data-action="supprimer" aria-label="Supprimer ${echapper(p.nom)}">${icone('corbeille')}</button>
          </li>`;
        }).join('')}
      </ul>
      ${pieces.length ? '' : '<p class="aucun-resultat">Aucune pièce pour le moment.</p>'}
    </section>
    <section class="carte">
      <h2 class="carte__titre">Ajouter une pièce</h2>
      <form id="form-piece" novalidate>
        <input class="champ__input" name="nom" type="text" maxlength="60" autocomplete="off"
               placeholder="Ex. Véranda" aria-label="Nom de la nouvelle pièce">
        <button class="btn btn--primaire" type="submit">Ajouter</button>
      </form>
    </section>`;

  const actualiser = () => vuePieces(conteneur);

  conteneur.querySelector('#form-piece').addEventListener('submit', async (evenement) => {
    evenement.preventDefault();
    const champ = evenement.target.elements.nom;
    const nom = champ.value.trim();
    if (!nom) { champ.focus(); return; }
    try {
      await creerPiece(nom);
      message('Pièce ajoutée');
      actualiser();
    } catch (erreur) {
      message(expliquerErreur(erreur), 'erreur');
    }
  });

  conteneur.querySelector('.pieces').addEventListener('click', async (evenement) => {
    const bouton = evenement.target.closest('[data-action]');
    if (!bouton) return;
    const id = bouton.closest('.piece').dataset.id;
    const piece = pieces.find((p) => p.id === id);
    if (!piece) return;

    if (bouton.dataset.action === 'renommer') {
      const nom = await demanderTexte({ titre: 'Renommer la pièce', valeur: piece.nom });
      if (!nom || nom === piece.nom) return;
      try {
        await renommerPiece(id, nom);
        message('Pièce renommée');
        actualiser();
      } catch (erreur) {
        message(expliquerErreur(erreur), 'erreur');
      }
    } else {
      const accord = await confirmer({
        titre: 'Supprimer cette pièce ?',
        texte: `« ${piece.nom} » sera supprimée. Les plantes qui s'y trouvent ne sont pas supprimées : elles n'auront simplement plus de pièce.`,
        action: 'Supprimer',
        danger: true,
      });
      if (!accord) return;
      try {
        await supprimerPiece(id);
        message('Pièce supprimée');
        actualiser();
      } catch (erreur) {
        message(expliquerErreur(erreur), 'erreur');
      }
    }
  });
}
