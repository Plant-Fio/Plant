# Changelog

Toutes les evolutions notables de l'appli. Le numero de version visible dans l'appli
(Reglages) vient de `js/version.js` et doit toujours correspondre a la derniere entree ci-dessous.

## [0.6.0] - 2026-11-01

Le recadrage des photos.

### Ajoute
- Apres le choix d'une photo (plante ou souhait), un ecran de recadrage s'ouvre : on deplace le cadre, on tire
  les coins, et des formats rapides (Libre, Carre, 4:3, Vertical) sont proposes
- « Garder entiere » envoie la photo d'origine sans la toucher ; « Annuler » n'ajoute rien
- Plusieurs photos a la fois : un ecran de recadrage par photo (« Photo 2 sur 3 »)

## [0.5.2] - 2026-11-01

### Corrige
- Les grandes photos (fiche d'une plante, d'un souhait, apercu du formulaire) sont montrees en entier au lieu
  d'etre rognees au format 4/3 : plus besoin de recadrer une capture d'ecran avant de l'ajouter.
  Les vignettes des listes restent carrees (recadrees au centre).

## [0.5.1] - 2026-11-01

### Corrige
- Souhait : une fois la photo choisie, toucher la note ou l'espece rouvrait le choix de photo
  (le champ photo invisible recouvrait tout le formulaire)

## [0.5.0] - 2026-11-01

La liste de souhaits.

### Ajoute
- Nouvel onglet « Souhaits » : les plantes qu'on aimerait avoir (nom, espece, note : ou la trouver, prix, lien)
- Photo d'inspiration pour chaque souhait (appareil photo ou phototheque, compressee comme les autres photos)
- Bouton « Je l'ai ! » : le souhait devient une vraie plante (photo comprise) et quitte la liste
- Modification et suppression d'un souhait (avec confirmation, fichiers photo supprimes aussi)
- Base de donnees : table `souhaits` avec RLS (script dans `supabase/04-souhaits.sql`)
- CI : controle de la table `souhaits` sur le vrai projet

## [0.4.0] - 2026-11-01

Les rappels.

### Ajoute
- Frequence d'arrosage par plante (tous les N jours, 1 a 365), a regler dans le formulaire
- Ecran « Aujourd'hui » : plantes a arroser (les plus en retard d'abord) avec un gros bouton « Arrosee »,
  plantes deja arrosees (avec annulation) et apercu des 3 prochains jours
- Pastille sur l'onglet « Aujourd'hui » avec le nombre d'arrosages a faire
- Fiche : section « Soins » (frequence, prochain arrosage, dernier arrosage, historique des 8 derniers
  avec suppression), dernier engrais et dernier rempotage (date, bouton « fait aujourd'hui »)
- Les rappels se mettent a jour quand on rouvre l'appli le lendemain
- Base de donnees : table `arrosages` (RLS) et colonnes `arrosage_jours`, `dernier_engrais`,
  `dernier_rempotage` (script dans `supabase/03-rappels.sql`)
- CI : controle de la table `arrosages` et des nouvelles colonnes sur le vrai projet

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
