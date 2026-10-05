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

test('Capital history: valid suffix only, never bridge corrupt candles',()=>{
 const {capitalHistory}=require('../lib/capital');
 const candle=i=>({snapshotTimeUTC:new Date(Date.UTC(2026,0,1,i)).toISOString(),lowPrice:{bid:98,ask:100},highPrice:{bid:104,ask:106},openPrice:{bid:100,ask:102},closePrice:{bid:102,ask:104}});
 const prices=Array.from({length:8},(_,i)=>candle(i));prices[2].lowPrice.ask=97;prices[4].closePrice.ask=null;
 const result=capitalHistory({prices:prices.toReversed()});
 assert.equal(result.discarded,5);assert.equal(result.invalid,2);assert.equal(result.rows.length,3);assert.equal(result.rows[0][0],Date.UTC(2026,0,1,5)/1000);
 assert.throws(()=>capitalHistory({prices:prices.slice(0,5)}),/dernière bougie invalide/);
 assert.throws(()=>capitalHistory({prices:[candle(1),candle(1)]}),/dupliqué/);
 assert.throws(()=>capitalHistory({prices:[{...candle(1),snapshotTimeUTC:'bad'}]}),/Horodatage/);
 const ohlc=candle(2);ohlc.highPrice={bid:90,ask:92};assert.throws(()=>capitalHistory({prices:[ohlc]}),/dernière bougie invalide/);
});


test('Capital quote: missing UTC in detail uses a complete UTC quote, never local time',async()=>{
 const env={CAPITAL_API_KEY:'fixture-utc',CAPITAL_IDENTIFIER:'fixture',CAPITAL_API_PASSWORD:'fixture',CAPITAL_API_ENV:'live'};
 const detail=quote('XAU/USD');delete detail.snapshot.updateTimeUTC;detail.snapshot.updateTime='2026-10-05T14:19:00';
 const utc={...detail.snapshot,epic:'GOLD',instrumentType:'COMMODITIES',bid:200,offer:202,updateTimeUTC:new Date().toISOString()};
 const seen=[];
 const request=async(url)=>{seen.push(url);if(url.endsWith('/session'))return {ok:true,headers:new Headers({CST:'fixture','X-SECURITY-TOKEN':'fixture'})};return {ok:true,status:200,json:async()=>url.includes('?searchTerm=')?{markets:[utc]}:detail}};
 assert.equal((await capitalLatestQuote(env,request,'XAU/USD')).price,201);
 assert.ok(seen.some(url=>url.endsWith('/markets?searchTerm=GOLD')));
 utc.updateTimeUTC='2000-01-01T00:00:00Z';await assert.rejects(capitalLatestQuote(env,request,'XAU/USD'),/ancien/);
 delete utc.updateTimeUTC;await assert.rejects(capitalLatestQuote(env,request,'XAU/USD'),/Horodatage/);
 utc.updateTimeUTC=new Date().toISOString();utc.epic='OTHER';await assert.rejects(capitalLatestQuote(env,request,'XAU/USD'),/contrat exact/);
 utc.epic='GOLD';detail.instrument.currency='EUR';await assert.rejects(capitalLatestQuote(env,request,'XAU/USD'),/devise/);
});
