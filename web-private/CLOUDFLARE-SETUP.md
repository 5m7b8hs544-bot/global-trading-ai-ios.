# Collecteur autonome — préparé, pas activé

Le fichier `cloudflare-worker.mjs` appelle toutes les minutes le moteur Vercel
pour les six instruments configurés et conserve les résultats dans D1 pendant
sept jours. Les clés Capital restent sur Vercel. Aucun ordre de bourse.
Il n'ajoute pas d'accès public à la base. Il ne modifie pas encore l'affichage
Vercel pour lire le journal : l'interface continue à calculer à la demande.

## Installation dans le tableau de bord Cloudflare

1. Dans Workers & Pages, créer un Worker `global-trading-collector` avec le
   contenu de `cloudflare-worker.mjs` (module ES).
2. Créer une base D1 `global-trading-journal`, puis exécuter le contenu de
   `cloudflare-schema.sql` dans sa console SQL.
3. Ajouter au Worker le binding D1 nommé exactement `DB` vers cette base.
4. Ajouter la variable texte `ENABLED` avec la valeur `true`.
5. Ajouter le déclencheur Cron `* * * * *` (chaque minute).
6. Vérifier au moins trois minutes distinctes dans D1, avec six lignes par
   minute, des dates récentes et des résultats `observation` quand le marché
   est ouvert. Vérifier les journaux d'exécution et la consommation CPU.

Contrôle SQL :

```sql
SELECT minute,symbol,status,recorded_at FROM observations
ORDER BY minute DESC,symbol LIMIT 18;
```

## Conditions de mise en service

Le Worker est une préparation, pas une preuve d'exécution 24 h/24. Le navigateur
Cloudflare du projet était bloqué lors de sa préparation. Aucun Worker ni base
D1 n'a été créé automatiquement.

Le Worker exige une réponse JSON de l'API Vercel, sans redirection. Si Vercel
exige une authentification, la collecte échouera : ne pas désactiver la
protection et ne pas partager de clé dans le code. Il faudra configurer un
accès serveur autorisé séparément avant de déclarer ce service opérationnel.

L'offre gratuite Workers dispose d'un budget CPU très limité. Tester cette
consommation en production, ainsi que les quotas de fonctions Vercel et D1,
avant de déclarer le fonctionnement continu viable. Aucune souscription
payante automatique. Une cadence d'une minute n'est pas un flux tick par tick.

Les exécutions trop tardives sont ignorées ; un verrou D1 évite le chevauchement.
Un échec n'est pas remplacé par un ancien prix. Les doublons ne réécrivent pas
les résultats. Un arrêt n'est pas une garantie de reprise des minutes perdues.
Désactiver en passant `ENABLED` à `false`, puis retirer le Cron si nécessaire.

Ce journal prépare une évaluation prospective mais ne calcule pas encore
l'erreur face au cours réalisé. Les actualités ne sont pas intégrées à la
prévision. Aucun taux de réussite, aucune précision future garantie.
