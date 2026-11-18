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

## Vérifications reproductibles

- Les tests du moteur vérifient le type JSON des champs, les générateurs, les valeurs par défaut, l’absence de retraitement des valeurs et les erreurs de validation.
- Les tests de persistance vérifient l’isolation entre projets, les publications stables, l’archivage, le masquage, le quota de tentatives et l’annulation transactionnelle de l’exécution si la file échoue.
- Les tests du worker utilisent deux connexions SQLite indépendantes, une fermeture puis une réouverture du fichier, un bail expiré, une réponse 503, des refus permanents, une révocation de destination et une annulation.
- Le parcours automatisé sous Chrome couvre la connexion, les filtres, la sauvegarde d’un brouillon invalide, sa reprise après rechargement, la publication, l’exécution, la copie cURL et du résumé, la duplication, l’archivage et la navigation à 375 px.
- L’image Docker a été construite et lancée dans un projet Compose isolé. Le contrôle de santé, la connexion, les quatre scénarios initiaux, le signal du worker et le déclenchement HTTP 400 ont été vérifiés.

Pour une intégration réelle, fournir ses contrats de test, le SHA de l’application appelante et son résultat attendu. La recette ci-dessus documente uniquement le comportement du pilote et du récepteur fictif.
