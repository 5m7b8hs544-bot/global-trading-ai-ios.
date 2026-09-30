const {test}=require('node:test');
const assert=require('node:assert/strict');
const {project}=require('../lib/forecast');
const now=Date.UTC(2026,8,30,0,30);
const end=Date.UTC(2026,8,30,0,0)/1000;
const candles=Array.from({length:240},(_,i)=>({time:end-(240-i)*3600,close:1000*Math.exp(i*0.001+Math.sin(i)*0.002)}));
test('cible la fin de l’heure et distingue les trois valeurs',()=>{
 const f=project(candles,1300,now);assert.equal(f.targetAt,'2026-09-30T01:00:00.000Z');assert.ok(f.lower<f.central&&f.central<f.upper);assert.equal(f.remainingMinutes,30);assert.equal(f.backtest.count,60);
});
test('la projection expire avant l’heure suivante',()=>{
 const f=project(candles,1300,Date.UTC(2026,8,30,0,59,40));assert.equal(f.validUntil,'2026-09-30T01:00:00.000Z');
});
test('la sélection du modèle ne lit pas la période de mesure ultérieure',()=>{
 const first=project(candles,1300,now);const changed=candles.map((c,i)=>i>=180?{...c,close:c.close*Math.exp(Math.sin(i)*0.2)}:c);
 assert.equal(project(changed,1300,now).model,first.model);
});
test('bloque les historiques insuffisants et discontinus',()=>{
 assert.throws(()=>project(candles.slice(-180),1300,now),/181/);
 const changed=candles.map(c=>({...c}));changed.at(-10).time+=60;assert.throws(()=>project(changed,1300,now),/incomplet/);
});
