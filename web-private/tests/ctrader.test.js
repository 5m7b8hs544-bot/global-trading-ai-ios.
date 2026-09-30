'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {ctraderConfig,trendRows,spotQuote,DataClient,ctraderData}=require('../lib/ctrader');
const {connectionConfig,connectionSummary}=require('../lib/connections');
const env={MARKET_DATA_PROVIDER:'ctrader',CTRADER_CLIENT_ID:'fixture',CTRADER_CLIENT_SECRET:'fixture',CTRADER_ACCESS_TOKEN:'fixture',CTRADER_ACCOUNT_ID:'123',CTRADER_SYMBOLS:JSON.stringify({'XAU/USD':{id:5,name:'XAUUSD'}})};
const config=ctraderConfig('XAU/USD','1h',env);
test('configuration sans substitution et aucun réseau sans autorisation',async()=>{
 assert.equal(config.ready,true);assert.equal(config.url,'wss://demo.ctraderapi.com:5036');
 assert.equal(ctraderConfig('AAPL','1h',env).ready,false);assert.equal(connectionConfig('XAU/USD','1h',env).provider,'cTrader Open API');
 assert.equal(connectionSummary({}).filter(c=>c.status==='authorization_required').length,5);
 await assert.rejects(ctraderData('XAU/USD','1h',{}),/non autorisé/);
 assert.equal(ctraderConfig('XAU/USD','1h',{...env,CTRADER_ENV:'invalid'}).ready,false);
});
test('historique cTrader : échelle 100000, identité et OHLC',()=>{
 const data={ctidTraderAccountId:123,symbolId:5,period:9,trendbar:[{utcTimestampInMinutes:30000000,low:200000000,deltaOpen:100000,deltaHigh:300000,deltaClose:200000}]};
 assert.deepEqual(trendRows(data,config,9)[0],[1800000000,2000,2003,2001,2002]);
 for(const patch of [{symbolId:6},{ctidTraderAccountId:124},{period:7}])assert.throws(()=>trendRows({...data,...patch},config,9));
 assert.throws(()=>trendRows({...data,trendbar:[{...data.trendbar[0],deltaHigh:1}]},config,9));
});
test('bid et ask datés séparément : une moitié ancienne invalide le cours',()=>{
 const now=Date.now(),spot={ctidTraderAccountId:123,symbolId:5,bid:200000000,ask:200200000,bidAt:now,askAt:now};
 assert.equal(spotQuote(spot,config,now).price,2001);assert.equal(spotQuote(spot,config,now).spread,2);
 assert.throws(()=>spotQuote({...spot,askAt:now-121000},config,now));assert.throws(()=>spotQuote({...spot,askAt:undefined},config,now));
 assert.throws(()=>spotQuote({...spot,ask:1},config,now));
});
class Socket extends EventTarget{
 constructor(){super();this.readyState=1;this.sent=[];queueMicrotask(()=>this.dispatchEvent(new Event('open')))}
 send(raw){const m=JSON.parse(raw);this.sent.push(m);let payload={};
  if(m.payloadType===2114)payload={symbol:[{symbolId:5,symbolName:'XAUUSD',enabled:true,quoteAssetId:1}]};
  if(m.payloadType===2112)payload={asset:[{assetId:1,name:'USD'}]};
  queueMicrotask(()=>this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({clientMsgId:m.clientMsgId,payloadType:m.payloadType+1,payload})})));
  if(m.payloadType===2127)queueMicrotask(()=>this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({payloadType:2131,payload:{ctidTraderAccountId:123,symbolId:5,bid:200000000,ask:200200000,timestamp:Date.now()}})})));
 }
 close(){if(this.readyState!==3){this.readyState=3;this.dispatchEvent(new Event('close'))}}
}
test('protocole : auth, contrat USD, abonnement horodaté et interdiction des ordres',async()=>{
 const client=await new DataClient(config,env,Socket).connect();
 try{
  assert.equal((await client.quote(config)).price,2001);
  assert.equal(client.socket.sent.find(m=>m.payloadType===2127).payload.subscribeToSpotTimestamp,true);
  await assert.rejects(client.call(2106,{}),/interdit/);
  assert.throws(()=>client.verify({...config,name:'QQQ'}));
  client.assets[0].name='EUR';assert.throws(()=>client.verify(config));
 }finally{client.fail()}
});
test('une interruption rejette les requêtes pendantes et ferme le client',async()=>{
 const c=await new DataClient(config,env,Socket).connect();
 c.socket.send=()=>{};const pending=c.call(2137,{});c.fail();await assert.rejects(pending,/interrompue/);assert.equal(c.closed,true);
});
test('diagnostic public ne divulgue aucun jeton ni identifiant de compte',()=>{
 const output=JSON.stringify(connectionSummary(env));assert.doesNotMatch(output,/fixture|accessToken|clientSecret|\"123\"/);
 assert.equal(connectionSummary(env).find(c=>c.symbol==='XAU/USD').status,'configured_unverified');
});
