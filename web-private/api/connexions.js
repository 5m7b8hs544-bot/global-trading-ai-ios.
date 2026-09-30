'use strict';
const {connectionSummary}=require('../lib/connections');
module.exports=(req,res)=>{res.setHeader('Cache-Control','private, no-store');if(req.method!=='GET')return res.status(405).json({status:'unavailable'});return res.status(200).json({connections:connectionSummary(),computedAt:new Date().toISOString(),note:'Les widgets affichés et les accès aux données du moteur sont distincts. Aucun identifiant ni secret n’est renvoyé.'})};
