'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {contracts,capitalQuote,capitalLatestQuote}=require('../lib/capital');
const {connectionConfig}=require('../lib/connections');
const quote=(symbol)=>({instrument:{...contracts[symbol],currency:'USD'},snapshot:{marketStatus:'TRADEABLE',delayTime:0,bid:100,offer:102,updateTimeUTC:new Date().toISOString()}});
test('Capital: five exact USD CFD contracts, no substitution and no stale quotes',()=>{
 for(const symbol of Object.keys(contracts)){
  const data=quote(symbol);assert.equal(capitalQuote(data,Date.now(),symbol).price,101);
  assert.throws(()=>capitalQuote({...data,instrument:{...data.instrument,epic:'WRONG'}},Date.now(),symbol),/contrat exact/);
  assert.throws(()=>capitalQuote({...data,instrument:{...data.instrument,currency:'EUR'}},Date.now(),symbol),/devise/);
  assert.throws(()=>capitalQuote({...data,snapshot:{...data.snapshot,marketStatus:'CLOSED'}},Date.now(),symbol),/connecté.*fermé/);
  assert.throws(()=>capitalQuote({...data,snapshot:{...data.snapshot,updateTimeUTC:'2000-01-01T00:00:00Z'}},Date.now(),symbol),/ancien/);
 }
});
test('Capital: shared session and exact read-only endpoints across markets',async()=>{
 const env={CAPITAL_API_KEY:'fixture-multi',CAPITAL_IDENTIFIER:'fixture',CAPITAL_API_PASSWORD:'fixture',CAPITAL_API_ENV:'live'};const seen=[];
 const request=async(url,options)=>{seen.push([url,options.method||'GET']);if(url.endsWith('/session'))return {ok:true,headers:new Headers({CST:'fixture','X-SECURITY-TOKEN':'fixture'})};const epic=url.split('/').pop(),symbol=Object.keys(contracts).find(s=>contracts[s].epic===epic);assert.ok(symbol);return {ok:true,status:200,json:async()=>quote(symbol)}};
 for(const symbol of Object.keys(contracts)){assert.match(connectionConfig(symbol,'1h',env).provider,/Capital/);assert.equal((await capitalLatestQuote(env,request,symbol)).price,101)}
 assert.equal(seen.filter(([,method])=>method==='POST').length,1);assert.ok(seen.every(([url,method])=>method==='POST'?url.endsWith('/session'):/\/markets\//.test(url)));
 assert.equal(connectionConfig('BTC/USD','1h',env).provider,'Coinbase Exchange');
});
