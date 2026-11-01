# Mes plantes

Petite appli web (PWA) pour suivre ses plantes d'interieur : fiches, photos, rappels d'arrosage.
Pensee pour l'iPhone (Safari > Partager > Sur l'ecran d'accueil). Hebergee gratuitement sur GitHub Pages,
donnees dans Supabase.

## Comment c'est range

| Dossier / fichier | Role |
|---|---|
| `index.html`, `css/`, `js/` | L'appli (aucun outil de build : du HTML/CSS/JS simple) |
| `js/version.js` | Le numero de version, a changer a chaque publication |
| `js/config.js` | URL du projet Supabase et cle publique "anon" |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installation sur l'ecran d'accueil + mode hors ligne |
| `supabase/` | Scripts SQL a coller dans le SQL Editor de Supabase (un par etape, numerotes) |
| `scripts/` | Fabrication du site par la CI (embarque la bibliotheque Supabase) et publication des captures |
| `tests/` | Controles automatiques et captures d'ecran (Chromium au format iPhone) |
| `.github/workflows/` | CI (sur les PR), deploiement Pages, verification en ligne |

## Captures d'ecran

La CI prend des captures au format iPhone et les publie sur la branche **`captures`** :
`ci/` pour la derniere PR, `en-ligne/` pour le dernier deploiement (visibles directement sur GitHub).

## Securite

- Seule la cle publique **anon** est dans le depot. Elle est faite pour ca : la protection des donnees
  repose sur la **RLS** (regles d'acces) activee sur chaque table et sur le bucket photos.
- Les photos sont dans un bucket **prive** : chaque fichier est dans un dossier au nom de l'utilisatrice
  (`<id>/<plante>/<photo>.jpg`) et seules les regles d'acces (RLS) du stockage y donnent acces.
  L'appli les affiche avec des adresses temporaires (valables une heure).
- La cle secrete (`service role`) ne doit **jamais** etre dans le depot. La CI echoue si elle en detecte une.

## Methode de travail

1. Une branche par changement, une PR, la CI doit etre verte, puis fusion dans `main`.
2. La fusion declenche le deploiement sur GitHub Pages puis une verification du site en ligne.
3. A chaque publication : nouvelle version dans `js/version.js` + nouvelle entree dans `CHANGELOG.md`.

## Mise en place de Supabase (une seule fois)

- Authentication > Users > **Add user** (e-mail + mot de passe, cocher "Auto Confirm User").
- Authentication > Sign In / Providers > desactiver **Allow new users to sign up**
  (une seule utilisatrice : personne d'autre ne doit pouvoir creer de compte).
