'use strict';
const average=a=>a.reduce((s,x)=>s+x,0)/a.length;
function eventStudy(candles,observations,now=Date.now()){
 const records=[],excluded=[];
 const series=[...candles].filter(c=>Number.isFinite(c.time)&&Number.isFinite(c.close)&&c.close>0&&(c.time+3600)*1000<=now).sort((a,b)=>a.time-b.time);
 const unique=[],seen=new Set();
 for(const event of observations){const key=(event.url||event.title)+':'+event.datedAt;if(!seen.has(key)){seen.add(key);unique.push(event)}}
 for(const event of unique){
  if(event.dateKind!=='publication déclarée'||!event.datedAt){excluded.push({title:event.title,reason:'Heure de publication non vérifiée : date de détection inutilisable pour cette mesure'});continue}
  const at=Date.parse(event.datedAt);if(!Number.isFinite(at)||at>now){excluded.push({title:event.title,reason:'Publication future ou invalide'});continue}
  const preIndex=series.findLastIndex(c=>(c.time+3600)*1000<=at),pre=series[preIndex];
  if(!pre||at-(pre.time+3600)*1000>=3600000){excluded.push({title:event.title,reason:'Clôture avant publication absente ou trop éloignée'});continue}
  for(const horizon of [1,4]){
   const target=at+horizon*3600000,index=series.findIndex(c=>(c.time+3600)*1000>=target),post=series[index];
   if(!post||index<=preIndex){excluded.push({title:event.title,horizon,reason:'Fenêtre après publication pas encore clôturée ou hors historique'});continue}
   const window=series.slice(preIndex,index+1);
   if(window.some((c,i)=>i&&c.time-window[i-1].time!==3600)){excluded.push({title:event.title,horizon,reason:'Interruption entre les clôtures mesurées'});continue}
   const end=(post.time+3600)*1000,start=(pre.time+3600)*1000;
   if(end-target>=3600000){excluded.push({title:event.title,horizon,reason:'Clôture après publication trop éloignée'});continue}
   const observed=(post.close/pre.close-1)*100,before=series.slice(Math.max(0,preIndex-24),preIndex+1);
   let reference=null,standardizedMove=null;
   if(before.length===25&&before.every((c,i)=>!i||c.time-before[i-1].time===3600)){
    const returns=before.slice(1).map((c,i)=>Math.log(c.close/before[i].close));
    const mean=average(returns),variance=returns.reduce((sum,r)=>sum+(r-mean)**2,0)/(returns.length-1),duration=(end-start)/3600000;
    reference=(Math.exp(mean*duration)-1)*100;
    if(variance>0)standardizedMove=(Math.log(post.close/pre.close)-mean*duration)/Math.sqrt(variance*duration);
   }
   records.push({topics:event.topics||[],standardizedMove,title:event.title,url:event.url,source:event.source,publishedAt:event.datedAt,horizonHours:horizon,from:new Date(start).toISOString(),to:new Date(end).toISOString(),before:pre.close,after:post.close,observedPercent:observed,referencePercent:reference,differencePercent:reference===null?null:observed-reference,actualWindowHours:(end-start)/3600000});
  }
 }
 // Mark overlapping event windows; never count two simultaneous announcements as independent evidence.
 for(const record of records)record.overlapping=records.some(other=>other.publishedAt!==record.publishedAt||other.url!==record.url ? other.horizonHours===record.horizonHours&&Date.parse(other.from)<Date.parse(record.to)&&Date.parse(record.from)<Date.parse(other.to) : false);
 const median=values=>values.length?(values[Math.floor((values.length-1)/2)]+values[Math.floor(values.length/2)])/2:null;
 const summaries=[1,4].map(horizon=>{
  const sample=records.filter(r=>r.horizonHours===horizon),values=sample.map(r=>r.observedPercent).sort((a,b)=>a-b),isolated=sample.filter(r=>!r.overlapping),excess=isolated.map(r=>r.differencePercent).filter(Number.isFinite).sort((a,b)=>a-b);
  return {horizonHours:horizon,count:values.length,isolatedCount:isolated.length,median:median(values),isolatedExcessMedian:median(excess),min:values.length?values[0]:null,max:values.length?values.at(-1):null,forecastAdjustment:null,calibration:'descriptive_only'};
 });
 const topics=[...new Set(records.flatMap(r=>r.topics))];
 const byTopic=topics.flatMap(topic=>[1,4].map(horizon=>{
  const sample=records.filter(r=>r.topics.includes(topic)&&r.horizonHours===horizon&&!r.overlapping&&Number.isFinite(r.differencePercent));
  const values=sample.map(r=>r.differencePercent).sort((a,b)=>a-b);
  return {topic,horizonHours:horizon,count:values.length,medianExcess:median(values),status:values.length<20?'insufficient':'descriptive_only',predictiveEffect:null};
 }));
 return {status:records.length?'measured':'insufficient',records,excluded,summaries,byTopic,duplicatesIgnored:observations.length-unique.length,computedAt:new Date(now).toISOString(),causalEffect:null,note:'Variations observées sur des clôtures horaires autour d’une publication : ce n’est pas l’effet causal isolé de la nouvelle. Référence : prolongement de la variation logarithmique moyenne des 24 heures précédentes, si disponible. Les annonces simultanées, l’anticipation, les frais et les autres facteurs ne sont pas contrôlés. Les événements et fenêtres peuvent se chevaucher : les observations ne sont pas indépendantes. Ces mesures ne modifient pas la projection et ne valident pas une position.'};
}
module.exports={eventStudy};
