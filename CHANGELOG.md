# Changelog

Toutes les evolutions notables de l'appli. Le numero de version visible dans l'appli
(Reglages) vient de `js/version.js` et doit toujours correspondre a la derniere entree ci-dessous.

## [0.3.0] - 2026-11-01

Les photos.

### Ajoute
- Plusieurs photos par plante : appareil photo ou phototheque, plusieurs a la fois
- Compression sur l'iPhone avant l'envoi : une grande (1600 px max) et une vignette (400 px max)
- Galerie sur la fiche : grande photo, bande de vignettes, choix de la couverture, suppression
- Photo de couverture en grand sur la liste des plantes (la premiere photo ajoutee par defaut)
- Stockage prive (bucket Supabase) : chaque fichier est dans le dossier de l'utilisatrice, protege par la RLS
- Supprimer une plante supprime aussi ses fichiers photo
- CI : faux stockage pour tester l'envoi et la compression, controle du bucket et de la table `photos`
  sur le vrai projet (script SQL dans `supabase/02-photos.sql`)

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
