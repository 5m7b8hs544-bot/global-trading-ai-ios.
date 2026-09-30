'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){
 let now=Date.now();const nodes={'#live-market':{innerHTML:''},'#live-forecast':{innerHTML:''}};
 const sockets=[];class Socket{constructor(url){this.url=url;sockets.push(this)}send(data){this.subscription=JSON.parse(data)}close(){this.closed=true;this.onclose?.()}receive(data){this.onmessage?.({data:JSON.stringify(data)})}}
 class Clock extends Date{static now(){return now}}
 const document={hidden:false,querySelector:key=>nodes[key]||null,addEventListener(){}};
 const ctx=vm.createContext({Date:Clock,Intl,JSON,Number,String,Math,WebSocket:Socket,document,window:{addEventListener(){}},setInterval(){},selected:'BTC/USD'});
 vm.runInContext(fs.readFileSync(__dirname+'/../engine-ui.js','utf8'),ctx);
 return {ctx,sockets,nodes,document,run:code=>vm.runInContext(code,ctx),time:()=>now,advance:ms=>now+=ms};
}
test('le cours évolue sans analyse ni rechargement, et rejette les prix invalides ou antérieurs',()=>{
 const s=setup();s.run('syncLiveStream()');const socket=s.sockets[0];socket.onopen();assert.equal(socket.subscription.channels[0],'ticker');
 const tick=(price,time=s.time())=>socket.receive({type:'ticker',product_id:'BTC-USD',price,time:new Date(time).toISOString()});
 tick('83000');assert.match(s.nodes['#live-market'].innerHTML,/83 000/);
 s.advance(1000);tick('83002');assert.match(s.nodes['#live-market'].innerHTML,/83 002/);
 tick('1',s.time()-500);tick('-1');assert.match(s.nodes['#live-market'].innerHTML,/83 002/);
});
test('reconnexion après perte du flux et fermeture en arrière-plan ou changement de marché',()=>{
 const s=setup();s.run('syncLiveStream()');s.sockets[0].close();s.run('syncLiveStream()');assert.equal(s.sockets.length,1);
 s.advance(2000);s.run('syncLiveStream()');assert.equal(s.sockets.length,2);
 s.document.hidden=true;s.run('syncLiveStream()');assert.equal(s.sockets[1].closed,true);
 s.document.hidden=false;s.run('syncLiveStream()');assert.equal(s.sockets.length,3);
 s.run("selected='XAU/USD';syncLiveStream()");assert.equal(s.sockets[2].closed,true);
});
test('les cotations anciennes sont masquées même si le heartbeat continue',()=>{
 const s=setup();s.run('syncLiveStream()');s.sockets[0].receive({type:'ticker',product_id:'BTC-USD',price:'83000',time:new Date(s.time()).toISOString()});
 s.advance(121000);s.sockets[0].receive({type:'heartbeat',product_id:'BTC-USD'});s.run('syncLiveStream()');assert.match(s.nodes['#live-market'].innerHTML,/Indisponible/);
});
test('un cours externe change sans rechargement et ne remplace pas un autre marché',()=>{
 const s=setup();s.run("selected='XAU/USD';liveQuote={symbol:'XAU/USD',price:2500,priceAt:new Date(Date.now()).toISOString(),source:'cTrader démo · XAUUSD'};paintLiveQuote()");
 assert.match(s.nodes['#live-market'].innerHTML,/2 500/);
 s.advance(1000);s.run("liveQuote={symbol:'XAU/USD',price:2501,priceAt:new Date(Date.now()).toISOString(),source:'cTrader démo · XAUUSD'};paintLiveQuote()");assert.match(s.nodes['#live-market'].innerHTML,/2 501/);
 s.run("selected='BTC/USD';paintLiveQuote()");assert.doesNotMatch(s.nodes['#live-market'].innerHTML,/2 501/);
});
