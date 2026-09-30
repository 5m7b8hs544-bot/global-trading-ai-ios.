'use strict';
const seconds={'15m':900,'1h':3600,'4h':14400,'1D':86400};
function normalize(rows,step,now){
 if(!Array.isArray(rows))throw new Error('Historique absent');
 const unique=new Map();
 for(const r of rows){
  if(!Array.isArray(r)||r.length<5||!r.slice(0,5).every(Number.isFinite))throw new Error('Bougie invalide');
  const [time,low,high,open,close]=r;
  if(time<=0||low<=0||high<low||open<low||open>high||close<low||close>high)throw new Error('Cotations incohérentes');
  if((time+step)*1000<=now)unique.set(time,{time,low,high,open,close});
 }
 return [...unique.values()].sort((a,b)=>a.time-b.time);
}
function aggregate4h(candles){
 const buckets=new Map();
 for(const c of candles){const time=Math.floor(c.time/14400)*14400;if(!buckets.has(time))buckets.set(time,[]);buckets.get(time).push(c)}
 return [...buckets.entries()].filter(([time,c])=>c.length===4&&c.every((x,i)=>x.time===time+i*3600)).map(([time,c])=>({time,open:c[0].open,close:c[3].close,low:Math.min(...c.map(x=>x.low)),high:Math.max(...c.map(x=>x.high))}));
}
function analyse(candles,ticker,interval,now,options={}){
 const step=seconds[interval];
 if(!step||candles.length<60)throw new Error('Historique insuffisant : 60 bougies clôturées requises');
 const recent=candles.slice(-60),last=recent.at(-1);
 if(!options.sessionGaps&&recent.some((c,i)=>i&&c.time-recent[i-1].time!==step))throw new Error('Historique incomplet');
 if(now-(last.time+step)*1000>step*1000||last.time*1000>now)throw new Error('Historique trop ancien');
 const price=Number(ticker.price),timestamp=Date.parse(ticker.time);
 if(!Number.isFinite(price)||price<=0||!Number.isFinite(timestamp)||now-timestamp>120000||timestamp-now>60000)throw new Error('Dernier cours absent ou trop ancien');
 const mean=n=>recent.slice(-n).reduce((sum,c)=>sum+c.close,0)/n;
 const sma20=mean(20),sma50=mean(50);
 const atr=recent.slice(-14).reduce((sum,c,i)=>{const prev=recent[recent.length-15+i].close;return sum+Math.max(c.high-c.low,Math.abs(c.high-prev),Math.abs(c.low-prev))},0)/14;
 if(!Number.isFinite(atr)||atr<=0)throw new Error('Volatilité non calculable');
 const momentum=(last.close/recent.at(-5).close-1)*100;
 const direction=last.close>sma20&&sma20>sma50&&momentum>0?'hausse':last.close<sma20&&sma20<sma50&&momentum<0?'baisse':'indécise';
 const window=recent.slice(-12),resistance=Math.max(...window.map(c=>c.high)),support=Math.min(...window.map(c=>c.low));
 return {price,priceAt:new Date(timestamp).toISOString(),candleEnd:new Date((last.time+step)*1000).toISOString(),direction,sma20,sma50,atr,momentum,support,resistance,count:candles.length,sessionGaps:!!options.sessionGaps,historyGapCount:recent.filter((c,i)=>i&&c.time-recent[i-1].time!==step).length,interval,validUntil:new Date(now+60000).toISOString()};
}
module.exports={seconds,normalize,aggregate4h,analyse};
