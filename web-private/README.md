# GLOBAL TRADING AI — application privée v0.10 (publiée sur Vercel)

Application publiée sur https://global-trading-ai-prive.vercel.app/ avec authentification Vercel pour tous les déploiements.

## Données et limites
- Graphiques, synthèse technique, actualités ciblées et calendrier : widgets TradingView.
- Premier moteur serveur : BTC/USD, lecture seule des cours et bougies Coinbase Exchange. Aucun compte de trading ni clé requis.
- Intervalle 15 minutes, 1 heure, 4 heures ou 1 jour. Les bougies de 4 heures sont agrégées à partir de 4 bougies horaires contiguës UTC.
- Vérification des OHLC, de la continuité et de la fraîcheur. Bougies encore ouvertes exclues. Dernier trade requis de moins de 2 minutes.
- Calcul des moyennes mobiles 20/50, ATR14, variation sur 4 bougies et extrêmes des 12 dernières bougies.
- GDELT : métadonnées des articles détectés sur une fenêtre de 24 heures, sources et liens. La date de détection ne certifie pas l’heure de publication. Titres non traduits automatiquement.
- Si GDELT échoue, communiqués officiels Fed et BCE des 30 derniers jours ; la couverture limitée est explicitement signalée. Échecs du flux conservés 10 minutes pour éviter les appels répétés.
- Repérage lexical expérimental des risques dans les titres. Pas de sentiment financier, ni de prédiction de l’impact sur le cours. Les événements économiques du widget ne sont pas lus par le moteur.
- Le moteur reste en mode observation, décision « attendre », sans ordre, taille de position ou probabilité future garantie. La projection de fin d’heure v0.5 reste expérimentale.
- Or, EUR/USD, US100, WTI et Apple : les prix bruts du moteur ne sont pas connectés. Les widgets restent disponibles. Un fournisseur autorisé couvrant ces instruments est nécessaire.

## Actualisation
La page Prévisions visible appelle le moteur chaque minute. Le ticker peut être conservé 20 secondes, les bougies 5 minutes, les articles 10 minutes dans la mémoire de la fonction. Les caches peuvent disparaître au redémarrage. Aucun calcul en arrière-plan lorsque la page est fermée, aucune notification automatique.

## Vérification
`node tests/analysis.test.js` vérifie l’exclusion des bougies ouvertes, les OHLC, les données anciennes et manquantes, les agrégations de 4 heures et l’absence de probabilité inventée. Les valeurs de test ne sont jamais servies dans l’application.

## Déploiement
Publication automatique depuis la branche `main`, dossier `web-private`, du dépôt GitHub connecté à Vercel. Framework Other, Node.js 24.x.
Pour une publication CLI depuis ce dossier : `npx vercel deploy --prod --scope global-edef`.
La route `/api/analyse` est une fonction Node Vercel ; elle nécessite cet hébergement et ne fonctionne pas comme simple fichier statique.
Ne jamais inclure les fichiers .env ou .vercel dans une archive. Maintenir Vercel Authentication sur All Deployments.

## iPhone
Ouvrir l’URL dans Safari, se connecter à Vercel, puis Partager > Sur l’écran d’accueil > Ajouter.

## Projection de fin d’heure v0.5
Pour le Bitcoin, la prochaine heure pleine est la cible commune à tous les intervalles d’indicateurs. L’horloge affiche la date et l’heure de Paris à partir de l’appareil. Le cours affiche séparément l’heure du dernier trade Coinbase.

Au moins 181 bougies horaires clôturées et contiguës sont requises. Les 60 premières cibles après 61 observations servent à comparer la variation logarithmique moyenne récente à la référence « cours inchangé ». Les 60 heures suivantes mesurent séparément l’erreur du modèle retenu. À chaque origine, seules les 61 observations antérieures sont utilisées.

Projection centrale : dernier cours × exp(dérive × fraction d’heure restante). Si la référence cours inchangé est retenue, dérive = 0. Bornes : projection centrale × exp(±1,645 × volatilité horaire × racine(fraction d’heure)), avec ajustement de l’incertitude de dérive pour le modèle de variation moyenne. Ces hypothèses ne garantissent pas la couverture future. L’adaptation aux minutes restantes n’est pas validée par les tests horaires.

