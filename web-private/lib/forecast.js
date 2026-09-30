'use strict';
const average=values=>values.reduce((sum,x)=>sum+x,0)/values.length;
function fit(candles){
 const recent=candles.slice(-61);
 const returns=recent.slice(1).map((c,i)=>Math.log(c.close/recent[i].close));
 const drift=average(returns),variance=returns.reduce((sum,r)=>sum+(r-drift)**2,0)/(returns.length-1);
 if(!Number.isFinite(drift)||!Number.isFinite(variance)||variance<=0)throw new Error('Volatilité horaire non calculable');
 return {drift,sigma:Math.sqrt(variance)};
}
function score(candles,start,end,model){
 let absoluteError=0,inside=0;
 for(let i=start;i<end;i++){
  // Only earlier, closed candles are available to this simulated forecast.
  const fitResult=fit(candles.slice(i-61,i)),anchor=candles[i-1].close;
  const drift=model==='drift'?fitResult.drift:0;
  const central=anchor*Math.exp(drift),width=1.645*fitResult.sigma*Math.sqrt(model==='drift'?1+1/60:1);
  absoluteError+=Math.abs(candles[i].close-central);
  if(candles[i].close>=central*Math.exp(-width)&&candles[i].close<=central*Math.exp(width))inside++;
 }
 return {mae:absoluteError/(end-start),inside,count:end-start};
}
function project(candles,price,now){
 if(candles.length<181)throw new Error('Au moins 181 bougies horaires clôturées sont nécessaires');
 const recent=candles.slice(-181);
 if(recent.some((c,i)=>!Number.isFinite(c.close)||c.close<=0||(i&&c.time-recent[i-1].time!==3600)))throw new Error('Historique horaire incomplet');
 const last=recent.at(-1);
 if(now-(last.time+3600)*1000>3600000)throw new Error('Historique horaire trop ancien');
 if(!Number.isFinite(price)||price<=0)throw new Error('Cours invalide');
 // Select on the preceding 60 hours, then measure on a distinct later 60 hours.
 const selectionEnd=recent.length-60;
 const driftScore=score(recent,61,selectionEnd,'drift'),naiveScore=score(recent,61,selectionEnd,'naive');
 const model=driftScore.mae<naiveScore.mae?'drift':'naive';
 const test=score(recent,selectionEnd,recent.length,model),benchmark=score(recent,selectionEnd,recent.length,'naive');
 const {drift,sigma}=fit(recent);
 const target=Math.floor(now/3600000)*3600000+3600000,remaining=(target-now)/3600000;
 const central=price*Math.exp((model==='drift'?drift:0)*remaining);
 const width=1.645*sigma*Math.sqrt(remaining*(model==='drift'?1+remaining/60:1));
 const lower=central*Math.exp(-width),upper=central*Math.exp(width);
 if(![central,lower,upper].every(x=>Number.isFinite(x)&&x>0))throw new Error('Projection non calculable');
 return {central,lower,upper,targetAt:new Date(target).toISOString(),computedAt:new Date(now).toISOString(),validUntil:new Date(Math.min(target,now+60000)).toISOString(),model,remainingMinutes:remaining*60,backtest:{...test,benchmarkMae:benchmark.mae,from:new Date(recent[selectionEnd].time*1000).toISOString(),to:new Date((last.time+3600)*1000).toISOString()},note:'Projection statistique du cours à la fin de l’heure, pas des extrêmes atteints pendant l’heure. Hypothèses de variations stables et indépendantes ; mise à l’échelle intrahoraire non validée. Les actualités ne sont pas intégrées au prix projeté. Aucune garantie ni probabilité future validée.'};
}
module.exports={project};
// Session markets: skip returns that cross closures; do not fabricate missing bars.
function fitSessions(candles){
 const returns=candles.slice(1).flatMap((c,i)=>c.time-candles[i].time===3600?[Math.log(c.close/candles[i].close)]:[]).slice(-60);
 if(returns.length<60)throw new Error('60 variations horaires sans interruption requises');
 const drift=average(returns),variance=returns.reduce((sum,r)=>sum+(r-drift)**2,0)/59;
 if(!Number.isFinite(variance)||variance<=0)throw new Error('Volatilité horaire non calculable');return {drift,sigma:Math.sqrt(variance)};
}
function projectSessions(candles,price,now){
 if(candles.some((c,i)=>!Number.isFinite(c.close)||c.close<=0||!Number.isFinite(c.time)||(i&&c.time<=candles[i-1].time)))throw new Error('Historique horaire invalide');
 const trials=[];
 for(let i=61;i<candles.length;i++){
  if(candles[i].time-candles[i-1].time!==3600)continue;
  let fitResult;try{fitResult=fitSessions(candles.slice(0,i))}catch{continue}
  trials.push({i,...fitResult,anchor:candles[i-1].close,actual:candles[i].close});
 }
 if(trials.length<120)throw new Error('120 cibles horaires sans interruption requises après apprentissage');
 const recent=trials.slice(-120),selection=recent.slice(0,60),test=recent.slice(60);
 function measure(rows,model){let error=0,inside=0;for(const t of rows){const central=t.anchor*Math.exp(model==='drift'?t.drift:0),width=1.645*t.sigma*Math.sqrt(model==='drift'?1+1/60:1);error+=Math.abs(t.actual-central);if(t.actual>=central*Math.exp(-width)&&t.actual<=central*Math.exp(width))inside++}return {mae:error/rows.length,inside,count:rows.length}}
 const model=measure(selection,'drift').mae<measure(selection,'naive').mae?'drift':'naive';
 const last=candles.at(-1);if(!last||now-(last.time+3600)*1000>3600000||now<(last.time+3600)*1000)throw new Error('Historique horaire trop ancien');
 if(!Number.isFinite(price)||price<=0)throw new Error('Cours invalide');
 const {drift,sigma}=fitSessions(candles),target=Math.floor(now/3600000)*3600000+3600000,remaining=(target-now)/3600000;
 const central=price*Math.exp((model==='drift'?drift:0)*remaining),width=1.645*sigma*Math.sqrt(remaining*(model==='drift'?1+remaining/60:1));
 const lower=central*Math.exp(-width),upper=central*Math.exp(width);if(![central,lower,upper].every(x=>Number.isFinite(x)&&x>0))throw new Error('Projection non calculable');
 return {central,lower,upper,targetAt:new Date(target).toISOString(),computedAt:new Date(now).toISOString(),validUntil:new Date(Math.min(target,now+60000)).toISOString(),model,remainingMinutes:remaining*60,sessionAware:true,backtest:{...measure(test,model),benchmarkMae:measure(test,'naive').mae,from:new Date(candles[test[0].i].time*1000).toISOString(),to:new Date((last.time+3600)*1000).toISOString()},note:'Projection expérimentale hors interruptions d’historique : seules les transitions entre deux bougies séparées exactement d’une heure sont utilisées. Les 60 cibles de sélection précèdent 60 cibles de mesure distinctes. Les sauts entre périodes manquantes sont exclus ; fermetures et données manquantes ne sont pas distinguées ; le calendrier des fermetures à venir n’est pas intégré. Aucun effet chiffré des nouvelles, aucune garantie ni probabilité future validée.'};
}
module.exports.projectSessions=projectSessions;
