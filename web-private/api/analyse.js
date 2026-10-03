'use strict';
const {CapitalAccessError}=require('../lib/capital');
const {seconds,normalize,aggregate4h,analyse}=require('../lib/analysis');
const {parseFeed}=require('../lib/news');
const {project,projectSessions}=require('../lib/forecast');
const {connectionConfig,marketData}=require('../lib/connections');
const {buildContext}=require('../lib/context');
const {eventStudy}=require('../lib/event-study');

const cache=new Map();
const markets=['XAU/USD','EUR/USD','BTC/USD','US100','WTI','AAPL'];
const queries={
 'XAU/USD':'(gold OR "precious metals") (inflation OR "interest rates" OR geopolitics)',
 'EUR/USD':'(euro OR "US dollar") (ECB OR "Federal Reserve" OR inflation)',
 'BTC/USD':'(bitcoin OR cryptocurrency) (regulation OR ETF OR "Federal Reserve" OR hack)',
 'US100':'(Nasdaq OR "US stocks") (earnings OR inflation OR "Federal Reserve")',
 'WTI':'(oil OR OPEC) (supply OR inventories OR sanctions)',
 'AAPL':'(Apple OR iPhone) (earnings OR sales OR regulation)'
};
async function json(url,ttl){
 const cached=cache.get(url);if(cached&&Date.now()-cached.at<ttl)return cached.value;
 const response=await fetch(url,{headers:{'Accept':'application/json','User-Agent':'GlobalTradingPrivate/0.4'},signal:AbortSignal.timeout(9000)});
 if(!response.ok)throw new Error('Fournisseur indisponible');
 const value=await response.json();cache.set(url,{at:Date.now(),value});return value;
}
function safeUrl(value){try{const u=new URL(value);return u.protocol==='https:'||u.protocol==='http:'?u.href:null}catch{return null}}
async function news(symbol){
 const newsKey='news:'+symbol,cached=cache.get(newsKey);
 if(cached&&Date.now()-cached.at<600000)return cached.value;
 let result;
 try{
  const params=new URLSearchParams({query:queries[symbol],mode:'artlist',format:'json',maxrecords:'15',timespan:'24h',sort:'datedesc'});
  const data=await json('https://api.gdeltproject.org/api/v2/doc/doc?'+params,600000);
  if(!Array.isArray(data.articles))throw new Error('Flux absent');
  const articles=data.articles.map(a=>({title:String(a.title||'').slice(0,400),url:safeUrl(a.url),source:String(a.domain||'').slice(0,100),seenAt:String(a.seendate||''),country:String(a.sourcecountry||'').slice(0,100)})).filter(a=>a.url&&a.title);
  const flagged=articles.filter(a=>/war|sanction|attack|hack|lawsuit|rate hike|rate cut|inflation|guerre|piratage/i.test(a.title)).length;
  result={status:articles.length?'available':'empty',source:'GDELT',retrievedAt:new Date().toISOString(),articles,flagged,note:'Repérage lexical expérimental dans les titres : ce n’est ni une mesure de sentiment ni une estimation de l’effet sur le cours. Date indiquée : détection par GDELT, pas publication certifiée.'};
 }catch{
  const feeds=[['https://www.federalreserve.gov/feeds/press_monetary.xml','Federal Reserve','États-Unis'],['https://www.ecb.europa.eu/rss/press.html','BCE','Zone euro']];
  const results=await Promise.allSettled(feeds.map(async([url,source,country])=>{
   const key='rss:'+url;const old=cache.get(key);if(old&&Date.now()-old.at<600000)return old.value;
   const r=await fetch(url,{signal:AbortSignal.timeout(7000)});if(!r.ok)throw new Error('Source indisponible');
   const articles=parseFeed(await r.text(),source,country,Date.now());cache.set(key,{at:Date.now(),value:articles});return articles;
  }));
  const articles=results.filter(r=>r.status==='fulfilled').flatMap(r=>r.value).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)).slice(0,15);
  result={status:articles.length?'limited':'unavailable',source:'Communiqués Fed / BCE',retrievedAt:new Date().toISOString(),articles,flagged:0,note:'GDELT indisponible. Couverture de remplacement limitée aux communiqués officiels Fed et BCE des 30 derniers jours, sans influence calculée sur ce marché. Date de publication déclarée par la source.'};
 }
 cache.set(newsKey,{at:Date.now(),value:result});return result;
}
module.exports=async function(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='GET')return res.status(405).json({status:'unavailable',reason:'Méthode non autorisée'});
 const symbol=req.query.symbol,interval=req.query.interval||'1h';
 if(!markets.includes(symbol)||!seconds[interval])return res.status(400).json({status:'unavailable',reason:'Instrument ou intervalle invalide'});
 const newsTask=news(symbol);
 let technical=null,reason=null,forecast=null,forecastReason=null,eventCandles=[];
 if(symbol!=='BTC/USD'){
  const config=connectionConfig(symbol,interval);
  if(!config.ready)reason=config.reason;
  else try{
   const raw=await marketData(symbol,interval),now=Date.now();
   eventCandles=normalize(raw.hours,3600,now);
   technical={...analyse(normalize(raw.rows,seconds[interval],now),raw.ticker,interval,now,{sessionGaps:true}),source:raw.source};
   try{forecast=projectSessions(eventCandles,Number(raw.ticker.price),now)}catch(e){forecastReason='Projection non calculée : '+e.message}
  }catch(e){reason=e instanceof CapitalAccessError?e.message:['Marché fermé : pas de scénario courant','Cotation trop ancienne ou non horodatée','Cotation fournisseur incohérente','Réponse fournisseur incohérente'].includes(e.message)?e.message:'Données fournisseur indisponibles : vérifier les droits d’accès et la qualité du flux.'}
 }
 else try{
  const step=interval==='4h'?3600:seconds[interval];
  const hourTask=json('https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=3600',300000);
  const [rows,ticker,hourRows]=await Promise.all([
   step===3600?hourTask:json('https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity='+step,300000),
   json('https://api.exchange.coinbase.com/products/BTC-USD/ticker',20000),hourTask
  ]);
  const now=Date.now();eventCandles=normalize(hourRows,3600,now);let candles=normalize(rows,step,now);if(interval==='4h')candles=aggregate4h(candles);
  technical={...analyse(candles,ticker,interval,now),source:'Coinbase Exchange · BTC-USD'};
  try{
   const hours=eventCandles;analyse(hours,ticker,'1h',now);
   forecast=project(hours,Number(ticker.price),now);
  }catch{forecastReason='Projection horaire indisponible : historique horaire insuffisant, incomplet ou trop ancien.'}
 }catch(e){reason=['Historique absent','Bougie invalide','Cotations incohérentes','Historique incomplet','Historique trop ancien','Dernier cours absent ou trop ancien','Volatilité non calculable','Historique insuffisant : 60 bougies clôturées requises'].includes(e.message)?e.message:'Données Coinbase indisponibles. Aucun scénario calculé.'}
 if(forecast&&technical){forecast.basePrice=technical.price;forecast.priceAt=technical.priceAt;forecast.source=technical.source}
 const headlines=await newsTask;
 const context=buildContext(symbol,technical,headlines);
 context.newsStudy=eventStudy(eventCandles,context.observations);
 const connection={status:technical?'connected':'not_ready',provider:connectionConfig(symbol,interval).provider,reason,source:technical?.source||null};
 return res.status(200).json({symbol,interval,computedAt:new Date().toISOString(),status:technical?'observation':'unavailable',technical,reason,forecast,forecastReason,news:headlines,context,connection,decision:'attendre',decisionReason:!technical?'Données de prix insuffisantes.':headlines.status!=='available'?'Analyse des actualités incomplète.':'Scénario expérimental non validé : les nouvelles nécessitent une lecture humaine. Aucune prise de position automatique.',calibration:'non validée en conditions réelles',probability:null});
};
