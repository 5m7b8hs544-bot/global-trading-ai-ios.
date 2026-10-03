'use strict';
const {CapitalAccessError}=require('../lib/capital');
const {marketQuote,markets,connectionConfig}=require('../lib/connections');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='GET')return res.status(405).json({status:'unavailable'});
 const symbol=req.query.symbol;
 if(!markets.includes(symbol))return res.status(400).json({status:'unavailable'});
 if(symbol!=='BTC/USD'){
  if(!connectionConfig(symbol).ready)return res.status(503).json({status:'unavailable',reason:connectionConfig(symbol).reason});
  try{const q=await marketQuote(symbol);return res.status(200).json({symbol,price:q.price,priceAt:q.time,source:q.source})}catch(e){return res.status(503).json({status:'unavailable',reason:e instanceof CapitalAccessError?e.message:'Cours fournisseur non vérifié ou indisponible'})}
 }
 try{
  const response=await fetch('https://api.exchange.coinbase.com/products/BTC-USD/ticker',{headers:{Accept:'application/json'},signal:AbortSignal.timeout(7000)});
  if(!response.ok)throw new Error('Source indisponible');
  const data=await response.json(),price=Number(data.price),at=Date.parse(data.time),now=Date.now();
  if(!Number.isFinite(price)||price<=0||!Number.isFinite(at)||at>now+60000||now-at>120000)throw new Error('Cours absent ou ancien');
  return res.status(200).json({symbol:'BTC/USD',price,priceAt:new Date(at).toISOString(),source:'Coinbase Exchange · BTC-USD'});
 }catch{return res.status(503).json({status:'unavailable',reason:'Source de cotation momentanément indisponible'})}
};
