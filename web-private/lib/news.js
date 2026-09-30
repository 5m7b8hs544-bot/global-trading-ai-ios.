'use strict';
function decode(text){return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&(?:amp|lt|gt|quot|apos);/g,x=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[x])).replace(/&#(\d+);/g,(_,n)=>Number(n)<=0x10ffff?String.fromCodePoint(Number(n)):'')}
function parseFeed(xml,source,country,now){
 if(typeof xml!=='string'||xml.length>2000000||!/\<rss[\s>]/i.test(xml))throw new Error('Flux RSS invalide');
 const items=[...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)];
 return items.map(([,item])=>{
  const field=name=>decode(item.match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i'))?.[1]||'').trim();
  const title=field('title').slice(0,400),url=field('link'),time=Date.parse(field('pubDate'));
  let safe=false;try{safe=['http:','https:'].includes(new URL(url).protocol)}catch{}
  return safe&&title&&Number.isFinite(time)&&time<=now+60000&&now-time<=30*86400000?{title,url,source,country,publishedAt:new Date(time).toISOString()}:null;
 }).filter(Boolean);
}
module.exports={parseFeed};
