# <img src="frontend/src/app/icon.svg" width="40" alt=""> HTTP Response Simulator

HTTP Response Simulator permet de tester un client contre une API dont vous choisissez la réponse. Configurez une méthode, un chemin, un statut et un corps, puis appelez l’URL publiée depuis votre application. Chaque appel produit une trace consultable. Un scénario peut aussi envoyer un webhook après un délai, y compris après une réponse d’erreur.

Par exemple, un service de documents peut répondre immédiatement `202 Accepted`, puis notifier le client deux minutes plus tard. Un autre scénario peut renvoyer `422` pour vérifier comment ce même client affiche un refus.

![Bibliothèque de simulations avec les projets Atlas et Studio](docs/bibliotheque.png)

## Démarrage local

Avec **Node.js 24 et npm**, depuis la racine du dépôt, exécutez les commandes suivantes.

```sh
cd frontend
npm ci
npm run dev
```

Ouvrez la console et choisissez **Créer un compte**. Renseignez votre adresse e-mail et un mot de passe de 10 à 256 caractères. Le nom et le prénom sont facultatifs. Pour vous reconnecter, utilisez votre e-mail et votre mot de passe. [Ouvrir la console locale](http://127.0.0.1:3210/)

La commande démarre la console sur le port `3210`, le worker qui livre les webhooks et le récepteur de recette local sur le port `3922`. Les données sont conservées dans `data/` à la racine du dépôt. Pour lancer la version compilée, exécutez `npm run build` puis `npm start` dans `frontend/`. La variable `PORT` permet de changer le port de la console.

### Avec Docker

Depuis la racine du dépôt, lancez `docker compose up --build -d`, puis ouvrez la même adresse. Le service `relais` conserve les données dans le volume `relais_data`. Le récepteur de recette reste interne au conteneur. Pour lancer Docker en parallèle de la console native, utilisez `RELAIS_PORT=3212 docker compose up --build -d`.

## Créer et appeler une première simulation

1. Dans **Projets**, créez un projet et copiez sa **clé de déclenchement**. Elle est affichée une seule fois et permet à votre client HTTP d’appeler les simulations du projet.
2. Ouvrez le projet, puis **Nouvelle simulation**. Dans **Paramètres**, nommez la simulation *Document accepté*, choisissez `POST` et saisissez le chemin exact `/v1/documents`.
3. Dans **Réponse**, indiquez le statut `202`, le type `application/json` et le corps `{"etat":"pending"}`. Vérifiez l’aperçu du brouillon. Sur mobile, le bouton **Aperçu** ouvre ce panneau.
4. Cliquez sur **Publier**, puis **Confirmer la publication**. Dans **Version publiée**, cliquez sur **Tester v1**. La trace affiche la réponse HTTP 202 et le corps servi.
5. Pour répéter le test depuis votre propre client, utilisez **Copier le cURL** dans l’éditeur. Renseignez localement `RELAIS_TEST_KEY` avec la clé du projet. La commande contient déjà la méthode et l’URL complète, identifiant de simulation compris.

Pour cet exemple, si `SIMULATION_URL` contient l’URL complète affichée dans **Détails de l’appel test**, l’appel suivant affiche aussi les en-têtes de réponse.

```sh
curl -i -X POST "$SIMULATION_URL" -H "X-Lab-Key: $RELAIS_TEST_KEY"
```

Le résultat attendu est un statut `202`, le corps `{"etat":"pending"}` et un en-tête `X-Correlation-Id` qui identifie l’exécution. Le client peut également transmettre le SHA du code testé dans l’en-tête `X-Tested-Sha`.

## Configurer un scénario

| Onglet de l’éditeur | Ce que vous configurez |
| --- | --- |
| **Réponse** | Statut HTTP, en-têtes, corps JSON, XML ou texte, ou réponse sans corps. Les en-têtes se trouvent à côté de l’onglet **Corps**. |
| **Variables** | Valeurs fixes, générées ou lues dans le JSON entrant. L’éditeur permet de les insérer dans le corps de la réponse ou du webhook. |
| **Webhook** | Notification POST différée, URL de réception, délai, en-têtes et corps. |
| **Paramètres** | Nom, projet, méthode, chemin exact, résultat métier attendu, SHA du code testé et partage de la simulation. |

**Brouillon et version publiée.** Vous pouvez enregistrer un brouillon avec du JSON incomplet. La publication valide le contrat et crée une version. Tant que vous travaillez sur le brouillon, le client et le bouton **Tester v1** continuent d’appeler la version active. Chaque trace conserve la version réellement servie. L’archivage désactive le point d’appel et conserve les traces pendant leur durée de rétention.

**Variables typées.** Dans un corps JSON, `{"quantite":"{{quantite}}"}` produit `{"quantite":3}` si la variable est un entier de valeur 3. Dans `"lot-{{quantite}}"`, le résultat est la chaîne `"lot-3"`. Le mode **Champ entrant facultatif** lit un champ de premier niveau du JSON reçu et utilise la valeur par défaut si ce champ est absent. Dans un corps XML, les valeurs insérées sont échappées dans le texte et les attributs.

**URL de réception.** Activez le webhook et sélectionnez une destination autorisée, ou saisissez une **URL de réception** puis cliquez sur **Enregistrer l’URL**. Une nouvelle URL externe doit être approuvée par un opérateur dans **Notifications → Autorisations**. Le récepteur de recette fourni permet de tester localement une livraison lorsqu’il est activé pour le projet.

## Suivre les exécutions et les notifications

- **Exécutions** regroupe les 250 appels autorisés les plus récents par jour UTC. Filtrez par projet, date, simulation, famille de statut HTTP ou état du webhook. Ouvrez un appel pour consulter sa chronologie, ses variables résolues, la requête, la réponse et leurs en-têtes dans l’inspecteur HTTP. Les traces masquent les données sensibles selon les règles de conservation.
- **Notifications** affiche le dernier signal du worker, le retard de la file, les livraisons en attente, livrées ou en échec et les destinations autorisées. Pour examiner les tentatives d’un webhook précis, ouvrez son exécution. Après une livraison réussie, **Rejouer la notification** permet de tester une fois le même message avec la même clé d’idempotence.

## Partager un projet ou une simulation

Dans **Projets**, choisissez **Partager** pour donner accès à un projet et à ses simulations présentes et futures. Pour partager une seule simulation, ouvrez **Paramètres → Partager la simulation**. Saisissez l’adresse e-mail d’un utilisateur déjà inscrit ou choisissez **Public pour tous les utilisateurs connectés**. Le lien copié ouvre la ressource sur la même instance.

Le destinataire peut consulter la ressource et dupliquer la simulation dans son propre projet. Une simulation publiée expose sa version active. Une simulation encore en brouillon partage sa configuration courante. Le filtre **Partagées avec moi** permet de retrouver les simulations partagées. Les clés, les historiques et la publication restent réservés aux membres du projet. Retirer un accès laisse subsister les autres partages et les copies déjà créées.

Pour une instance d’équipe, utilisez une adresse commune derrière un proxy HTTPS, définissez `RELAIS_ORIGIN` sur son origine exacte et conservez le volume de données.

## Explorer les scénarios de démonstration

Le compte **Pilote** dispose de quatre simulations initiales. L’initialisation enregistre son e-mail et son mot de passe dans le fichier privé `data/connexion-pilote.json` (dans Docker, `/var/lib/relais/connexion-pilote.json`). Utilisez ces identifiants sur l’écran **Se connecter**. Si ce compte possède déjà un mot de passe, ses identifiants existants restent valides.

| Projet | Simulation | Comportement |
| --- | --- | --- |
| Atlas | Validation de ressource | HTTP 400 avec un motif de validation et une référence. |
| Atlas | Acceptation sans référence | HTTP 202 avec un état en attente, sans référence. |
| Atlas | Refus explicite | HTTP 422 avec le code métier `REQUEST_REJECTED`. |
| Studio | Génération de document | HTTP 202, puis webhook après deux minutes avec la même référence. |

## Tests et exploitation

Exécutez les commandes depuis `frontend/`.

| Commande | Vérification |
| --- | --- |
| `npm run test:lab` | Moteur de simulation, permissions, versions, traces, file de livraison et idempotence. |
| `npm run lint && npm run typecheck && npm run build` | Analyse statique, types et compilation Next.js. |
| `npm run test:browser` | Parcours bureau et mobile sur une base éphémère, après compilation. |
| `npm run test:acceptance` | Quatre scénarios de démonstration sur une instance démarrée, avec livraison réelle à deux minutes et doublon contrôlé. |

Le test navigateur utilise Chrome sur macOS lorsqu’il est installé. Sur un autre poste, installez Chromium avec `npx playwright install chromium`. Le test de recette crée des exécutions dans l’historique de l’instance et attend les contrats de démonstration d’origine. La recette lit les identifiants dans le fichier de connexion du pilote. Pour utiliser les identifiants d’un compte Pilote déjà configuré, définissez `RELAIS_QA_EMAIL` et `RELAIS_QA_PASSWORD`.

Le code de la console et du moteur se trouve dans `frontend/src/lab/`, les routes HTTP dans `frontend/src/app/` et les scripts de démarrage dans `frontend/scripts/`. SQLite conserve les scénarios, leurs versions, les exécutions et la file de notifications. Le socle FastAPI initial et ses outils de supervision sont conservés pour référence.

- [Guide d’exploitation, droits et limites du pilote](docs/exploitation.md)
- [Résultats de recette](docs/recette.md)
- [Cahier des charges](https://docs.google.com/document/d/1n3dh1Gk7feDwRer23Dr9DjZy1AuGfQzXIbfdK0HdHHA/edit)