L’erreur absolue moyenne et le nombre de clôtures passées à l’intérieur de la fourchette sont affichés dans les détails. Ce sont des mesures rétrospectives, pas un taux de réussite de trades. Les frais, spreads, événements et actualités ne sont pas intégrés à ce modèle. Les bornes ne représentent pas les extrêmes intrahoraires. À expiration de l’instantané ou à changement d’heure, la projection est masquée jusqu’au prochain calcul.

Vérification supplémentaire : `node tests/forecast.test.js`.

## Cours en direct v0.6
BTC/USD est abonné au canal ticker public Coinbase Exchange par WebSocket, avec heartbeat et reconnexion automatique à délai progressif. Les cotations sont contrôlées (prix positif, date récente et progression temporelle). L’affichage est limité à quatre rafraîchissements par seconde, sans recharger la page. Le flux se ferme hors de l’onglet Prévisions BTC/USD ou en arrière-plan et se reconnecte au retour. Une interruption est affichée et les prix anciens sont masqués. Les projections et indicateurs conservent leur horodatage propre et leur recalcul chaque minute ; ils ne se recalculent pas à chaque transaction.

## Cotations multi-marchés v0.7
Six panneaux TradingView actualisent leurs cotations sans rechargement : or OANDA:XAUUSD, EUR/USD OANDA:EURUSD, BTC Coinbase, US100 CAPITALCOM:US100, WTI TVC:USOIL, Apple NASDAQ:AAPL. La vue Prévisions reprend le panneau du marché sélectionné. Les scripts tiers sont montés une seule fois par navigation : le recalcul du moteur ne les remplace pas. Données en direct ou différées selon les droits du fournisseur, affichés dans chaque panneau. Aucune extraction des widgets n’est effectuée et les projections brutes restent limitées au BTC. Un accès fournisseur autorisé est nécessaire pour des prix bruts et un moteur multi-marchés.

Si WebSocket est indisponible, /api/cours récupère le dernier trade BTC toutes les 5 secondes sans cache applicatif. Une requête en cours interdit le chevauchement. Le timestamp fournisseur est validé côté serveur et client ; aucune nouvelle cotation n’est inventée en cas de coupure.

## Affichage iPhone v0.7.1
Les cadres de cotation réservent 200 pixels de hauteur, avec une hauteur minimale identique pour les iframes, pour empêcher la coupure du prix lorsque iOS agrandit les caractères. Le message de projection explique séparément que la cotation est visible mais que les historiques calculables des cinq autres marchés ne sont pas encore connectés.

## Moteur croisé v0.8
La synthèse du marché expose des raisons explicites d’attente, les titres reliés par mots-clés au marché, leurs dates (publication déclarée ou détection GDELT) et les scénarios de surveillance haussier/baissier. Les seuils sont les extrêmes de 12 bougies ; les repères d’invalidation et d’amplitude sont à 1 et 2 ATR du seuil. Ces conventions ne constituent pas une stratégie de placement validée. Aucun ordre, risque monétaire, taille de position, coefficient causal des nouvelles ou taux de réussite n’est calculé. Le calendrier économique visible reste externe au moteur.

Connexion brute préparée : Twelve Data, variable serveur TWELVE_DATA_API_KEY. Ne jamais mettre la clé dans le code client, un fichier livré ou une conversation. L’activation requiert un compte fournisseur et les droits nécessaires sur les actifs ; aucun compte ni abonnement n’a été créé. XAU/USD et EUR/USD sont agrégés ; AAPL est identifié NASDAQ ; WTI/USD est spot et ne doit pas être confondu avec le CFD TVC:USOIL. US100 n’est pas mappé tant que son contrat exact n’est pas identifié. Aucun ETF ou indice de remplacement n’est utilisé.

L’adaptateur demande les bougies intrajournalières en UTC (15min, 1h, 4h) et le dernier cours explicitement horodaté par last_quote_at ou last_update_at. Le timestamp d’ouverture de bougie n’est jamais utilisé comme timestamp de cotation. USD, symbole et qualité des OHLC sont contrôlés ; les cours anciens de plus de 120 secondes, les marchés déclarés fermés et les réponses incohérentes sont rejetés. L’intervalle 1D n’est pas activé pour ce fournisseur tant que son calendrier local n’est pas normalisé. Cache prix 5 secondes, bougies 5 minutes ; aucun effet n’est attribué aux nouvelles dans la valeur projetée.

