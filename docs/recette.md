# Recette du 18 novembre 2026

La recette a utilisé le pilote local, les projets fictifs Atlas et Studio et le récepteur de test livré dans le dépôt. Le SHA du code testé était `eb9e1e51057c02aeb1ef0dfe15ab95bd3a446ae5`. Chaque exécution ci-dessous utilise la version v1 de son scénario. Les liens ouvrent les traces dans la console du poste après connexion, pendant la durée de rétention.

| Scénario et attendu dans le pilote | Résultat observé | Preuve |
|---|---|---|
| Rejeter une création de ressource invalide | HTTP 400, code `INVALID_REQUEST`, aucune notification | [Exécution de validation](http://127.0.0.1:3210/#/runs/c73be34f-bfe5-4503-8e11-125d43dd7798) |
| Accepter une demande sans référence immédiate | HTTP 202, état `pending`, champ `reference` absent | [Exécution sans référence](http://127.0.0.1:3210/#/runs/5f53d674-45bc-435d-8820-c44857b72112) |
| Signaler un refus explicite | HTTP 422, état `refused`, aucune notification | [Exécution de refus](http://127.0.0.1:3210/#/runs/a8408512-9f9b-4951-8860-64250b34f852) |
| Accepter un document puis notifier son succès à deux minutes | HTTP 202, état `pending`, référence identique dans la réponse et le webhook | [Exécution asynchrone](http://127.0.0.1:3210/#/runs/e5f19185-4060-4daf-a22f-dcce4e9b1c73) |

## Livraison observée

La notification `4c044fac-91f9-4178-8b9c-32aebaaa8f73` a été programmée pour **02:29:22,294 UTC**. La console, le worker et le récepteur ont été arrêtés puis redémarrés pendant l’attente. La base indépendante du récepteur a enregistré la première livraison à **02:29:22,493 UTC**, soit **T+120,199 s**. La tolérance fixée pour ce pilote était de cinq secondes après l’échéance.

Après confirmation du premier HTTP 204, le client de recette a demandé une répétition volontaire. Le récepteur a enregistré deux appels sous le même identifiant, deux accusés HTTP 204 et une seule transition de document. La vérification lit la base du récepteur indépendamment des traces du simulateur.

Une seconde passe sur la révision applicative `16588b99ee8d9b3da5219eef50759fd3920c50d6` a confirmé les quatre contrats. La notification a été reçue à **T+120,214 s**. Les deux accusés ont été HTTP 204 et le récepteur a confirmé une seule transition. [Trace du second contrôle](http://127.0.0.1:3210/#/runs/0c07a339-5750-471c-9441-b8ba6950f04b)

## Vérifications reproductibles

- Les tests du moteur vérifient le type JSON des champs, les générateurs, les valeurs par défaut, l’absence de retraitement des valeurs et les erreurs de validation.
- Les tests de persistance vérifient l’isolation entre projets, les publications stables, l’archivage, le masquage, le quota de tentatives et l’annulation transactionnelle de l’exécution si la file échoue.
- Les tests du worker utilisent deux connexions SQLite indépendantes, une fermeture puis une réouverture du fichier, un bail expiré, une réponse 503, des refus permanents, une révocation de destination et une annulation.
- Le parcours automatisé sous Chrome couvre la connexion, les filtres, l’insertion visuelle d’un entier, l’aperçu sans appels API, la sauvegarde d’un brouillon invalide, sa reprise après rechargement, la publication, l’exécution, la copie cURL et du résumé, la duplication, l’archivage et la navigation à 375 px.
- L’image Docker a été construite et lancée dans un projet Compose isolé. Le contrôle de santé, la connexion, les quatre scénarios initiaux, le signal du worker et le déclenchement HTTP 400 ont été vérifiés.

Pour une intégration réelle, fournir ses contrats de test, le SHA de l’application appelante et son résultat attendu. La recette ci-dessus documente uniquement le comportement du pilote et du récepteur fictif.

## Comptes personnels et partage

La compilation locale de la révision applicative `a3221ba` a servi les quatre contrats de recette. Le récepteur a reçu le webhook à T+120,076 s. L’envoi et sa répétition ont obtenu HTTP 204 et produit une seule transition. [Trace du contrôle multi-comptes sur le pilote](http://127.0.0.1:3210/#/runs/6999fe75-e938-412c-8457-ec83c2c22b1e)

Le parcours navigateur a utilisé trois comptes sur une base éphémère. Il a vérifié l’inscription, la création d’un projet et d’un environnement, la publication d’une réponse XML, l’enregistrement d’une URL de réception, le partage individuel, la duplication et la révocation. Un troisième compte a vu la simulation pendant la période de visibilité publique de son environnement. Une session anonyme a reçu HTTP 401 sur l’API. Deux insertions consécutives dans l’éditeur ont produit un objet JSON valide avec deux propriétés, et l’entier inséré a conservé son type dans l’aperçu.

La suite de 23 tests vérifie aussi le cumul de deux partages sur la même simulation et la confidentialité du brouillon suivant une version publiée. Un contrôle HTTP distinct a confirmé la livraison au récepteur local après enregistrement de son URL dans un environnement nouvellement créé.
