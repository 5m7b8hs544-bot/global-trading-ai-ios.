'use strict';
const instruments={
 'XAU/USD':{symbol:'XAU/USD',label:'Or spot agrégé'},
 'EUR/USD':{symbol:'EUR/USD',label:'EUR/USD agrégé'},
 'AAPL':{symbol:'AAPL',exchange:'NASDAQ',label:'Apple · NASDAQ'},
 'WTI':{symbol:'WTI/USD',label:'WTI spot agrégé · différent du CFD TradingView'}
};
const intervals={'15m':'15min','1h':'1h','4h':'4h'};
function configuration(symbol,interval,env=process.env){
 if(!env.TWELVE_DATA_API_KEY)return {ready:false,reason:'Accès aux données non configuré : une clé fournisseur et les droits sur ce marché sont nécessaires.'};
 if(!instruments[symbol])return {ready:false,reason:'Le contrat exact US100 doit être identifié auprès du fournisseur. Aucun ETF ou indice différent n’est utilisé à sa place.'};
 if(!intervals[interval])return {ready:false,reason:'L’intervalle journalier de ce fournisseur attend la validation de son calendrier et de son fuseau. Utilise 15m, 1h ou 4h.'};
 return {ready:true,instrument:instruments[symbol],interval:intervals[interval]};
}
function parseRows(data,symbol){
 const instrument=instruments[symbol];
 if(!instrument||data?.meta?.symbol!==instrument.symbol||data.meta.currency!=='USD'||!Array.isArray(data.values))throw new Error('Réponse fournisseur incohérente');
 return data.values.map(c=>{
  if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(c.datetime||''))throw new Error('Horodatage fournisseur invalide');
  const time=Date.parse(c.datetime.replace(' ','T')+'Z')/1000;
  const values=[time,...['low','high','open','close'].map(k=>Number(c[k]))];
  if(!values.every(Number.isFinite))throw new Error('Bougie fournisseur invalide');return values;
 });
}
function parseQuote(data,symbol,now=Date.now()){
 const instrument=instruments[symbol];
 if(!instrument||data?.symbol!==instrument.symbol||data.currency!=='USD')throw new Error('Cotation fournisseur incohérente');
 if(data.is_market_open===false)throw new Error('Marché fermé : pas de scénario courant');
 // timestamp is a candle-open timestamp: never use it as a trade timestamp.
 const raw=data.last_quote_at??data.last_update_at;
 const at=typeof raw==='number'?raw*1000:typeof raw==='string'&&/^\d{10}(\.\d+)?$/.test(raw)?Number(raw)*1000:Date.parse(raw);
 const price=Number(data.close);
 if(!Number.isFinite(price)||price<=0||!Number.isFinite(at)||now-at>120000||at>now+60000)throw new Error('Cotation trop ancienne ou non horodatée');
 return {price,time:new Date(at).toISOString()};
}
const {createHash}=require('node:crypto');
const caches=new WeakMap();
async function readProvider(config,env,request,endpoint,params,ttl){
 let cache=caches.get(request);if(!cache){cache=new Map();caches.set(request,cache)}
 const common={symbol:config.instrument.symbol,...(config.instrument.exchange?{exchange:config.instrument.exchange}:{}),apikey:env.TWELVE_DATA_API_KEY};
 const key=createHash('sha256').update(JSON.stringify([common,endpoint,params])).digest('hex');
 const old=cache.get(key);if(old&&Date.now()-old.at<ttl)return old.promise;
 const entry={at:Date.now(),promise:(async()=>{
  const r=await request('https://api.twelvedata.com/'+endpoint+'?'+new URLSearchParams({...common,...params}),{signal:AbortSignal.timeout(9000)});
  if(!r.ok)throw new Error('Accès fournisseur refusé ou indisponible');
  const data=await r.json();if(data.status==='error')throw new Error('Données indisponibles : vérifier la clé, les droits du forfait et le symbole.');
  return data;
 })()};
 cache.set(key,entry);if(cache.size>128)cache.delete(cache.keys().next().value);
 try{return await entry.promise}catch(error){if(cache.get(key)===entry)cache.delete(key);throw error}
}
async function providerData(symbol,interval,env=process.env,request=fetch){
 const config=configuration(symbol,interval,env);if(!config.ready)throw new Error(config.reason);
 const read=(endpoint,params,ttl)=>readProvider(config,env,request,endpoint,params,ttl);
 const hourTask=read('time_series',{interval:'1h',outputsize:'500',timezone:'UTC',order:'asc'},300000);
 const [data,hours,quote]=await Promise.all([config.interval==='1h'?hourTask:read('time_series',{interval:config.interval,outputsize:'500',timezone:'UTC',order:'asc'},300000),hourTask,read('quote',{interval:'1min',timezone:'UTC'},5000)]);
 return {rows:parseRows(data,symbol),hours:parseRows(hours,symbol),ticker:parseQuote(quote,symbol),source:'Twelve Data · '+config.instrument.label,sessionGaps:true};
}
async function providerQuote(symbol,env=process.env,request=fetch){
 const config=configuration(symbol,'1h',env);if(!config.ready)throw new Error(config.reason);
 const data=await readProvider(config,env,request,'quote',{interval:'1min',timezone:'UTC'},5000);
 return {...parseQuote(data,symbol),source:'Twelve Data · '+config.instrument.label};
}
module.exports={configuration,parseRows,parseQuote,providerData,providerQuote};