Pour les marchés à sessions, les variations couvrant des interruptions sont exclues. Les fermetures et les trous de données ne sont pas distingués : c’est une limite affichée et une raison d’attente. Le modèle compare 60 cibles horaires antérieures puis mesure sur 60 cibles suivantes distinctes. À chaque origine, seules 60 variations entre bougies exactement séparées d’une heure et antérieures à la cible sont utilisées. Le calendrier de fermeture futur n’est pas intégré ; les projections sont expérimentales. Ce chemin est testé sur fixtures, mais n’a pas été validé en production sur Twelve Data faute d’accès fournisseur.

Tests supplémentaires : node tests/context-provider.test.js. Vérifie absence de requête sans clé, rejet de cours fermés/anciens ou non horodatés, exclusion de devises incorrectes, absence de remplacement de US100, datation des nouvelles, séparation sélection/mesure et état d’attente. Les fixtures ne sont jamais affichées comme cours de marché.


## Mesures après publication et contrat US100 — v0.9
Le panneau principal affiche les variations observées à +1 h et +4 h après les publications datées par leur source. L’ancrage est la dernière clôture horaire avant la publication ; la borne finale est la première clôture au moins à l’horizon demandé. Les heures exactes et la durée réelle sont affichées : une publication entre deux clôtures produit une fenêtre plus large que l’horizon nominal. Un historique interrompu, une date future ou une simple date de détection GDELT excluent la mesure.

La référence extrapole la moyenne des 24 rendements logarithmiques horaires antérieurs. L’écart à cette référence n’est PAS un effet causal : absence de groupe de contrôle, annonces simultanées, anticipation et sélection thématique non contrôlés. Les fenêtres peuvent se chevaucher. Pas de modification automatique des projections ni de signal de position validé. Sans historique et publication datée, aucune valeur n’est fabriquée.

Connexions serveur préparées, non activées sans accès fournisseur :

| Instrument | Données du moteur | Configuration serveur |
| --- | --- | --- |
| Or | Twelve Data XAU/USD, spot agrégé | TWELVE_DATA_API_KEY |
| EUR/USD | Twelve Data EUR/USD | TWELVE_DATA_API_KEY |
| Apple | Twelve Data AAPL, NASDAQ | TWELVE_DATA_API_KEY |
| WTI | Twelve Data WTI/USD, spot, distinct du CFD affiché TVC:USOIL | TWELVE_DATA_API_KEY |
| US100 | Capital.com US100, CFD US Tech 100, milieu bid/ask | CAPITAL_API_KEY, CAPITAL_IDENTIFIER, CAPITAL_API_PASSWORD |

US100 ne devient ni QQQ ni un indice d’une autre place. CAPITAL_API_ENV=demo par défaut ; live exige une configuration explicite. L’environnement démo est identifié à l’écran. L’API utilise uniquement l’authentification et la lecture des prix/historiques : aucun ordre. Capital.com ne propose pas de clé limitée à la lecture ; privilégier un compte démo dédié. Conserver les secrets dans les variables serveur Vercel, jamais dans le JavaScript public ni dans une conversation. Droits de données et instruments disponibles à confirmer auprès du fournisseur.

Intervalles Capital.com : MINUTE_15, HOUR, HOUR_4. Les cotations fermées, différées ou sans timestamp absolu récent sont rejetées. Aucun support 1D validé pour ces connecteurs. Les bougies historiques utilisent snapshotTimeUTC ; les prix récents utilisent updateTimeUTC, jamais l’heure d’ouverture d’une bougie. API officielle : https://open-api.capital.com/.

Vérifications supplémentaires : node tests/event-capital.test.js. Fixtures : exclusion des fenêtres non clôturées, des trous et dates de détection ; référence sans fuite future ; aucun accès sans secrets ; environnement démo/réel distinct ; contrat US100 exact et rejet des données anciennes, différées ou incohérentes. Le raccordement Capital.com n’a pas pu être testé sur un compte fournisseur ; les autres connecteurs ne disposent pas non plus d’accès configuré.


## Connexion Fusion / FP Markets par cTrader — v0.10
Connecteur serveur de données cTrader Open API JSON (port 5036), avec application et compte autorisés, authentification, abonnement aux cotations horodatées et historique à 15m / 1h / 4h. Chaque contrat doit être explicitement identifié par ID et nom exact et sa devise USD vérifiée dans la liste des actifs. Aucune substitution automatique de US100 par QQQ ou un autre contrat. Les cotations cTrader peuvent différer des cotations MT5 ou du widget TradingView, qui conserve sa propre source.

