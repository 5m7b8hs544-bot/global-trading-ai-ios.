'use strict';
// Dedicated Node server only. Vercel request handlers cannot host this loop.
const fs=require('node:fs/promises');
const path=require('node:path');
const markets=['XAU/USD','EUR/USD','BTC/USD','US100','WTI','AAPL'];
async function runCycle(handler,save,now=()=>new Date()){
 const started=now().toISOString(),results=[];
 for(const symbol of markets){
  try{
   let payload,status=200;
   const response={setHeader(){},status(code){status=code;return this},json(data){payload=data;return this}};
   await handler({method:'GET',query:{symbol,interval:'1h'}},response);
   if(status!==200||!payload||payload.symbol!==symbol)throw new Error('Invalid response');
   // Deliberately exclude article payloads, credentials and account data.
   const record={symbol,recordedAt:now().toISOString(),computedAt:payload.computedAt,status:payload.status,forecast:payload.forecast||null,forecastReason:payload.forecastReason||payload.reason||null,price:payload.technical?.price??null,priceAt:payload.technical?.priceAt??null,source:payload.technical?.source||null};
   await save(record);results.push({symbol,status:record.status});
  }catch{results.push({symbol,status:'failed'})}
 }
 return {startedAt:started,finishedAt:now().toISOString(),results};
}
async function main(){
 const dir=process.env.TRADING_WORKER_DATA_DIR;
 if(!dir||!path.isAbsolute(dir))throw new Error('Set an absolute TRADING_WORKER_DATA_DIR outside the repository');
 const root=path.resolve(__dirname),resolved=path.resolve(dir);
 if(resolved===root||resolved.startsWith(root+path.sep))throw new Error('Data directory must be outside the repository');
 await fs.mkdir(dir,{recursive:true,mode:0o700});
 const handler=require('./api/analyse');let stopping=false;
 process.on('SIGTERM',()=>{stopping=true});process.on('SIGINT',()=>{stopping=true});
 const atomic=async(name,data)=>{const file=path.join(dir,name),tmp=file+'.tmp';await fs.writeFile(tmp,JSON.stringify(data),{mode:0o600});await fs.rename(tmp,file)};
 while(!stopping){
  const start=Date.now();
  const state=await runCycle(handler,async record=>{
   const day=record.recordedAt.slice(0,10);
   // Append before publishing latest, preserving predictions as issued.
   await fs.appendFile(path.join(dir,day+'.jsonl'),JSON.stringify(record)+'\n',{mode:0o600});
   await atomic(record.symbol.replace('/','-')+'.json',record);
  });
  state.overrun=Date.now()-start>60000;
  await atomic('heartbeat.json',state);
  console.log(JSON.stringify({finishedAt:state.finishedAt,failed:state.results.filter(r=>r.status==='failed').length,overrun:state.overrun}));
  const next=start+60000;
  while(!stopping&&Date.now()<next)await new Promise(resolve=>setTimeout(resolve,Math.min(1000,next-Date.now())));
 }
}
module.exports={runCycle};
if(require.main===module)main().catch(()=>{console.error('Worker stopped; check configuration, storage and service health.');process.exitCode=1});
