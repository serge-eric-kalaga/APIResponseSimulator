# Relais — banc de test API

Relais remplace une dépendance HTTP en recette. Chaque appel conforme sélectionne une version publiée, résout ses variables et conserve une trace. Un webhook facultatif peut partir après la réponse, y compris lorsque celle-ci est une erreur HTTP.

## Démarrer sur son poste

Avec Node.js 24, depuis la racine du dépôt, lancer les commandes suivantes.

```sh
cd frontend
npm ci
npm run dev
```

Ouvrir [la console locale](http://127.0.0.1:3210). Le premier démarrage crée les projets fictifs Atlas et Studio et quatre scénarios actifs. Le fichier privé `data/acces-pilote.json`, à la racine du dépôt, contient la `cle_interface` du compte Pilote et une clé de déclenchement par projet. Le démarrage suivant reprend la même base. Les fichiers de ce dossier sont exclus de Git.

Pour exécuter la version compilée, utiliser `npm run build` puis `npm start` dans `frontend/`. Les deux modes lancent la console, le worker et le récepteur HTTP local. La console écoute sur le port 3210 et le récepteur sur 3922. La variable `PORT` change le port de la console.

### Avec Docker

```sh
docker compose up --build -d
docker compose cp relais:/var/lib/relais/acces-pilote.json ./data-acces-pilote.json
```

Le volume nommé `relais_data` conserve les données entre deux démarrages. Le fichier copié contient des clés personnelles. Conserver ses droits en lecture privée. Pour utiliser simultanément Docker et le pilote natif, lancer Docker avec `RELAIS_PORT=3212 docker compose up --build -d`. Le récepteur reste interne au conteneur.

## Premier appel

1. Dans **Bibliothèque**, ouvrir **Validation de ressource**. La version 1 simule un POST qui renvoie HTTP 400.
2. Cliquer sur **Exécuter la version v1**. La chronologie indique le code servi, la version et la corrélation. La section des données contient le corps JSON et les variables masquées si nécessaire.
3. Pour brancher un client externe, copier le cURL depuis l’éditeur. Fournir la clé du projet via la variable locale `RELAIS_TEST_KEY` utilisée dans la commande. Le client peut joindre le SHA du code testé dans `X-Tested-Sha`. Chaque appel crée une nouvelle exécution.
4. Ouvrir **Génération de document** pour tester la réponse HTTP 202 et la notification à deux minutes. Suivre sa livraison dans **Exécutions**. Après une livraison réussie, **Rejouer la notification** permet de tester une fois le même message et la même clé d’idempotence.
5. Pour modifier un contrat, enregistrer le brouillon, vérifier l’aperçu puis publier. L’URL stable utilise la dernière version publiée. L’archivage désactive cette URL et conserve les preuves pendant la durée de rétention.

Un brouillon accepte du JSON incomplet. La publication exige une configuration valide. Une variable seule, par exemple `"{{quantite}}"`, restitue le type JSON de sa valeur. L’expression `"lot-{{quantite}}"` restitue une chaîne. Le mode **Champ entrant facultatif** lit un champ de premier niveau du corps JSON. Une donnée présente de type incorrect déclenche une erreur technique identifiable.

## Exploitation et tests

Les commandes suivantes s’exécutent dans `frontend/`.

| Commande | Vérification |
|---|---|
| `npm run test:lab` | Moteur, transactions, accès, masquage, versionnement, file, reprises et idempotence |
| `npm run lint && npm run typecheck && npm run build` | Analyse statique et compilation Next.js |
| `npm run test:browser` | Parcours bureau et mobile sur une base éphémère, après compilation |
| `npm run test:acceptance` | Quatre contrats fictifs sur le pilote démarré, livraison réelle à deux minutes puis doublon contrôlé |

Le test navigateur utilise Chrome sur macOS lorsqu’il est installé. Sur un autre poste, installer Chromium avec `npx playwright install chromium`. Le test de recette conserve les exécutions créées dans l’historique. Utiliser les scénarios initiaux avec leurs contrats d’origine.

- [Architecture, droits, destinations et limites du pilote](docs/exploitation.md)
- [Résultats de recette](docs/recette.md)
- [Cahier des charges du simulateur](https://docs.google.com/document/d/1n3dh1Gk7feDwRer23Dr9DjZy1AuGfQzXIbfdK0HdHHA/edit)

Le produit actif se trouve dans `frontend/src/lab`, ses routes dans `frontend/src/app` et les processus locaux dans `frontend/scripts/lab-*.mjs`. Le socle FastAPI initial, ses outils de supervision et les anciennes pages génériques sont conservés pour référence. Le premier commit Git contient le template tel qu’il a été reçu.
