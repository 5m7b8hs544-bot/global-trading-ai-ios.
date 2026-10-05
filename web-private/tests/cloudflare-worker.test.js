'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
test('Cloudflare collector: disabled and delayed runs perform no I/O',async()=>{
 const {collect}=await import('../cloudflare-worker.mjs');
 const forbidden=()=>{throw Error('Unexpected I/O')};
 assert.deepEqual(await collect({},0,forbidden),{disabled:true});
 assert.deepEqual(await collect({ENABLED:'true',DB:{prepare:forbidden}},0,forbidden,()=>100000),{late:true});
});
test('Cloudflare collector: isolates one upstream failure and strips secrets',async()=>{
 const {collect,symbols}=await import('../cloudflare-worker.mjs');const now=1800000000000,saved=[];let release=false;
 const DB={prepare(sql){return {bind(...args){return {sql,args,async run(){if(sql.includes('owner=?')&&sql.includes('expires_at=0'))release=true;return {meta:{changes:1}}}}}}},async batch(statements){saved.push(...statements)}};
 const request=async url=>{
  const symbol=url.searchParams.get('symbol');if(symbol==='WTI')throw Error('secret upstream error');
  return new Response(JSON.stringify({symbol,status:'observation',computedAt:new Date(now).toISOString(),secret:'do-not-store',technical:{price:100,priceAt:new Date(now).toISOString(),source:'fixture'}}),{headers:{'content-type':'application/json'}});
 };
 const result=await collect({ENABLED:'true',DB},now,request,()=>now);
 assert.equal(saved.length,6);assert.deepEqual(result.results.map(r=>r.symbol),symbols);assert.equal(result.results.filter(r=>r.status==='failed').length,1);assert.ok(release);assert.ok(!JSON.stringify(saved).includes('do-not-store'));assert.ok(!JSON.stringify(saved).includes('secret upstream'));
});
test('Cloudflare collector: rejects expired forecasts and wrong market identity',async()=>{
 const {compact}=await import('../cloudflare-worker.mjs');const now=1800000000000;
 const data={symbol:'XAU/USD',status:'observation',computedAt:new Date(now).toISOString(),forecast:{lower:99,central:100,upper:101,targetAt:new Date(now+3600000).toISOString(),validUntil:new Date(now-1).toISOString()}};
 assert.throws(()=>compact(data,'XAU/USD',now),/Invalid forecast/);
 assert.throws(()=>compact(data,'EUR/USD',now),/Invalid response/);
});
