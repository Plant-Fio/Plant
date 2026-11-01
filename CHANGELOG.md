# Changelog

Toutes les evolutions notables de l'appli. Le numero de version visible dans l'appli
(Reglages) vient de `js/version.js` et doit toujours correspondre a la derniere entree ci-dessous.

## [0.2.0] - 2026-11-01

Les plantes et les pieces.

### Ajoute
- Liste des plantes en grandes vignettes (2 colonnes), recherche sans accents, filtre par piece
- Fiche d'une plante : nom, espece, piece, date d'acquisition (en francais), notes
- Ajout, modification et suppression d'une plante (avec confirmation)
- Pieces : liste de depart (Salon, Chambre, Cuisine...), puis ajout, renommage et suppression dans Reglages
- Consultation hors ligne : la derniere version des donnees est gardee sur l'appareil
- Base de donnees : tables `pieces` et `plantes` avec RLS (script dans `supabase/`)
- CI : parcours complet dans Chromium (faux Supabase), verification des tables et de la RLS
  sur le vrai projet, captures d'ecran publiees sur la branche `captures`

## [0.1.0] - 2026-11-01

Premiere version : le socle.

### Ajoute
- Appli installable sur l'ecran d'accueil de l'iPhone (PWA : manifest, icones, plein ecran)
- Mode hors ligne de base (service worker) : l'appli s'ouvre meme sans reseau
- Connexion par e-mail et mot de passe (Supabase), session conservee sur l'appareil
- Navigation par onglets en bas : Plantes, Aujourd'hui, Reglages (ecrans a remplir aux etapes suivantes)
- Theme vert Armerie (#3B5655) sur fond creme, zones sures de l'iPhone respectees
- Reglages : e-mail du compte, deconnexion, numero de version
- CI GitHub : controles statiques, tests dans Chromium au format iPhone avec captures d'ecran
- Deploiement automatique sur GitHub Pages, puis verification du site en ligne
