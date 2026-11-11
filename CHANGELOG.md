# Changelog

Toutes les evolutions notables de l'appli. Le numero de version visible dans l'appli
(Reglages) vient de `js/version.js` et doit toujours correspondre a la derniere entree ci-dessous.

## [1.27.0] - 2026-11-11
### Ajouté
- Réglages > Sauvegarde : « Exporter les données » (un fichier .json), « Exporter avec les photos » (un .zip avec les images et une barre de progression) et « Importer une sauvegarde » (remet tout dans le compte, met à jour ce qui existe, ne supprime rien).

## [1.26.0] - 2026-11-10
### Ajouté
- Nouveau statut « ⏳ Bientôt » (prochainement en vente), avec sa pastille et son filtre dans la liste. Nécessite supabase/20-bientot-en-vente.sql.
### Modifié
- Fiche plante : le bouton « Modifier » est maintenant en haut, à droite du lien retour.
- Babies : les étapes sont des choix indépendants (seule l'étape choisie est mise en avant, plus de « progression »).

## [1.25.0] - 2026-11-10
### Modifié
- Dates : retour au sélecteur de date du téléphone (les trois menus Jour / Mois / Année étaient moins pratiques).

## [1.23.0] - 2026-11-10
### Modifié
- Étapes d'un baby : « Prélevé » est retiré ; on ajoute « En germination », « En permiculite » et « En pon » (ordre : germination, eau, vermiculite, pon, terre, adopté). Un nouveau baby démarre « Dans l'eau ». Les babies qui étaient « Prélevé » passent à « Dans l'eau ». Nécessite supabase/19-etapes.sql.

## [1.22.0] - 2026-11-10
### Ajouté
- Photos : une petite description (200 caractères) peut être ajoutée à chaque photo, affichée sous la date et dans la frise d'évolution. Nécessite supabase/18-photo-description.sql.

## [1.21.0] - 2026-11-10
### Ajouté
- Journal : toucher la photo d'une note l'affiche en grand (toucher pour fermer).
- Journal : en modifiant une note, on peut maintenant ajouter une photo, la changer ou la retirer (elle reste alors dans la galerie).

## [1.20.0] - 2026-11-10
### Ajouté
- Animation d'ouverture : une pousse grandit et deux feuilles s'ouvrent (environ 1,5 seconde) avant l'écran d'accueil. Un toucher la fait passer ; elle est raccourcie si « réduire les animations » est activé sur l'iPhone.

## [1.19.0] - 2026-11-10
### Ajouté
- Quarantaine au choix : une case « Mettre en quarantaine (1 mois) » dans le formulaire d'une plante (cochée par défaut). Décochée, la plante n'est pas mise à part. Nécessite supabase/17-quarantaine.sql.

## [1.18.0] - 2026-11-10
### Ajouté
- Photos : on peut choisir l'ordre des photos dans la bande de la fiche avec les flèches ◀ ▶ (sous la photo choisie). Tant qu'on n'y touche pas, l'ordre reste celui des dates. La frise d'évolution reste toujours dans l'ordre du temps. Nécessite supabase/16-photos-position.sql.

## [1.17.0] - 2026-11-10
### Ajouté
- Journal : un bouton 📅 permet d'écrire une note pour un jour passé (hier, avant-hier…, jamais dans le futur). La date d'une note déjà écrite peut aussi être changée avec le crayon. Les notes restent classées par date.

## [1.16.0] - 2026-11-07
### Modifié
- Scanner : quand une étiquette est lue, une feuille d'actions s'ouvre au lieu d'aller sur la fiche. On y voit la plante et son état d'arrosage, avec de gros boutons « 💧 Arrosée », « 🌿 Engrais fait » et « 📝 Note », puis « Voir la fiche » ou « Scanner une autre » pour enchaîner les pots sans quitter la caméra.

## [1.15.1] - 2026-11-06
### Ajouté
- Étiquettes : choix du style du nom parmi 8 polices (script, petites capitales, sans-serif fin, manuscrite…), affichées avec le nom de la plante. Le choix est mémorisé et utilisé pour l'image exportée. Polices libres (Fontsource), disponibles hors ligne.

## [1.15.0] - 2026-11-06
### Ajouté
- Scanner intégré : un bouton QR à côté de la recherche, dans « Mes plantes », ouvre l'appareil photo dans l'appli. En visant l'étiquette d'un pot, la fiche de la plante s'ouvre directement (plus besoin de passer par Safari ni de se reconnecter). Nouvelle bibliothèque : jsQR.

## [1.14.1] - 2026-11-06
### Ajouté
- Étiquettes : choix « QR + nom » ou « QR seul » (QR centré sur l'étiquette), et bouton « Copier le nom » pour le coller dans l'app Niimbot.

## [1.14.0] - 2026-11-05
### Ajouté
- Étiquettes QR : bouton « 🏷️ Étiquette QR » sur la fiche d'une plante. Aperçu à la taille réelle (rouleaux transparent 14 × 30, blanc 14 × 40, vert 12 × 40 mm) avec le QR code et le nom, à enregistrer ou partager en image pour l'imprimer avec l'app Niimbot (calé sur la D11-H). Le QR contient l'identifiant de la plante (pas son nom) : renommer ou déplacer une plante ne casse pas l'étiquette. Scanné avec l'appareil photo de l'iPhone, il ouvre la fiche (adresse `#/q/…`). Nouvelle bibliothèque : qrcode-generator.

## [1.13.0] - 2026-11-04
### Modifié
- Aujourd'hui, « Mes tâches » : chaque tâche a une pastille emoji (devinée d'après le texte), le texte passe sur plusieurs lignes au lieu d'être coupé, et un bouton rond ✓ remplace « Fait ». La corbeille disparaît : on touche le texte pour faire apparaître « Supprimer la tâche ». Le champ d'ajout a une invitation « Nouvelle tâche… » et un bouton ＋ rond. Le compteur de « Mes tâches » est en chiffres droits.
- Liste des plantes : la pièce est toujours alignée en bas de la carte, avec ou sans espèce.

## [1.12.1] - 2026-11-03
### Modifié
- Bouton « Rattacher un baby » (texte raccourci pour tenir sur une ligne).

## [1.12.0] - 2026-11-03
### Ajouté
- Dans toute l'appli, « petit » devient « baby » (Ses babies, Nouveau baby, Baby de…).
- Formulaire d'une plante en 4 onglets avec emoji : 🪴 Infos, 💧 Soins (arrosage, engrais, rempotage), ✂️ Baby (plante mère, étape), 🏷️ Vente. Moins de défilement.
- Statut « Aucun / En vente / Vendu » directement sur la fiche (en un geste), et dans l'onglet Vente avec la date de vente. Les plantes vendues sont rangées dans « Vendues » et n'ont plus de rappels. Script SQL `15-vendu.sql`. La fonction `rappels` est mise à jour dans le dépôt (à redéployer).

## [1.11.1] - 2026-11-02
### Ajouté
- Petits : sur la fiche de la mère, « Rattacher une plante déjà créée » (liste avec photos et recherche) pour lier une plante qui existe déjà, au lieu d'en créer une nouvelle. « Ajouter un petit » devient « Nouveau petit ».

## [1.11.0] - 2026-11-02
### Ajouté
- Journal : un crayon sur chaque note permet de modifier son texte et son emoji sur place (Enregistrer / Annuler). Pas de nouveau script SQL.

## [1.10.2] - 2026-11-02
### Modifié
- Choix de la plante mère : au lieu d'une liste de noms, une liste avec la photo, le nom, l'espèce et la pièce de chaque plante, plus une recherche. On distingue enfin deux plantes au même nom.

## [1.10.1] - 2026-11-02
### Ajouté
- Type d'engrais : dans le formulaire d'une plante, un champ libre (Osmocote, engrais liquide…) avec suggestions des types déjà utilisés. Il s'affiche dans « Entretien » sur la fiche. Script SQL `14-type-engrais.sql`.

## [1.10.0] - 2026-11-02
### Ajouté
- Petits (boutures, bulbilles) : sur la fiche d'une plante, « Ses petits » (photo, âge, étape) et « Ajouter un petit » qui crée la plante déjà rattachée à sa mère. Sur la fiche du petit : bandeau « Petit de … » avec lien vers la mère et frise d'étapes (prélevé, dans l'eau, en terre, adopté, donné) qu'on touche pour avancer. Le formulaire permet aussi de rattacher une plante existante à une mère. Script SQL `13-petits.sql`.

## [1.9.3] - 2026-11-02
### Corrigé
- Zones de texte (note du journal, note d'un problème, notes d'une plante) : le texte n'est plus collé au bord du haut. Règle générale dans la feuille de style + contrôle automatique pour les futurs champs.

## [1.9.2] - 2026-11-02
### Corrigé
- Bilan du mois : une pression sur la flèche ne saute plus plusieurs mois (les écouteurs s'empilaient à chaque visite de l'écran). Le bilan repart toujours du mois en cours.

## [1.9.1] - 2026-11-02
### Modifié
- Suivi des problèmes : avec « Autre » on peut préciser le problème, et « Autre durée… » permet de choisir librement le nombre de jours avant le prochain traitement.

## [1.9.0] - 2026-11-02
### Ajouté
- Bilan du mois (Réglages > Bilan du mois) : arrosages, photos, notes, plantes ajoutées, problèmes signalés et résolus, avec les notes du mois ; navigation mois par mois.
- Journal en frise du temps : une icône (emoji) par note, devinée d'après les mots (feuille, cochenilles, rempotage, arrosage…) et modifiable avant d'ajouter. Script SQL `12-journal-icone.sql`.
### Corrigé
- Journal : le texte d'exemple n'est plus collé au cadre de saisie.

## [1.8.0] - 2026-11-02
### Ajouté
- Suivi des problèmes : sur la fiche, « Signaler un problème » (cochenilles, araignées rouges, pucerons…) avec une note et une relance du traitement (3, 7 ou 14 jours). Les traitements à refaire apparaissent dans Aujourd'hui (section « Traitements », comptés dans la pastille) et dans la notification du matin. Boutons « Traité » et « Résolu ». Script SQL `11-problemes.sql`.
### Modifié
- « Dernière feuille » disparaît de la fiche et du formulaire (le journal le remplace) ; les dates déjà saisies restent en base.

## [1.7.2] - 2026-11-02
### Corrigé
- Fiche d'une plante : à la première ouverture après le lancement de l'appli, la photo ne disparaît plus un instant avant de réapparaître (la grande photo est préparée avant de remplacer la vignette).

## [1.7.1] - 2026-11-02
### Ajouté
- Réglages > Stockage des photos : nombre de photos et place utilisée (estimation, sur 1 Go) avec une jauge.
### Corrigé
- Réglages > Notifications : plus d'espace entre le bouton « Activer » et les heures de rappel.

## [1.7.0] - 2026-11-02
### Ajouté
- Frise d'évolution : en haut de l'écran « Évolution » d'une plante (dès 2 photos), un curseur à faire glisser pour voir la plante grandir, de la première à la dernière photo, avec la date et le temps écoulé.

## [1.6.0] - 2026-11-02
### Ajouté
- Journal de la plante : dans la fiche, des notes datées (nouvelle feuille, cochenilles, rempotage…) avec une photo en option. La photo rejoint la galerie de la plante (même compression). Script SQL `10-journal.sql` (table `journal`).

## [1.5.0] - 2026-11-01
### Ajouté
- Notifications de rappel (iPhone, appli installée sur l'écran d'accueil) : un rappel le matin (10 h par défaut) avec ce qu'il y a à faire aujourd'hui (arrosages, engrais, tâches) et un rappel le soir (20 h) pour le lendemain. Activation, heures et rappels réglables dans Réglages > Notifications, avec un bouton de test.
- Fonction Supabase `rappels` (`supabase/functions/rappels/index.ts`) et scripts SQL `08-notifications.sql` et `09-horloge.sql`.

## [1.4.1] - 2026-11-01
### Modifié
- « Dernier engrais » devient « Dernière dose d'engrais » (fiche et formulaire), pour aller avec « Prochaine dose d'engrais ».

## [1.4.0] - 2026-11-01
### Ajouté
- Tâches prévues à l'avance : en ajoutant une tâche, on choisit « Aujourd'hui », « Demain » (présélectionné après 18 h) ou une autre date. Les tâches à venir sont rangées dans une section « À venir » et passent dans « Mes tâches » le jour venu.
- Script SQL `supabase/07-taches-date.sql` (colonne de la date prévue).
### Modifié
- Le champ d'ajout d'une tâche est vide (plus d'exemple affiché).
- Fiche d'une plante : plus d'espace entre le bouton « Photo d'évolution » et le nom de la plante.

## [1.3.0] - 2026-11-01
### Ajouté
- Tâches libres dans « À faire aujourd'hui » (ex. « Vaporiser les plantes du salon ») : on les ajoute, on les coche (« Fait », avec « Annuler »), on peut les supprimer. Une tâche cochée reste visible ce jour-là puis disparaît. La pastille de l'onglet compte aussi les tâches non faites.
- Script SQL `supabase/06-taches.sql` (table des tâches, protégée par compte).

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
