'use strict';
const resolutions={'15m':'MINUTE_15','1h':'HOUR','4h':'HOUR_4'};
const {createHash}=require('node:crypto');
const sessions=new Map();
const contracts=Object.freeze({'US100':{epic:'US100',type:'INDICES'},'XAU/USD':{epic:'GOLD',type:'COMMODITIES'},'EUR/USD':{epic:'EURUSD',type:'CURRENCIES'},'WTI':{epic:'OIL_CRUDE',type:'COMMODITIES'},'AAPL':{epic:'AAPL',type:'SHARES'}});
function contract(symbol){const c=contracts[symbol];if(!c)throw new CapitalAccessError('Instrument Capital.com non pris en charge.');return c}
class CapitalAccessError extends Error {}
async function accessError(response,mode,stage){
 let code='';try{code=(await response.json()).errorCode}catch{}
 const known={
 'error.invalid.api.key':'clé API refusée',
 'error.invalid.details':'identifiant ou mot de passe API refusé',
 'error.invalid.password':'mot de passe API refusé',
 'error.security.invalid-details':'identifiant ou mot de passe API refusé',
 'error.security.api-key-invalid':'clé API refusée',
 'error.security.api-key-disabled':'clé API désactivée',
 'error.security.api-key-expired':'clé API expirée',
 'error.too-many.requests':'trop de requêtes, réessayer plus tard'
 };
 const status=Number.isInteger(response.status)?response.status:0;
 return new CapitalAccessError('Capital.com '+mode+' : '+stage+' — '+(known[code]||('accès indisponible (HTTP '+status+')'))+'.');
}

