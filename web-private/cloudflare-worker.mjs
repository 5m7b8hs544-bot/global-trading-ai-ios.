// Scheduled collector only: computation and Capital credentials stay on Vercel.
export const symbols=['XAU/USD','EUR/USD','BTC/USD','US100','WTI','AAPL'];
const origin='https://global-trading-ai-prive.vercel.app';
export function compact(data,symbol,now){
 if(data?.symbol!==symbol||!['observation','unavailable'].includes(data.status))throw Error('Invalid response');
 const at=Date.parse(data.computedAt);
 if(!Number.isFinite(at)||now-at>120000||at>now+60000)throw Error('Stale response');
 const t=data.technical,f=data.forecast;
 const record={symbol,computedAt:data.computedAt,status:data.status,reason:String(data.reason||data.forecastReason||'').slice(0,500),price:t?.price??null,priceAt:t?.priceAt??null,source:String(t?.source||'').slice(0,250),forecast:null};
 if(f){
  const target=Date.parse(f.targetAt),expires=Date.parse(f.validUntil);
  if(![f.lower,f.central,f.upper].every(x=>Number.isFinite(x)&&x>0)||f.lower>f.central||f.central>f.upper||!Number.isFinite(target)||!Number.isFinite(expires)||target<=now||expires<=now)throw Error('Invalid forecast');
  record.forecast={lower:f.lower,central:f.central,upper:f.upper,targetAt:f.targetAt,validUntil:f.validUntil,model:f.model};
 }
 return record;
}
export async function collect(env,scheduledTime,request=fetch,clock=Date.now){
 if(env.ENABLED!=='true')return {disabled:true};
 if(!env.DB)throw Error('D1 binding DB required');
 const now=clock(),minute=Math.floor(scheduledTime/60000);
 // Avoid backfilling delayed cron events with forecasts made later.
 if(!Number.isFinite(scheduledTime)||now-scheduledTime>55000||scheduledTime>now+5000)return {late:true};
 const owner=crypto.randomUUID();
 const claim=await env.DB.prepare('UPDATE collector_lock SET owner=?, expires_at=? WHERE id=1 AND expires_at<?').bind(owner,now+55000,now).run();
 if(claim.meta.changes!==1)return {busy:true};
 try{
  const records=await Promise.all(symbols.map(async symbol=>{
   try{
    const url=new URL('/api/analyse',origin);url.searchParams.set('symbol',symbol);url.searchParams.set('interval','1h');
    const response=await request(url,{redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.timeout(35000)});
    if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw Error('Upstream unavailable');
    const text=await response.text();if(text.length>250000)throw Error('Response too large');
    return compact(JSON.parse(text),symbol,clock());
   }catch{return {symbol,status:'failed',computedAt:new Date(clock()).toISOString(),reason:'Collecte indisponible : consulter les journaux Vercel.',forecast:null}}
  }));
  // One transaction: keep the first result for each scheduled minute, including
  // failures, so retries never rewrite an already-issued forecast.
  await env.DB.batch(records.map(r=>env.DB.prepare('INSERT OR IGNORE INTO observations (minute,symbol,recorded_at,status,payload) VALUES (?,?,?,?,?)').bind(minute,r.symbol,clock(),r.status,JSON.stringify(r))));
  // Indexed retention. No automatic increase of the storage plan.
  await env.DB.prepare('DELETE FROM observations WHERE minute<?').bind(minute-7*24*60).run();
  console.log(JSON.stringify({minute,stored:records.length,failed:records.filter(r=>r.status==='failed').length}));
  return {minute,results:records.map(r=>({symbol:r.symbol,status:r.status}))};
 }finally{
  await env.DB.prepare('UPDATE collector_lock SET expires_at=0 WHERE id=1 AND owner=?').bind(owner).run();
 }
}
export default {
 async scheduled(controller,env){await collect(env,controller.scheduledTime)},
 // No public route for database data or manual triggering.
 fetch(){return new Response('Not found',{status:404})}
};
