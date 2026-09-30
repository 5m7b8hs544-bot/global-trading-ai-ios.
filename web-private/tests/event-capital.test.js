'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {eventStudy}=require('../lib/event-study');
const {capitalConfig,capitalRows,capitalQuote,capitalData}=require('../lib/capital');
const start=Date.UTC(2026,8,28)/1000,series=Array.from({length:80},(_,i)=>({time:start+i*3600,close:100+i}));
const event={title:'Monetary policy',url:'https://example.org',source:'Test',dateKind:'publication déclarée',datedAt:new Date((start+40*3600)*1000).toISOString()};
test('mesures à +1h/+4h avec référence exclusivement antérieure',()=>{
 const s=eventStudy(series,[event],(start+80*3600)*1000);
 assert.equal(s.records.length,2);assert.equal(s.causalEffect,null);
 assert.equal(s.records[0].before,139);assert.equal(s.records[0].after,140);
 assert.ok(Math.abs(s.records[0].observedPercent-(140/139-1)*100)<1e-9);
 const altered=series.map((c,i)=>({...c,close:i>=40?c.close*2:c.close}));
 assert.equal(eventStudy(altered,[event],(start+80*3600)*1000).records[0].referencePercent,s.records[0].referencePercent);
});
test('aucun regard futur, aucune mesure à travers un trou ou une date de détection',()=>{
 assert.equal(eventStudy(series,[event],(start+40.5*3600)*1000).records.length,0);
 assert.equal(eventStudy(series.filter((_,i)=>i!==40),[event],(start+80*3600)*1000).records.length,0);
 assert.equal(eventStudy(series,[{...event,dateKind:'détection, publication non vérifiée'}],(start+80*3600)*1000).records.length,0);
 const fractional={...event,datedAt:new Date((start+40.5*3600)*1000).toISOString()};
 const r=eventStudy(series,[fractional],(start+80*3600)*1000).records[0];assert.equal(r.actualWindowHours,2);assert.equal(r.after,141);
});
test('aucun accès Capital.com sans configuration; démo distincte du réel',async()=>{
 let calls=0;await assert.rejects(capitalData('1h',{},()=>{calls++}));assert.equal(calls,0);
 const env={CAPITAL_API_KEY:'fixture',CAPITAL_IDENTIFIER:'fixture',CAPITAL_API_PASSWORD:'fixture'};
 assert.equal(capitalConfig('1h',env).mode,'démo');assert.equal(capitalConfig('1h',{...env,CAPITAL_API_ENV:'live'}).mode,'réel');assert.equal(capitalConfig('1D',env).ready,false);
});
test('US100 exact, fraîcheur, absence de délai, bid/ask et UTC requis',()=>{
 const now=Date.UTC(2026,8,30,4,30),m={epic:'US100',instrumentType:'INDICES',marketStatus:'TRADEABLE',delayTime:0,updateTimeUTC:'2026-09-30T04:30:00',bid:25000,offer:25002};
 assert.equal(capitalQuote({markets:[m]},now).price,25001);
 for(const patch of [{epic:'QQQ'},{marketStatus:'CLOSED'},{delayTime:15},{updateTimeUTC:'04:30:00'},{offer:24999}])assert.throws(()=>capitalQuote({markets:[{...m,...patch}]},now));
 assert.throws(()=>capitalQuote({markets:[m]},now+180000));
 const price={bid:100,ask:102};const row=capitalRows({prices:[{snapshotTimeUTC:'2026-09-30T04:00:00',openPrice:price,lowPrice:price,highPrice:price,closePrice:price}]})[0];assert.equal(row[0],Date.UTC(2026,8,30,4)/1000);assert.equal(row[4],101);
});
test('annonces répétées dédoublonnées et fenêtres chevauchantes isolées de la synthèse',()=>{
 const event2={...event,url:'https://example.org/2',datedAt:new Date((start+40.5*3600)*1000).toISOString(),topics:['Taux']};
 const s=eventStudy(series,[event,event,event2],(start+80*3600)*1000);
 assert.equal(s.duplicatesIgnored,1);assert.equal(s.records.length,4);assert.ok(s.records.every(r=>r.overlapping));
 assert.ok(s.summaries.every(r=>r.isolatedCount===0&&r.forecastAdjustment===null&&r.isolatedExcessMedian===null));
 assert.ok(s.byTopic.every(r=>r.predictiveEffect===null&&r.status==='insufficient'));
});
