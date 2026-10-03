'use strict';
const resolutions={'15m':'MINUTE_15','1h':'HOUR','4h':'HOUR_4'};
const {createHash}=require('node:crypto');
const sessions=new Map();
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
function capitalConfig(interval,env=process.env){
 if(!resolutions[interval])return {ready:false,reason:'US100 : sélectionner 15m, 1h ou 4h ; calendrier journalier non validé.'};
 if(!env.CAPITAL_API_KEY||!env.CAPITAL_IDENTIFIER||!env.CAPITAL_API_PASSWORD)return {ready:false,reason:'US100 identifié : CFD US Tech 100 de Capital.com. Accès API Capital.com non configuré.'};
 if(env.CAPITAL_API_ENV&&!['demo','live'].includes(env.CAPITAL_API_ENV))return {ready:false,reason:'Environnement Capital.com invalide.'};
 return {ready:true,base:env.CAPITAL_API_ENV==='live'?'https://api-capital.backend-capital.com':'https://demo-api-capital.backend-capital.com',mode:env.CAPITAL_API_ENV==='live'?'réel':'démo',resolution:resolutions[interval]};
}
function midpoint(p){const bid=Number(p?.bid),ask=Number(p?.ask);if(!Number.isFinite(bid)||!Number.isFinite(ask)||bid<=0||ask<bid)throw new Error('Bid/ask Capital.com incohérent');return (bid+ask)/2}
function capitalRows(data){
 if(!Array.isArray(data?.prices))throw new Error('Historique Capital.com absent');
 return data.prices.map(c=>{
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/.test(c.snapshotTimeUTC||''))throw new Error('Horodatage Capital.com absent');
  const time=Date.parse(c.snapshotTimeUTC.endsWith('Z')?c.snapshotTimeUTC:c.snapshotTimeUTC+'Z')/1000;
  return [time,midpoint(c.lowPrice),midpoint(c.highPrice),midpoint(c.openPrice),midpoint(c.closePrice)];
 });
}
function capitalQuote(data,now=Date.now()){
 const m=data?.markets?.find(m=>m.epic==='US100');if(!m||m.instrumentType!=='INDICES')throw new Error('Contrat exact US100 absent');
 if(m.marketStatus!=='TRADEABLE'||m.delayTime!==0)throw new CapitalAccessError('Capital.com : marché US100 fermé ou données différées ; aucun scénario courant.');
 const raw=m.updateTimeUTC;if(typeof raw!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(raw))throw new Error('Timestamp US100 absent');
 const at=Date.parse(raw.endsWith('Z')?raw:raw+'Z');
 if(!Number.isFinite(at)||now-at>120000||at>now+60000)throw new Error('US100 : cours ancien');
 return {price:midpoint({bid:m.bid,ask:m.offer}),time:new Date(at).toISOString()};
}
async function capitalReader(interval,env,request){
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
async function capitalLatestQuote(env=process.env,request=fetch){
 const {read,config}=await capitalReader('1h',env,request);
 return {...capitalQuote(await read('markets?epics=US100')),source:'Capital.com '+config.mode+' · US100 CFD · milieu bid/ask'};
}
async function capitalData(interval,env=process.env,request=fetch){
 const {read,config}=await capitalReader(interval,env,request);
 const hourTask=read('prices/US100?resolution=HOUR&max=500');
 const [rows,hours,market]=await Promise.all([config.resolution==='HOUR'?hourTask:read('prices/US100?resolution='+config.resolution+'&max=500'),hourTask,read('markets?epics=US100')]);
 return {rows:capitalRows(rows),hours:capitalRows(hours),ticker:capitalQuote(market),source:'Capital.com '+config.mode+' · US100 CFD · milieu bid/ask',sessionGaps:true};
}
module.exports={CapitalAccessError,capitalConfig,capitalRows,capitalQuote,capitalData,capitalLatestQuote};
