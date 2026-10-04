# Moteur serveur continu — prêt, non activé

Ce programme exécute le moteur existant indépendamment du navigateur. Il nécessite un serveur Node.js 24 permanent et un disque persistant. Il ne doit pas être lancé dans une fonction Vercel ni considéré comme actif parce que ce fichier est publié.

## Démarrage sur le serveur

Configurer les identifiants Capital.com dans le gestionnaire de secrets du serveur, avec CAPITAL_API_ENV=live. Ne jamais les déposer dans GitHub. Définir TRADING_WORKER_DATA_DIR sur un répertoire absolu privé, hors du dépôt, puis exécuter `node continuous-worker.cjs` depuis web-private. Un seul processus doit tourner pour ce répertoire. Installer le processus sous un superviseur qui le redémarre après panne et redémarrage du serveur.

Le moteur vise un cycle toutes les 60 secondes pour les six marchés. Les appels sont séquentiels, sans chevauchement de cycles. Si les fournisseurs prennent plus d’une minute, le cycle suivant commence après leur fin ; aucune cadence exacte ni disponibilité absolue ne peut être garantie.

Chaque calcul est enregistré avant publication du dernier instantané dans un journal quotidien JSONL. Les fichiers sont privés, hors du dépôt. Les erreurs individuelles n’empêchent pas les autres marchés d’être traités. Un heartbeat donne les dates du cycle, ses échecs et son dépassement éventuel. Surveiller un heartbeat vieux de plus de trois minutes, les cycles échoués et l’espace disque. Prévoir sauvegarde et rétention des journaux selon l’espace disponible.

## État et étapes restantes

Le worker n’est pas activé : aucun serveur permanent ni stockage persistant n’est provisionné. Vercel Hobby ne fournit pas la planification minute requise. Aucun abonnement n’a été souscrit.

Les calculs stockés ne sont pas encore servis à l’application Vercel. Après sélection d’un hébergement, il faut configurer le stockage sécurisé, raccorder la lecture des instantanés à l’application et vérifier plusieurs cycles avec le navigateur fermé ainsi qu’un redémarrage. Les instantanés expirés doivent rester signalés comme tels.

L’enregistrement prospectif rendra possible une mesure future des erreurs ; il ne constitue ni cette mesure, ni une validation de la fiabilité. Aucun ordre de trading n’est exécuté.
