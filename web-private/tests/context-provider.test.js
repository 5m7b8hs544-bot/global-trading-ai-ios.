'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {buildContext}=require('../lib/context');const {configuration,parseRows,parseQuote,providerData}=require('../lib/provider');const {projectSessions}=require('../lib/forecast');
const now=Date.UTC(2026,8,30,10,30),technical={support:100,resistance:110,atr:2,interval:'1h'};
test('nouvelles : date de détection distincte, pas de lien causal ni confiance inventés',()=>{
 const c=buildContext('XAU/USD',technical,{status:'limited',articles:[{title:'ECB monetary policy',url:'https://ecb.europa.eu/',source:'BCE',publishedAt:new Date(now-1000).toISOString()},{title:'Bitcoin hack',source:'Autre'},{title:'ECB survey on euro banknotes',source:'BCE'}]},now);
 assert.equal(c.observations.length,1);assert.equal(c.observations[0].recent,true);assert.equal(c.confidence,null);assert.equal(c.decision,'attendre');assert.ok(c.blockers.some(b=>b.includes('internationale')));assert.equal(c.plans[0].invalidation,108);
 const detected=buildContext('BTC/USD',null,{status:'available',articles:[{title:'Bitcoin regulation',seenAt:'20260930T100000Z'}]},now);assert.match(detected.observations[0].dateKind,/non vérifiée/);assert.equal(detected.plans.length,0);
});
test('absence de clé ou de contrat exact : aucune requête et aucun actif substitué',async()=>{
 assert.equal(configuration('US100','1h',{TWELVE_DATA_API_KEY:'test'}).ready,false);
 let requests=0;await assert.rejects(providerData('XAU/USD','1h',{},()=>requests++));assert.equal(requests,0);
});
test('les timestamps de bougie ne deviennent pas des timestamps de cotation',()=>{
 const q={symbol:'XAU/USD',currency:'USD',close:'4200',timestamp:now/1000,is_market_open:true};assert.throws(()=>parseQuote(q,'XAU/USD',now),/non horodatée/);
 assert.equal(parseQuote({...q,last_quote_at:now/1000},'XAU/USD',now).price,4200);
 assert.throws(()=>parseQuote({...q,last_quote_at:(now-180000)/1000},'XAU/USD',now));
 assert.throws(()=>parseQuote({...q,last_quote_at:now/1000,is_market_open:false},'XAU/USD',now),/fermé/);
 assert.throws(()=>parseRows({meta:{symbol:'XAU/USD',currency:'EUR'},values:[]},'XAU/USD'));
 const r=parseRows({meta:{symbol:'XAU/USD',currency:'USD'},values:[{datetime:'2026-09-30 09:00:00',low:'4199',high:'4202',open:'4200',close:'4201'}]},'XAU/USD');assert.equal(r[0][0],Date.UTC(2026,8,30,9)/1000);
});
function history(){let time=Math.floor(now/3600000)*3600-400*3600,price=100;const out=[];for(let i=0;i<260;i++){if(i&&i%20===0)time+=4*3600;price*=Math.exp(0.0002+0.003*Math.sin(i));out.push({time,close:price});time+=3600}const offset=Math.floor(now/3600000)*3600-3600-out.at(-1).time;return out.map(c=>({...c,time:c.time+offset}))}
test('marchés à sessions : exclut les sauts de fermeture et sépare sélection et mesure',()=>{
 const candles=history(),f=projectSessions(candles,101,now);assert.equal(f.sessionAware,true);assert.equal(f.backtest.count,60);assert.ok(f.lower<f.central&&f.central<f.upper);
 const changed=candles.map((c,i)=>({...c,close:i>candles.length-50?c.close*1.02:c.close}));assert.equal(projectSessions(changed,101,now).model,f.model);
 assert.throws(()=>projectSessions(candles.slice(-80),101,now));assert.throws(()=>projectSessions(candles,101,now+7200000),/ancien/);
});
