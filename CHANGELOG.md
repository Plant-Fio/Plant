# Changelog

Toutes les evolutions notables de l'appli. Le numero de version visible dans l'appli
(Reglages) vient de `js/version.js` et doit toujours correspondre a la derniere entree ci-dessous.

## [1.2.1] - 2026-11-01
### Modifié
- Nouveau logo : une feuille d'alocasia sur fond vert pâle (la couleur de ses nervures), pour l'icône de l'appli sur l'écran d'accueil et l'onglet du navigateur.

## [1.2.0] - 2026-11-01
### Ajouté
- Quarantaine automatique d'un mois à partir de la date d'acquisition : les plantes concernées sont mises à part en haut de la liste (section « En quarantaine », étiquette avec les jours restants, filtre « Quarantaine »), annoncées sur la fiche et dans le formulaire dès que la date est choisie.

## [1.1.1] - 2026-11-01
### Ajouté
- Thème Fleuriste : chaque pièce a sa teinte pastel (cartes des plantes, tâches du jour et filtres de pièces).
### Modifié
- Appareil photo : les repères (silhouettes, ligne) sont retirés. Il ne garde que la dernière photo en transparence, pour cadrer une nouvelle photo d'évolution comme la précédente. Le bouton « Photo d'évolution » n'apparaît que lorsque la plante a déjà une photo.

## [1.1.0] - 2026-11-01
### Ajouté
- Trois thèmes au choix dans Réglages > Apparence : Herbier (crème et serif, par défaut), Serre de nuit (fond sombre et laiton) et Fleuriste (pastels, coins très ronds, barre d'onglets flottante).
- Le thème choisi est gardé sur l'appareil et s'applique tout de suite.
- Polices embarquées dans l'appli, donc disponibles aussi hors ligne.

## [1.0.0] - 2026-11-01

Les photos qui se ressemblent.

### Ajoute
- Appareil photo dans l'appli (bouton « Appareil photo avec repères » sur la fiche) avec des reperes pour aligner
  les photos d'une meme plante :
  - la derniere photo de la plante en transparence (reglable),
  - ou une silhouette ombree : touffe, monstera, alocasia, anthurium, tombante, haute, rosette,
  - et une ligne horizontale qu'on deplace au doigt (par exemple sur le haut d'une feuille)
- Les reperes ne sont jamais sur la photo enregistree ; reglages retenus pour chaque plante
- Format fixe 3:4 (4:3 a l'horizontale) pour que les vignettes se ressemblent
- Le flash n'est pas disponible dans l'appareil photo de l'appli (limite d'iOS pour les sites web) :
  l'ajout de photo habituel avec l'appareil de l'iPhone reste disponible

## [0.9.0] - 2026-11-01

Le suivi des plantes dans le temps.

### Ajoute
- Chaque photo a une date : celle de la prise de vue quand l'iPhone la donne, sinon celle du jour ;
  elle s'affiche sous la photo et se modifie (« Modifier la date »)
- Les photos d'une plante sont classees de la plus ancienne a la plus recente
- Page « Évolution » (bouton « Voir l'évolution » des qu'il y a 2 photos) : toutes les photos en grand, avec leur date
  et l'ecart avec la precedente (« 3 semaines plus tard »)

### Corrige
- Champs date (calendrier de l'iPhone) : la valeur est centree dans la cellule au lieu d'etre collee en haut

## [0.8.1] - 2026-11-01

### Corrige
- Mises a jour plus fiables : le navigateur ne garde plus d'ancienne copie du service worker ni du numero de version
  (l'appli pouvait rester sur l'ancienne version une dizaine de minutes apres un deploiement)
- L'appli cherche une nouvelle version a chaque fois qu'on la rouvre

### Ajoute
- Reglages : bouton « Verifier les mises a jour »

## [0.8.0] - 2026-11-01

### Ajoute
- « Prochaine dose d'engrais » : une date a choisir (formulaire + fiche). A partir de ce jour, la plante apparait
  dans une section « Engrais » de l'ecran Aujourd'hui, avec un bouton « Fait » ; elle est annoncee dans « Bientot »
  les 3 jours avant, et comptee dans la pastille de l'onglet
- « Fait » (ou « Engrais fait aujourd'hui » sur la fiche) : le dernier engrais passe a aujourd'hui et la prochaine
  dose est effacee

## [0.7.0] - 2026-11-01

### Ajoute
- Etiquette « En vente » (case dans le formulaire) : pastille sur la vignette, mention sur la fiche, filtre « En vente »
- « Derniere feuille le » : date dans le formulaire + bouton « Nouvelle feuille aujourd'hui » dans les soins
- Nouvelle plante : la piece ou il y a le plus de plantes est proposee d'office
- Base de donnees : colonnes `en_vente`, `derniere_feuille`, `engrais_jours` et `date_photo` (script `supabase/05-evolutions.sql`)

### Corrige
- Pieces classees de A a Z (listes, formulaires, filtres)
- Champs date (acquisition, engrais, rempotage, feuille) : une corbeille permet d'effacer la valeur choisie

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
