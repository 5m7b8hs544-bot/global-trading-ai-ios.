'use strict';
const categories=[
 {type:'Banques centrales / taux',pattern:/\b(rate|rates|monetary|monétaire|inflation|taux)\b/i,markets:['XAU/USD','EUR/USD','BTC/USD','US100','WTI','AAPL']},
 {type:'Géopolitique / énergie',pattern:/\b(war|guerre|sanction|attack|attaque|opec|oil|pétrole|ceasefire)\b/i,markets:['XAU/USD','WTI']},
 {type:'Crypto / réglementation',pattern:/\b(bitcoin|crypto|cryptocurrency)\b/i,markets:['BTC/USD']},
 {type:'Apple / résultats',pattern:/\b(apple|iphone)\b/i,markets:['AAPL','US100']}
];
function timeOf(article){
 if(article.publishedAt)return {at:Date.parse(article.publishedAt),kind:'publication déclarée'};
 const m=/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(article.seenAt||'');
 return {at:m?Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`):NaN,kind:'détection, publication non vérifiée'};
}
function buildContext(symbol,technical,news,now=Date.now()){
 const observations=(news?.articles||[]).flatMap(a=>{
  const topics=categories.filter(c=>c.markets.includes(symbol)&&c.pattern.test(a.title||'')).map(c=>c.type);
  if(!topics.length)return [];const t=timeOf(a);
  return [{title:a.title,url:a.url,source:a.source,topics,datedAt:Number.isFinite(t.at)?new Date(t.at).toISOString():null,dateKind:t.kind,recent:Number.isFinite(t.at)&&t.at<=now&&now-t.at<=21600000,note:'Lien thématique détecté dans le titre. Sens et amplitude de l’effet sur le cours non établis.'}];
 });
 const blockers=[];
 if(!technical)blockers.push('Cours et historique calculables manquants');
 if(technical?.historyGapCount)blockers.push('Interruptions de l’historique : fermetures et données manquantes non distinguées');
 if(news?.status!=='available')blockers.push('Couverture internationale des nouvelles incomplète');
 if(observations.some(a=>a.recent))blockers.push('Nouvelle récente à examiner avant de conclure');
 blockers.push('Calendrier des annonces non connecté au calcul','Stratégie de placement non validée après frais et spread');
 let plans=[];
 if(technical){
  const {support,resistance,atr,interval}=technical;
  if([support,resistance,atr].every(Number.isFinite)&&atr>0&&support<resistance)plans=[
   {side:'Scénario haussier à surveiller',trigger:resistance,condition:`Clôture d’une bougie ${interval} au-dessus du plus haut des 12 dernières bougies, puis maintien confirmé.`,invalidation:resistance-atr,reference:resistance+2*atr},
   {side:'Scénario baissier à surveiller',trigger:support,condition:`Clôture d’une bougie ${interval} sous le plus bas des 12 dernières bougies, puis maintien confirmé.`,invalidation:support+atr,reference:support-2*atr}
  ].filter(p=>p.invalidation>0&&p.reference>0);
 }
 return {decision:'attendre',status:'surveillance',blockers,observations,plans,computedAt:new Date(now).toISOString(),calendar:{status:'not_connected',note:'Le calendrier visible est une consultation externe, pas une donnée intégrée au moteur.'},planNote:'Plans de surveillance expérimentaux : invalidation à 1 ATR et repère à 2 ATR du seuil. Convention non optimisée ni validée ; ce ne sont pas des ordres ni des objectifs garantis. Aucune taille de position calculée.',impactNote:'Les nouvelles sont croisées par thème, date et marché pour signaler les éléments à examiner. Aucun coefficient causal ou effet chiffré sur le prix n’est inventé.',confidence:null};
}
module.exports={buildContext};
