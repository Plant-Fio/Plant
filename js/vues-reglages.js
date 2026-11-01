// Ecrans des reglages : compte et version, puis gestion des pieces.
import {
  lireEtat, nombrePlantesDans, creerPiece, renommerPiece, supprimerPiece, expliquerErreur,
} from './donnees.js';
import { echapper, icone } from './outils.js';
import { confirmer, demanderTexte, message } from './dialogues.js';

export function vueReglages(conteneur, { email, version, deconnecter }) {
  const { pieces } = lireEtat();
  conteneur.innerHTML = `
    <p class="vue__legende">Mon compte</p>
    <h1 class="vue__titre">Réglages</h1>
    <section class="carte">
      <h2 class="carte__titre">Mon jardin</h2>
      <a class="ligne ligne--lien" href="#/reglages/pieces">
        <span>Mes pièces</span>
        <span class="ligne__valeur">${pieces.length} ${icone('chevron')}</span>
      </a>
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
    </section>`;

  const bouton = conteneur.querySelector('#logout');
  bouton.addEventListener('click', () => { bouton.disabled = true; deconnecter(); });
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
