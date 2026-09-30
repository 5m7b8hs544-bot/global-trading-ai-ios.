const {test}=require('node:test');
const assert=require('node:assert/strict');
const {normalize,aggregate4h,analyse}=require('../lib/analysis');
const {parseFeed}=require('../lib/news');
const now=Date.UTC(2026,8,30,0,0,0);
const step=3600;
function series(){return Array.from({length:80},(_,i)=>({time:now/1000-(80-i)*step,low:100+i-1,high:100+i+2,open:100+i,close:100+i+1}))}
const ticker={price:'180',time:new Date(now-1000).toISOString()};
test('exclut la bougie ouverte et trie les bougies',()=>{
 const rows=[[now/1000,1,3,2,2],[now/1000-3600,1,3,2,2]];
 const result=normalize(rows,step,now);assert.equal(result.length,1);assert.equal(result[0].time,now/1000-3600);
});
test('rejette les OHLC incohérents',()=>assert.throws(()=>normalize([[now/1000-3600,1,3,2,4]],step,now),/incohérentes/));
test('ne génère pas de probabilité à partir des indicateurs',()=>{
 const a=analyse(series(),ticker,'1h',now);assert.equal(a.direction,'hausse');assert.equal(a.probability,undefined);assert.ok(a.resistance>a.support);assert.ok(a.atr>0);
});
test('rejette les cours anciens et les trous dans l’historique',()=>{
 assert.throws(()=>analyse(series(),{...ticker,time:new Date(now-121000).toISOString()},'1h',now),/ancien/);
 const rows=series();rows.splice(-10,1);assert.throws(()=>analyse(rows,ticker,'1h',now),/incomplet/);
});
test('agrège 4 heures seulement si les 4 bougies sont présentes',()=>{
 const all=aggregate4h(series());assert.equal(all.length,20);
 const missing=series();missing.splice(5,1);assert.equal(aggregate4h(missing).length,19);
});
test('ne sert ni liens actifs dangereux ni articles anciens depuis le RSS',()=>{
 const rss='<rss><channel><item><title>Test &amp; titre</title><link>https://example.org/actualite</link><pubDate>Tue, 29 Sep 2026 12:00:00 GMT</pubDate></item><item><title>Danger</title><link>javascript:alert(1)</link><pubDate>Tue, 29 Sep 2026 12:00:00 GMT</pubDate></item><item><title>Ancien</title><link>https://example.org/ancien</link><pubDate>Tue, 01 Sep 2020 12:00:00 GMT</pubDate></item></channel></rss>';
 const articles=parseFeed(rss,'source','pays',now);assert.equal(articles.length,1);assert.equal(articles[0].title,'Test & titre');
});
