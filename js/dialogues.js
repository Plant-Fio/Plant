// Fenetres de dialogue (confirmation, saisie d'un texte) et petits messages.
import { echapper } from './outils.js';

// Ouvre une <dialog> modale et renvoie { valeur: 'ok' | 'annuler', texte } quand elle se ferme.
function ouvrirDialogue(contenu) {
  return new Promise((resolve) => {
    const dialogue = document.createElement('dialog');
    dialogue.className = 'dialogue';
    dialogue.innerHTML = contenu;
    document.body.appendChild(dialogue);
    dialogue.addEventListener('close', () => {
      const texte = dialogue.querySelector('input')?.value ?? '';
      const valeur = dialogue.returnValue;
      dialogue.remove();
      resolve({ valeur, texte });
    });
    // Toucher en dehors de la fenetre = annuler
    dialogue.addEventListener('click', (e) => { if (e.target === dialogue) dialogue.close('annuler'); });
    dialogue.showModal();
  });
}

const dialogueDisponible = () => typeof HTMLDialogElement !== 'undefined'
  && typeof HTMLDialogElement.prototype.showModal === 'function';

export async function confirmer({ titre, texte = '', action = 'Confirmer', danger = false }) {
  if (!dialogueDisponible()) return window.confirm(`${titre}\n${texte}`);
  // Le bouton d'action est le premier du formulaire : c'est lui que la touche Entree declenche.
  const { valeur } = await ouvrirDialogue(`
    <form method="dialog">
      <h2 class="dialogue__titre">${echapper(titre)}</h2>
      ${texte ? `<p class="dialogue__texte">${echapper(texte)}</p>` : ''}
      <button class="btn ${danger ? 'btn--danger' : 'btn--primaire'}" value="ok">${echapper(action)}</button>
      <button class="btn btn--douce" value="annuler" formnovalidate>Annuler</button>
    </form>`);
  return valeur === 'ok';
}

// Renvoie le texte saisi, ou null si annule.
export async function demanderTexte({ titre, valeur = '', action = 'Enregistrer', placeholder = '' }) {
  if (!dialogueDisponible()) return window.prompt(titre, valeur);
  const resultat = await ouvrirDialogue(`
    <form method="dialog">
      <h2 class="dialogue__titre">${echapper(titre)}</h2>
      <input class="champ__input dialogue__champ" type="text" maxlength="60" required
             value="${echapper(valeur)}" placeholder="${echapper(placeholder)}" aria-label="${echapper(titre)}">
      <button class="btn btn--primaire" value="ok">${echapper(action)}</button>
      <button class="btn btn--douce" value="annuler" formnovalidate>Annuler</button>
    </form>`);
  if (resultat.valeur !== 'ok') return null;
  return resultat.texte.trim() || null;
}

// Renvoie une date "AAAA-MM-JJ", ou null si annule.
export async function demanderDate({ titre, valeur = '', action = 'Enregistrer', max = '' }) {
  if (!dialogueDisponible()) return window.prompt(`${titre} (AAAA-MM-JJ)`, valeur);
  const resultat = await ouvrirDialogue(`
    <form method="dialog">
      <h2 class="dialogue__titre">${echapper(titre)}</h2>
      <input class="champ__input dialogue__champ" type="date" required${max ? ` max="${echapper(max)}"` : ''} value="${echapper(valeur)}" aria-label="${echapper(titre)}">
      <button class="btn btn--primaire" value="ok">${echapper(action)}</button>
      <button class="btn btn--douce" value="annuler" formnovalidate>Annuler</button>
    </form>`);
  if (resultat.valeur !== 'ok') return null;
  return resultat.texte || null;
}

// Petit message qui apparait en haut de l'ecran puis disparait.
let minuterie = null;
export function message(texte, type = 'info') {
  let zone = document.getElementById('message');
  if (!zone) {
    zone = document.createElement('div');
    zone.id = 'message';
    zone.setAttribute('role', 'status');
    document.body.appendChild(zone);
  }
  zone.className = `message message--${type}`;
  zone.textContent = texte;
  zone.hidden = false;
  clearTimeout(minuterie);
  minuterie = setTimeout(() => { zone.hidden = true; }, 3800);
}
