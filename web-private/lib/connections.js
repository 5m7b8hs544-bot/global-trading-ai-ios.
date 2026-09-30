'use strict';
const {configuration,providerData,providerQuote}=require('./provider');
const {capitalConfig,capitalData,capitalLatestQuote}=require('./capital');
const {ctraderConfig,ctraderData,ctraderQuote}=require('./ctrader');
const markets=['XAU/USD','EUR/USD','BTC/USD','US100','WTI','AAPL'];
function connectionConfig(symbol,interval='1h',env=process.env){
 if(symbol==='BTC/USD')return {ready:true,provider:'Coinbase Exchange',reason:null};
 if(env.MARKET_DATA_PROVIDER&& !['ctrader','default'].includes(env.MARKET_DATA_PROVIDER))return {ready:false,provider:'Non sélectionné',reason:'Fournisseur sélectionné invalide.'};
 if(env.MARKET_DATA_PROVIDER==='ctrader')return {...ctraderConfig(symbol,interval,env),provider:'cTrader Open API'};
 return symbol==='US100'?{...capitalConfig(interval,env),provider:'Capital.com · US100 CFD'}:{...configuration(symbol,interval,env),provider:'Twelve Data'};
}
async function marketData(symbol,interval,env=process.env){
 const config=connectionConfig(symbol,interval,env);if(!config.ready)throw new Error(config.reason);
 if(env.MARKET_DATA_PROVIDER==='ctrader')return ctraderData(symbol,interval,env);
 return symbol==='US100'?capitalData(interval,env):providerData(symbol,interval,env);
}
async function marketQuote(symbol,env=process.env){
 const config=connectionConfig(symbol,'1h',env);if(!config.ready)throw new Error(config.reason);
 if(env.MARKET_DATA_PROVIDER==='ctrader')return ctraderQuote(symbol,env);
 if(symbol==='US100')return capitalLatestQuote(env);
 return providerQuote(symbol,env);
}
function connectionSummary(env=process.env){return markets.map(symbol=>{const c=connectionConfig(symbol,'1h',env);return {symbol,provider:c.provider,status:symbol==='BTC/USD'?'public':c.ready?'configured_unverified':'authorization_required',reason:symbol==='BTC/USD'?'Flux public sans clé ; fraîcheur contrôlée à chaque réception.':c.ready?'Configuration présente : connexion et droits à vérifier sur les données reçues.':c.reason}})}
module.exports={connectionConfig,marketData,marketQuote,connectionSummary,markets};