function sessionKey(config,env){return createHash('sha256').update(JSON.stringify([config.base,env.CAPITAL_API_KEY,env.CAPITAL_IDENTIFIER,env.CAPITAL_API_PASSWORD])).digest('hex')}
function capitalConfig(interval,env=process.env,symbol='US100'){
 if(!contracts[symbol])return {ready:false,reason:'Instrument Capital.com non pris en charge.'};
 if(!resolutions[interval])return {ready:false,reason:'Capital.com : sélectionner 15m, 1h ou 4h ; calendrier journalier non validé.'};
 if(!env.CAPITAL_API_KEY||!env.CAPITAL_IDENTIFIER||!env.CAPITAL_API_PASSWORD)return {ready:false,reason:'Accès API Capital.com non configuré.'};
 if(env.CAPITAL_API_ENV&&!['demo','live'].includes(env.CAPITAL_API_ENV))return {ready:false,reason:'Environnement Capital.com invalide.'};
 return {ready:true,base:env.CAPITAL_API_ENV==='live'?'https://api-capital.backend-capital.com':'https://demo-api-capital.backend-capital.com',mode:env.CAPITAL_API_ENV==='live'?'réel':'démo',resolution:resolutions[interval]};
}
function midpoint(p){const bid=Number(p?.bid),ask=Number(p?.ask);if(!Number.isFinite(bid)||!Number.isFinite(ask)||bid<=0||ask<bid)throw new CapitalAccessError('Bid/ask Capital.com incohérent');return (bid+ask)/2}
function capitalRows(data){
 if(!Array.isArray(data?.prices))throw new CapitalAccessError('Historique Capital.com absent');
 return data.prices.map(c=>{
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/.test(c.snapshotTimeUTC||''))throw new CapitalAccessError('Horodatage Capital.com absent');
  const time=Date.parse(c.snapshotTimeUTC.endsWith('Z')?c.snapshotTimeUTC:c.snapshotTimeUTC+'Z')/1000;
  return [time,...['lowPrice','highPrice','openPrice','closePrice'].map(field=>{try{return midpoint(c[field])}catch{const p=c[field],bid=Number(p?.bid),ask=Number(p?.ask);const reason=!p||p.bid==null||p.ask==null?'prix manquant':!Number.isFinite(bid)||!Number.isFinite(ask)?'prix non numérique':bid<=0||ask<=0?'prix nul ou négatif':'ask inférieur au bid';throw new CapitalAccessError('Historique Capital.com : '+field+' — '+reason+' ('+new Date(time*1000).toISOString()+').')}})];
 });
}
// Keep only the valid suffix after the last corrupt candle. Never bridge a
// discarded observation, interpolate prices, or change the bid/ask spread.
function capitalHistory(data){
 if(!Array.isArray(data?.prices)||!data.prices.length)throw new CapitalAccessError('Historique Capital.com absent');
 const ordered=data.prices.map(c=>{
  const raw=c.snapshotTimeUTC;
  if(typeof raw!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/.test(raw))throw new CapitalAccessError('Horodatage Capital.com absent');
  const time=Date.parse(raw.endsWith('Z')?raw:raw+'Z');
  if(!Number.isFinite(time))throw new CapitalAccessError('Horodatage Capital.com invalide');
  return {c,time};
 }).sort((a,b)=>a.time-b.time);
 let rows=[],discarded=0,invalid=0;
 for(let i=0;i<ordered.length;i++){
  if(i&&ordered[i].time===ordered[i-1].time)throw new CapitalAccessError('Historique Capital.com : horodatage dupliqué');
  try{
   const row=capitalRows({prices:[ordered[i].c]})[0];
   const [,low,high,open,close]=row;
   if(low>high||open<low||open>high||close<low||close>high)throw new CapitalAccessError('OHLC Capital.com incohérent');
   rows.push(row);
  }catch(error){
   if(!(error instanceof CapitalAccessError))throw error;
   rows=[];discarded=i+1;invalid++;
  }
 }
 if(!rows.length)throw new CapitalAccessError('Historique Capital.com : dernière bougie invalide ; calcul bloqué.');
 return {rows,discarded,invalid};
}
function capitalQuote(data,now=Date.now(),symbol='US100'){
 const expected=contract(symbol);
 const m=data?.instrument&&data?.snapshot?{...data.snapshot,epic:data.instrument.epic,instrumentType:data.instrument.type}:data?.markets?.find(m=>m.epic===expected.epic);if(!m||m.epic!==expected.epic||m.instrumentType!==expected.type)throw new CapitalAccessError('Capital.com : contrat exact '+symbol+' absent ou type incohérent.');
 if(data.instrument&&data.instrument.currency!=='USD')throw new CapitalAccessError('Capital.com : devise du contrat non validée en USD.');
 if(m.marketStatus!=='TRADEABLE')throw new CapitalAccessError('Capital.com connecté · '+symbol+' : marché fermé ou non négociable ; aucun scénario courant.');
 if(m.delayTime!==0)throw new CapitalAccessError('Capital.com connecté · '+symbol+' : données différées ou délai non renseigné ; aucun scénario courant.');
 const raw=m.updateTimeUTC;if(typeof raw!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(raw))throw new CapitalAccessError('Horodatage Capital.com absent');
 const at=Date.parse(raw.endsWith('Z')?raw:raw+'Z');
 if(!Number.isFinite(at)||now-at>120000||at>now+60000)throw new CapitalAccessError('Capital.com : cours ancien');
 return {price:midpoint({bid:m.bid,ask:m.offer}),time:new Date(at).toISOString()};
}
async function capitalReader(interval,env,request){
 const transport=request;
 request=async(url,options)=>{try{return await transport(url,options)}catch{throw new CapitalAccessError('Capital.com : '+(url.endsWith('/session')?'connexion':'lecture des données')+' — serveur injoignable ou délai dépassé.')}};
 const config=capitalConfig(interval,env);if(!config.ready)throw new Error(config.reason);
 const key=sessionKey(config,env);
 let pending=sessions.get(key);
 if(!pending||Date.now()-pending.at>480000){
  pending={at:Date.now(),value:(async()=>{
  const r=await request(config.base+'/api/v1/session',{method:'POST',headers:{'X-CAP-API-KEY':env.CAPITAL_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({identifier:env.CAPITAL_IDENTIFIER,password:env.CAPITAL_API_PASSWORD,encryptedPassword:false}),signal:AbortSignal.timeout(9000)});
  const cst=r.headers.get('CST'),token=r.headers.get('X-SECURITY-TOKEN');if(!r.ok)throw await accessError(r,config.mode,'connexion');if(!cst||!token)throw new CapitalAccessError('Capital.com : réponse de connexion incomplète.');
  return {cst,token};
  })()};
  sessions.set(key,pending);
  if(sessions.size>16)sessions.delete(sessions.keys().next().value);
 }
 let session;try{session=await pending.value}catch(error){if(sessions.get(key)===pending)sessions.delete(key);throw error}
 async function read(path){
  const r=await request(config.base+'/api/v1/'+path,{headers:{CST:session.cst,'X-SECURITY-TOKEN':session.token},signal:AbortSignal.timeout(9000)});
  if(r.status===401&&sessions.get(key)===pending)sessions.delete(key);if(!r.ok)throw await accessError(r,config.mode,'lecture des prix');return r.json();
 }
 return {read,config};
}
// The single-market snapshot documents updateTime, not updateTimeUTC.
// Fetch a complete timestamped quote instead of guessing a timezone or pairing
// a fresh timestamp with prices from another response.
async function timestampedQuote(market,read,symbol){
 try{return capitalQuote(market,Date.now(),symbol)}catch(error){
  if(!(error instanceof CapitalAccessError)||error.message!=='Horodatage Capital.com absent')throw error;
  if(market?.snapshot?.updateTimeUTC!=null)throw error;
  const c=contract(symbol);
  return capitalQuote(await read('markets?searchTerm='+encodeURIComponent(c.epic)),Date.now(),symbol);
 }
}
async function capitalLatestQuote(env=process.env,request=fetch,symbol='US100'){
 const c=contract(symbol);
 const {read,config}=await capitalReader('1h',env,request);
 return {...await timestampedQuote(await read('markets/'+c.epic),read,symbol),source:'Capital.com '+config.mode+' · '+c.epic+' CFD · milieu bid/ask'};
}
async function capitalData(interval,env=process.env,request=fetch,symbol='US100'){
 const c=contract(symbol);
 const {read,config}=await capitalReader(interval,env,request);
 const hourTask=read('prices/'+c.epic+'?resolution=HOUR&max=500');
 const [rows,hours,market]=await Promise.all([config.resolution==='HOUR'?hourTask:read('prices/'+c.epic+'?resolution='+config.resolution+'&max=500'),hourTask,read('markets/'+c.epic)]);
 const selected=capitalHistory(rows),hourly=rows===hours?selected:capitalHistory(hours);
 const quality='Historique validé : '+hourly.rows.length+' bougies horaires'+(hourly.discarded?' ; '+hourly.discarded+' bougies écartées jusqu’à la dernière anomalie':'')+'.';
 let ticker;try{ticker=await timestampedQuote(market,read,symbol)}catch(error){if(error instanceof CapitalAccessError)throw new CapitalAccessError(error.message+' '+quality);throw error}
 return {rows:selected.rows,hours:hourly.rows,ticker,source:'Capital.com '+config.mode+' · '+c.epic+' CFD · milieu bid/ask'+(selected.discarded||hourly.discarded?' · historique tronqué après anomalie ('+selected.discarded+' / '+hourly.discarded+' bougies écartées)':''),sessionGaps:true};
}
module.exports={contracts,CapitalAccessError,capitalConfig,capitalRows,capitalHistory,capitalQuote,capitalData,capitalLatestQuote};