Variables serveur : MARKET_DATA_PROVIDER=ctrader, CTRADER_ENV=demo (ou live), CTRADER_CLIENT_ID, CTRADER_CLIENT_SECRET, CTRADER_ACCESS_TOKEN, CTRADER_ACCOUNT_ID, CTRADER_SYMBOLS (objet JSON par marché, chaque valeur contient id numérique et name exact). Ne jamais publier ces variables dans le code, le navigateur ou l’archive. L’application Open API doit être enregistrée et approuvée ; obtenir une autorisation OAuth avec scope accounts (lecture). Le connecteur ne met pas encore en place le parcours OAuth ni le renouvellement persistant du jeton : un jeton expiré impose une nouvelle autorisation côté serveur. Il n’a pas été testé sur un compte Fusion autorisé, faute d’accès fourni. Un compte MT5 n’autorise pas ce connecteur.

Une connexion cTrader est réutilisée par processus de fonction, avec heartbeat, rejet des erreurs et cotations bid/ask datées séparément. Le cycle de vie serverless et la limite globale de deux connexions exigent une validation réelle avant activation (plusieurs instances Vercel peuvent créer plusieurs connexions). Pour un usage permanent, déplacer ce connecteur sur un service unique durable est préférable. Les messages d’ordres sont interdits par liste blanche. Les fenêtres horaires sans tick ou avec interruptions restent non calculables.

L’endpoint /api/connexions distingue configuration et connexion vérifiée, sans exposer de secret. Paramètres affiche les accès manquants. /api/cours accepte les six marchés ; BTC et cTrader sont interrogés toutes les 5 secondes, les autres sources chaque minute sur le marché visible uniquement. Le forfait Twelve Data gratuit peut atteindre son quota : aucun accès illimité n’est promis. L’historique et la projection sont recalculés séparément chaque minute ; le dernier prix ne remplace pas la base horodatée d’une projection existante.

## Mesures d’actualité — v0.10
Les publications répétées de même URL/date sont dédoublonnées. Les fenêtres qui se chevauchent avec une autre publication reçue sont signalées et exclues de la médiane des écarts hors chevauchement. Synthèse par horizon +1h/+4h et par thème : taille d’échantillon, médiane, bornes observées. L’écart à la référence est en points de pourcentage. Normalisation interne par volatilité des 24 rendements antérieurs, sans regard futur. La synthèse reste descriptive : pas d’effet causal, pas de coefficient injecté dans la projection, pas de position parfaite. Une publication hors couverture peut encore contaminer une fenêtre dite sans chevauchement.

Validation : node --test tests/*.test.js. Tests de protocole cTrader sur fixtures, OHLC et échelle, bid/ask séparés, absence d’accès sans configuration, refus des ordres, erreurs et fenêtres d’actualité. Ces tests ne prouvent pas l’accès réel du courtier.

## Correctif 0.10.1 — 30 septembre 2026

- Test manuel d'une cotation récente dans Paramètres, distinct de la validation de l'historique.
- Cotations US100 sans téléchargement de 500 bougies à chaque rafraîchissement.
- Sessions Capital.com isolées par identifiants, requêtes d'authentification concurrentes regroupées et invalidation après 401.
- Cache Twelve Data isolé par clé, requêtes concurrentes regroupées ; les erreurs ne sont pas conservées.
- Changement de marché : le rafraîchissement n'attend plus le délai du marché précédent.
- 32 tests locaux réussis. Les tests de fournisseurs utilisent des données de contrôle, pas des comptes réels.

### Travail restant nécessitant un accès externe

Les cinq accès de données hors Bitcoin ne sont pas configurés. La présence d'un compte MT5 sur iPhone ne fournit pas automatiquement une API à cette application. Il faut un flux autorisé de cotations et d'historique pour chaque instrument ; aucune équivalence entre US100 CFD et ETF/indice n'est présumée. Aucune souscription n'est effectuée par le code.

Le calcul des variations après publication est descriptif. Un effet causal des actualités et une stratégie de placement fiable ne sont pas validés. Le moteur ne promet pas une position parfaite et n'exécute aucun ordre.
