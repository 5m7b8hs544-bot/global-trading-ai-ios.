'use strict';
// Data-only Open API adapter. No trading message is permitted.
const periods={'15m':7,'1h':9,'4h':10},steps={'15m':900,'1h':3600,'4h':14400};
const supported=['XAU/USD','EUR/USD','US100','WTI','AAPL'];
function ctraderConfig(symbol,interval,env=process.env){
 if(!supported.includes(symbol)||!periods[interval])return {ready:false,reason:'cTrader : marché ou intervalle non pris en charge.'};
 const required=['CTRADER_CLIENT_ID','CTRADER_CLIENT_SECRET','CTRADER_ACCESS_TOKEN','CTRADER_ACCOUNT_ID','CTRADER_SYMBOLS'];
 if(required.some(k=>!env[k]))return {ready:false,reason:'cTrader non autorisé : compte cTrader, application approuvée et autorisation de lecture nécessaires. Un compte MT5 ne suffit pas.'};
 if(env.CTRADER_ENV&&!['demo','live'].includes(env.CTRADER_ENV))return {ready:false,reason:'Environnement cTrader invalide.'};
 let mapping;try{mapping=JSON.parse(env.CTRADER_SYMBOLS)[symbol]}catch{}
 const account=Number(env.CTRADER_ACCOUNT_ID),id=Number(mapping?.id);
 if(!Number.isSafeInteger(account)||account<=0||!Number.isSafeInteger(id)||id<=0||typeof mapping?.name!=='string'||!mapping.name.trim())return {ready:false,reason:'cTrader : correspondance du contrat exact absente ou invalide.'};
 return {ready:true,account,id,name:mapping.name,mode:env.CTRADER_ENV==='live'?'réel':'démo',url:'wss://'+(env.CTRADER_ENV==='live'?'live':'demo')+'.ctraderapi.com:5036',period:periods[interval]};
}
function trendRows(data,config,period){
 if(Number(data.ctidTraderAccountId)!==config.account||data.symbolId!==undefined&&Number(data.symbolId)!==config.id||Number(data.period)!==period||!Array.isArray(data.trendbar))throw new Error('Historique cTrader incohérent');
 return data.trendbar.map(c=>{
  const low=Number(c.low),deltas=['deltaOpen','deltaClose','deltaHigh'].map(k=>Number(c[k]??0)),minutes=Number(c.utcTimestampInMinutes);
  if(!Number.isSafeInteger(low)||low<=0||!Number.isInteger(minutes)||minutes<=0||deltas.some(n=>!Number.isSafeInteger(n)||n<0)||deltas[2]<Math.max(deltas[0],deltas[1]))throw new Error('Bougie cTrader invalide');
  return [minutes*60,low/1e5,(low+deltas[2])/1e5,(low+deltas[0])/1e5,(low+deltas[1])/1e5];
 });
}
function spotQuote(spot,config,now=Date.now()){
 if(Number(spot.ctidTraderAccountId)!==config.account||Number(spot.symbolId)!==config.id)throw new Error('Cotation cTrader incohérente');
 const bid=Number(spot.bid)/1e5,ask=Number(spot.ask)/1e5,at=Math.min(Number(spot.bidAt),Number(spot.askAt));
 if(!Number.isFinite(bid)||!Number.isFinite(ask)||bid<=0||ask<bid||!Number.isFinite(at)||now-at>120000||at>now+60000)throw new Error('Cotation cTrader absente ou ancienne');
 return {price:(bid+ask)/2,bid,ask,spread:ask-bid,time:new Date(at).toISOString()};
}
class DataClient{
 constructor(config,env,Socket=WebSocket){this.config=config;this.env=env;this.Socket=Socket;this.pending=new Map();this.spots=new Map();this.serial=0;this.closed=false;this.history=new Map();this.subscribed=new Set()}
 async connect(){
  const socket=this.socket=new this.Socket(this.config.url);
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{socket.close();reject(new Error('Connexion cTrader expirée'))},9000);
   socket.addEventListener('open',()=>{clearTimeout(timer);resolve()},{once:true});
   socket.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('Connexion cTrader indisponible'))},{once:true});
   socket.addEventListener('close',()=>{clearTimeout(timer);reject(new Error('Connexion cTrader fermée'))},{once:true});
  });
  socket.addEventListener('message',event=>this.receive(event.data));
  socket.addEventListener('close',()=>this.fail());socket.addEventListener('error',()=>this.fail());
  await this.call(2100,{clientId:this.env.CTRADER_CLIENT_ID,clientSecret:this.env.CTRADER_CLIENT_SECRET});
  await this.call(2102,{ctidTraderAccountId:this.config.account,accessToken:this.env.CTRADER_ACCESS_TOKEN});
  this.heartbeat=setInterval(()=>{if(!this.closed&&socket.readyState===1)socket.send(JSON.stringify({payloadType:51,payload:{}}))},10000);this.heartbeat.unref?.();
  const [symbols,assets]=await Promise.all([this.call(2114,{ctidTraderAccountId:this.config.account,includeArchivedSymbols:false}),this.call(2112,{ctidTraderAccountId:this.config.account})]);
  this.symbols=symbols.symbol||[];this.assets=assets.asset||[];
  return this;
 }
 receive(raw){
  let m;try{m=JSON.parse(String(raw))}catch{return}
  const p=m.payload||{};
  if([2147,2148,2164].includes(m.payloadType)){this.fail();return}
  if(m.payloadType===2131&&Number(p.ctidTraderAccountId)===this.config.account){
   const at=Number(p.timestamp),old=this.spots.get(Number(p.symbolId))||{};
   if(Number.isFinite(at)&&at<=Date.now()+60000){
    for(const k of ['bid','ask'])if(p[k]!==undefined&&(!old[k+'At']||at>=old[k+'At'])){old[k]=p[k];old[k+'At']=at}
    this.spots.set(Number(p.symbolId),{...old,ctidTraderAccountId:p.ctidTraderAccountId,symbolId:p.symbolId});
   }
  }
  const pending=this.pending.get(m.clientMsgId);if(!pending)return;
  if(m.payloadType===2142||m.payloadType===50){pending.reject(new Error('Autorisation ou données cTrader refusées'))}
  else if(m.payloadType===pending.expected)pending.resolve(p);else pending.reject(new Error('Réponse cTrader inattendue'));
  clearTimeout(pending.timer);this.pending.delete(m.clientMsgId);
 }
 call(type,payload){
  if(![2100,2102,2112,2114,2127,2137].includes(type))return Promise.reject(new Error('Message interdit : accès données uniquement'));
  if(this.closed||this.socket.readyState!==1)return Promise.reject(new Error('Connexion cTrader fermée'));
  const clientMsgId=String(++this.serial);
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{this.pending.delete(clientMsgId);reject(new Error('Réponse cTrader expirée'))},9000);
   this.pending.set(clientMsgId,{resolve,reject,timer,expected:type+1});
   this.socket.send(JSON.stringify({clientMsgId,payloadType:type,payload}));
  });
 }
 fail(){this.closed=true;clearInterval(this.heartbeat);for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('Connexion cTrader interrompue'))}this.pending.clear();this.socket?.close()}
 verify(config){
  const m=this.symbols.find(s=>Number(s.symbolId)===config.id),usd=this.assets.find(a=>Number(a.assetId)===Number(m?.quoteAssetId));
  if(!m||m.symbolName!==config.name||m.enabled!==true||usd?.name!=='USD')throw new Error('Contrat cTrader ou devise non vérifié');
 }
 async quote(config){
  this.verify(config);
  if(!this.subscribed.has(config.id)){await this.call(2127,{ctidTraderAccountId:config.account,symbolId:[config.id],subscribeToSpotTimestamp:true});this.subscribed.add(config.id)}
  const deadline=Date.now()+4000;
  while(Date.now()<deadline){try{return spotQuote(this.spots.get(config.id)||{},config)}catch{}await new Promise(r=>setTimeout(r,100))}
  throw new Error('Cotation cTrader absente ou ancienne');
 }
 async rows(config,period,step){
  const key=config.id+':'+period,old=this.history.get(key);if(old&&Date.now()-old.at<300000)return old.rows;
  const wait=Math.max(0,250-(Date.now()-(this.lastHistoricalAt||0)));if(wait)await new Promise(r=>setTimeout(r,wait));this.lastHistoricalAt=Date.now();
  const data=await this.call(2137,{ctidTraderAccountId:config.account,symbolId:config.id,period,count:500,fromTimestamp:Date.now()-step*1000*1000,toTimestamp:Date.now()});
  const rows=trendRows(data,config,period);this.history.set(key,{at:Date.now(),rows});return rows;
 }
}
let shared=null,sharedKey=null;
async function clientFor(config,env){
 const key=JSON.stringify([config.url,config.account,env.CTRADER_CLIENT_ID,env.CTRADER_CLIENT_SECRET,env.CTRADER_ACCESS_TOKEN]);
 if(sharedKey!==key){if(shared)try{(await shared).fail()}catch{}shared=null;sharedKey=key}
 if(shared)try{const client=await shared;if(!client.closed)return client}catch{}
 const client=new DataClient(config,env);shared=client.connect().catch(e=>{client.fail();shared=null;throw e});return shared;
}
async function ctraderQuote(symbol,env=process.env){const config=ctraderConfig(symbol,'1h',env);if(!config.ready)throw new Error(config.reason);const client=await clientFor(config,env);return {...await client.quote(config),source:'cTrader '+config.mode+' · '+config.name+' · milieu bid/ask'};}
async function ctraderData(symbol,interval,env=process.env){
 const config=ctraderConfig(symbol,interval,env);if(!config.ready)throw new Error(config.reason);const client=await clientFor(config,env);client.verify(config);
 // Sequential historical requests remain below the API's five-per-second limit.
 const hours=await client.rows(config,9,3600),rows=config.period===9?hours:await client.rows(config,config.period,steps[interval]);
 const ticker=await client.quote(config);
 return {hours,rows,ticker,source:'cTrader '+config.mode+' · '+config.name+' · cotation milieu bid/ask ; bougies fournisseur',sessionGaps:true};
}
module.exports={ctraderConfig,trendRows,spotQuote,DataClient,ctraderData,ctraderQuote};
