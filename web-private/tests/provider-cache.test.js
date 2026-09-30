'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {providerQuote}=require('../lib/provider');
const {capitalLatestQuote}=require('../lib/capital');
test('cotations : requêtes concurrentes regroupées, cache isolé par clé',async()=>{
 const calls=[];
 const request=async url=>{const u=new URL(url);calls.push(u);return {ok:true,json:async()=>({symbol:'EUR/USD',currency:'USD',close:u.searchParams.get('apikey')==='a'?'1.1':'1.2',last_quote_at:Date.now()/1000})}};
 const quotes=await Promise.all([providerQuote('EUR/USD',{TWELVE_DATA_API_KEY:'a'},request),providerQuote('EUR/USD',{TWELVE_DATA_API_KEY:'a'},request)]);
 assert.equal(calls.length,1);assert.equal(quotes[0].price,1.1);
 assert.equal((await providerQuote('EUR/USD',{TWELVE_DATA_API_KEY:'b'},request)).price,1.2);assert.equal(calls.length,2);
});
test('une erreur fournisseur ne reste pas en cache',async()=>{
 let calls=0;const request=async()=>({ok:++calls>1,json:async()=>({symbol:'EUR/USD',currency:'USD',close:1.1,last_quote_at:Date.now()/1000})});
 await assert.rejects(providerQuote('EUR/USD',{TWELVE_DATA_API_KEY:'a'},request));
 await providerQuote('EUR/USD',{TWELVE_DATA_API_KEY:'a'},request);assert.equal(calls,2);
});
test('US100 : lecture seule sans historique, session isolée et renouvelée après 401',async()=>{
 const calls=[];let rejectNext=false;
 const request=async(url,options)=>{
  calls.push({url,options});
  if(url.endsWith('/session')){const account=JSON.parse(options.body).identifier;return {ok:true,headers:new Headers({CST:account,'X-SECURITY-TOKEN':'fixture'})}}
  assert.equal(options.headers.CST,calls.filter(c=>c.url.endsWith('/session')).at(-1).options.body.includes('second')?'second':'first');
  if(rejectNext){rejectNext=false;return {ok:false,status:401}}
  return {ok:true,status:200,json:async()=>({markets:[{epic:'US100',instrumentType:'INDICES',marketStatus:'TRADEABLE',delayTime:0,updateTimeUTC:new Date().toISOString(),bid:100,offer:102}]})};
 };
 const first={CAPITAL_API_KEY:'cache-test',CAPITAL_IDENTIFIER:'first',CAPITAL_API_PASSWORD:'fixture'};
 assert.equal((await capitalLatestQuote(first,request)).price,101);
 await capitalLatestQuote(first,request);assert.equal(calls.filter(c=>c.url.endsWith('/session')).length,1);
 const second={...first,CAPITAL_IDENTIFIER:'second'};await capitalLatestQuote(second,request);assert.equal(calls.filter(c=>c.url.endsWith('/session')).length,2);
 rejectNext=true;await assert.rejects(capitalLatestQuote(second,request));await capitalLatestQuote(second,request);
 assert.equal(calls.filter(c=>c.url.endsWith('/session')).length,3);
 assert.ok(calls.every(c=>!c.url.includes('/prices/')&&!c.url.includes('/positions')));
});
