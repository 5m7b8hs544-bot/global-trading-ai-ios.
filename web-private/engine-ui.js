'use strict';
let engineController=null;
let latestDashboard=null,previousExpiredState='';
let liveSocket=null,liveQuote=null,streamState='Connexion au flux…',streamRetryAt=0,streamAttempts=0,lastStreamMessage=0,lastStreamPaint=0;
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const priceFormat=value=>new Intl.NumberFormat('fr-FR',{maximumFractionDigits:Math.abs(Number(value))<10?5:2}).format(value);
function parisTime(value){const d=new Date(value);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',dateStyle:'short',timeStyle:'medium'}).format(d):'Date non disponible'}
function detectedTime(value){const match=/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value||'');return match?parisTime(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`):'Date non disponible'}
function clockTime(value){return new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(value))}
function updateDashboardClock(){
 const now=new Date(),date=document.querySelector('#live-date'),time=document.querySelector('#live-time');
 if(date)date.textContent=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(now);
 if(time)time.textContent=clockTime(now);
 if(latestDashboard){
  const quoteAt=liveQuote&&(latestDashboard.symbol===liveQuote.symbol||latestDashboard.symbol==='BTC/USD'&&!liveQuote.symbol)?Date.parse(liveQuote.priceAt)||0:0;
  const expiry=[Date.now()>Date.parse(latestDashboard.forecast?.validUntil),Date.now()-Math.max(Date.parse(latestDashboard.technical?.priceAt)||0,quoteAt)>120000].join(':');
  if(expiry!==previousExpiredState){previousExpiredState=expiry;renderDashboard(latestDashboard)}
 }
}
function renderDashboard(data){
 const live=document.querySelector('#live-market'),projection=document.querySelector('#live-forecast');if(!live||!projection)return;
 const base=data.technical,f=data.forecast;
 const quote=liveQuote&&(liveQuote.symbol===data.symbol||data.symbol==='BTC/USD'&&!liveQuote.symbol)&&(!base||Date.parse(liveQuote.priceAt)>Date.parse(base.priceAt))?liveQuote:null;
 renderContext(data);
 const t=quote?{...base,...quote,direction:base?.direction||'En attente des indicateurs'}:base;
 const fresh=t&&Date.now()-Date.parse(t.priceAt)<120000;
 if(data.symbol==='BTC/USD'||fresh||base)live.innerHTML=fresh?`<p class="eyebrow">${escapeHtml(data.symbol)} · Dernier cours reçu</p><p class="live-price">${priceFormat(t.price)} <span>USD</span></p><p class="help">Coté à ${clockTime(t.priceAt)} · heure de Paris<br>${escapeHtml(t.source)}<br>${escapeHtml(quote?streamState:data.symbol==='BTC/USD'?streamState:'Cours du calcul · mise à jour chaque minute')}</p><p class="trend-label">Tendance observée : ${escapeHtml(t.direction)}</p>`:`<p class="eyebrow">${escapeHtml(data.symbol)} · Cours du moteur</p><p class="empty-price">Indisponible</p><p class="help">${escapeHtml(data.reason||'Cours trop ancien. Actualisation nécessaire.')}</p>`;
 if(!f||!fresh){projection.innerHTML=`<h2>Projection pour l’heure en cours</h2><p class="muted">${escapeHtml(data.forecastReason||data.reason||'Projection indisponible.')}</p><div class="forecast-bounds"><div><p>Projection basse</p><strong>—</strong></div><div><p>Projection haute</p><strong>—</strong></div></div>`;return}
 if(Date.parse(f.validUntil)<=Date.now()){projection.innerHTML='<h2>Projection expirée</h2><p class="muted">L’instantané a plus d’une minute ou l’heure étudiée est terminée. Actualise les données pour un nouveau calcul.</p>';return}
 const target=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'}).format(new Date(f.targetAt));
 const start=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'}).format(new Date(Date.parse(f.targetAt)-3600000));
 projection.innerHTML=`<p class="experiment-label">Projection statistique · expérimentale</p><p class="eyebrow">Heure étudiée : ${start} → ${target} · Paris</p><h2>Projection centrale à ${target}</h2><p class="central-price">${priceFormat(f.central)} <span>USD</span></p><div class="forecast-bounds"><div class="bound-low"><p>Projection basse</p><strong>${priceFormat(f.lower)}</strong><small>USD à ${target}</small></div><div class="bound-high"><p>Projection haute</p><strong>${priceFormat(f.upper)}</strong><small>USD à ${target}</small></div></div><p class="projection-note">Fourchette statistique expérimentale du <strong>cours en fin d’heure</strong>, pas du plus haut et du plus bas pendant l’heure. Le cours peut sortir de ces bornes.</p><p class="help">Base du calcul : ${escapeHtml(t.source)} · ${priceFormat(f.basePrice??t.price)} USD.<br>Calcul : ${clockTime(f.computedAt)} · Actualisation chaque minute.<br>Actualités non intégrées au calcul ; précision future non garantie.</p>`;
}
async function loadEngine(symbol,interval,background=false){
 const host=document.querySelector('#engine-result');if(!host)return;
 engineController?.abort();engineController=new AbortController();
 const preserve=background&&latestDashboard?.symbol===symbol&&latestDashboard?.interval===interval;
 if(!preserve){latestDashboard=null;const contextHost=document.querySelector('#live-context');if(contextHost)contextHost.innerHTML='<h2>Synthèse prix et actualités</h2><p class="muted">Croisement des données en cours…</p>'}
 syncLiveStream();
 const live=document.querySelector('#live-market'),projection=document.querySelector('#live-forecast');
 if(!preserve&&live&&symbol==='BTC/USD')live.innerHTML=`<p class="eyebrow">${escapeHtml(symbol)} · Cours du moteur</p><p class="muted">Connexion aux données…</p>`;
 if(!preserve&&projection)projection.innerHTML='<h2>Projection pour l’heure en cours</h2><p class="muted">Calcul en attente des données…</p>';
 if(!preserve)host.innerHTML='<p class="muted" role="status">Récupération des cours et des métadonnées d’actualité…</p>';
 try{
  const response=await fetch('/api/analyse?'+new URLSearchParams({symbol,interval}),{cache:'no-store',signal:engineController.signal});
  if(!response.ok)throw new Error('Analyse indisponible');
  const data=await response.json();if(!host.isConnected)return;
  if(data.symbol!==symbol||data.interval!==interval)throw new Error('Réponse incohérente');
  latestDashboard=data;previousExpiredState='';renderDashboard(data);updateDashboardClock();
  const t=data.technical;
  const observed=t&&Date.parse(t.validUntil)>Date.now();
  let summary=observed?`<h3>Tendance observée : ${escapeHtml(t.direction)}</h3><dl><div><dt>Dernier cours · USD</dt><dd>${priceFormat(t.price)}</dd></div><div><dt>Heure du cours · Paris</dt><dd>${parisTime(t.priceAt)}</dd></div><div><dt>Dernière bougie clôturée</dt><dd>${parisTime(t.candleEnd)}</dd></div><div><dt>Moyennes 20 / 50</dt><dd>${priceFormat(t.sma20)} / ${priceFormat(t.sma50)}</dd></div><div><dt>ATR 14 · amplitude moyenne</dt><dd>${priceFormat(t.atr)} USD</dd></div><div><dt>Variation sur 4 bougies</dt><dd>${priceFormat(t.momentum)} %</dd></div></dl><p class="help">${escapeHtml(t.source)} · ${t.count} bougies clôturées. ${t.sessionGaps?`Marché à sessions : moyennes sur les bougies cotées ; ${t.historyGapCount} interruption(s) parmi les 60 dernières, fermetures et données manquantes non distinguées.`:''} Instantané recalculé chaque minute lorsque cette page est visible. L’historique peut être conservé 5 minutes.</p><h3>Repères conditionnels, sans ordre</h3><p>Clôture au-dessus de <strong>${priceFormat(t.resistance)} USD</strong> : cassure du plus haut des 12 dernières bougies à examiner. Clôture sous <strong>${priceFormat(t.support)} USD</strong> : cassure du plus bas à examiner.</p><p class="help">Ces seuils décrivent le passé. Ils ne constituent pas des objectifs de prix, une entrée recommandée ou une stratégie validée.</p>`:`<h3>Calcul de prix indisponible</h3><p>${escapeHtml(data.reason||'Instantané expiré. Actualise pour récupérer des données récentes.')}</p>`;
  const f=data.forecast;
  if(f)summary+=`<h3>Méthode de la projection horaire</h3><p>${escapeHtml(f.note)}</p><dl><div><dt>Modèle retenu</dt><dd>${f.model==='drift'?'Variation moyenne récente':'Cours inchangé comme référence'}</dd></div><div><dt>Sélection</dt><dd>60 cibles horaires antérieures</dd></div><div><dt>Mesure ultérieure séparée</dt><dd>${f.backtest.count} cibles horaires</dd></div><div><dt>Erreur absolue moyenne</dt><dd>${priceFormat(f.backtest.mae)} USD</dd></div><div><dt>Erreur du cours inchangé</dt><dd>${priceFormat(f.backtest.benchmarkMae)} USD</dd></div><div><dt>Clôtures dans la fourchette</dt><dd>${f.backtest.inside} / ${f.backtest.count}</dd></div></dl><p class="help">Mesure rétrospective à horizon d’une heure pleine, du ${parisTime(f.backtest.from)} au ${parisTime(f.backtest.to)}. Elle ne valide pas la projection pour les minutes restantes ni une probabilité future. Bornes : 1,645 écart-type des variations logarithmiques, ajusté au temps restant.</p>`;
  const n=data.news||{articles:[],status:'unavailable'};
  summary+=`<h3>Décision du moteur : attendre</h3><p>${escapeHtml(data.decisionReason)}</p><p class="help">Probabilité de réussite non mesurée. Aucun ordre ni taille de position ne sont calculés.</p><h3>Métadonnées des actualités</h3><p>${n.status==='available'?`${n.articles.length} articles trouvés sur la fenêtre de recherche des 24 dernières heures ; ${n.flagged} titre(s) à examiner selon des mots-clés de risque.`:n.status==='limited'?`${n.articles.length} communiqués officiels sur les 30 derniers jours. Couverture limitée : ce n’est pas un flux mondial complet.`:n.status==='empty'?'Aucun article trouvé dans la recherche ciblée. Cela ne signifie pas absence de risque.':'Source momentanément indisponible ; consulte les actualités TradingView plus bas.'}</p><p class="help">${escapeHtml(n.note)}</p>`;
  if(['available','limited'].includes(n.status))summary+='<ul class="article-list">'+n.articles.slice(0,8).map(a=>`<li><a href="${escapeHtml(a.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(a.title)}</a><p class="help">${escapeHtml(a.source)} · ${escapeHtml(a.country)} · ${a.publishedAt?'Publié : '+parisTime(a.publishedAt):'Détecté : '+detectedTime(a.seenAt)}</p></li>`).join('')+'</ul>';
  summary+=`<p class="help">Calcul effectué : ${parisTime(data.computedAt)} · Méthode expérimentale v0.10.</p>`;
  host.innerHTML=summary;
 }catch(e){if(e.name!=='AbortError'&&host.isConnected){host.innerHTML='<h3>Analyse indisponible</h3><p>La récupération a échoué. Aucune donnée fictive n’est affichée. Réessaie avec le bouton Actualiser.</p>';renderDashboard(latestDashboard||{symbol,reason:'La connexion aux données a échoué.'})}}
}
setInterval(updateDashboardClock,1000);
setInterval(()=>{if(!document.hidden&&document.querySelector('#engine-result'))loadEngine(selected,analysisInterval,true)},60000);
document.addEventListener('visibilitychange',()=>{syncLiveStream();if(!document.hidden&&document.querySelector('#engine-result'))loadEngine(selected,analysisInterval,true)});
window.addEventListener('pagehide',stopLiveStream);
setInterval(syncLiveStream,1000);

function stopLiveStream(){
 const socket=liveSocket;liveSocket=null;
 if(socket){socket.onclose=null;socket.onmessage=null;socket.onerror=null;socket.onopen=null;socket.close()}
}
function paintLiveQuote(){
 if(document.querySelector('#live-market'))renderDashboard(latestDashboard?.symbol===selected?latestDashboard:{symbol:selected});
}
function syncLiveStream(){
 const active=!document.hidden&&document.querySelector('#live-market')&&selected==='BTC/USD';
 if(!active){stopLiveStream();return}
 if(liveQuote&&Date.now()-Date.parse(liveQuote.priceAt)>120000)paintLiveQuote();
 if(liveSocket&&Date.now()-lastStreamMessage>20000){stopLiveStream();streamState='Flux interrompu · reconnexion automatique';streamRetryAt=Date.now()+2000;paintLiveQuote()}
 if(liveSocket||Date.now()<streamRetryAt)return;
 streamState='Connexion au flux direct…';lastStreamMessage=Date.now();
 let socket;
 try{socket=new WebSocket('wss://ws-feed.exchange.coinbase.com')}catch{streamRetryAt=Date.now()+10000;streamState='Flux indisponible · nouvelle tentative automatique';paintLiveQuote();return}
 liveSocket=socket;
 socket.onopen=()=>{if(liveSocket===socket)socket.send(JSON.stringify({type:'subscribe',product_ids:['BTC-USD'],channels:['ticker','heartbeat']}))};
 socket.onmessage=event=>{
  if(liveSocket!==socket)return;
  let message;try{message=JSON.parse(event.data)}catch{return}
  if(message.type==='error'){socket.close();return}
  if(message.product_id!=='BTC-USD')return;
  if(message.type==='heartbeat'){lastStreamMessage=Date.now();return}
  if(message.type!=='ticker')return;
  const price=Number(message.price),at=Date.parse(message.time),now=Date.now();
  if(!Number.isFinite(price)||price<=0||!Number.isFinite(at)||at>now+60000||now-at>120000||(liveQuote?.symbol==='BTC/USD'&&at<=Date.parse(liveQuote.priceAt)))return;
  lastStreamMessage=now;streamAttempts=0;
  liveQuote={symbol:'BTC/USD',price,priceAt:new Date(at).toISOString(),source:'Coinbase Exchange · BTC-USD'};
  streamState='● Flux direct connecté · cours reçu automatiquement';
  if(now-lastStreamPaint>=250){lastStreamPaint=now;paintLiveQuote()}
 };
 socket.onerror=()=>socket.close();
 socket.onclose=()=>{if(liveSocket!==socket)return;liveSocket=null;streamState='Flux interrompu · reconnexion automatique';streamRetryAt=Date.now()+Math.min(30000,1000*2**Math.min(streamAttempts++,5));paintLiveQuote()};
}
let quotePollPending=false,lastQuotePoll=0,lastPolledSymbol=null;
let configuredQuotes=new Set(['BTC/USD']);
async function loadConnections(){
 const host=document.querySelector('#connections');
 try{
  const r=await fetch('/api/connexions',{cache:'no-store'});if(!r.ok)throw new Error();
  const d=await r.json();configuredQuotes=new Set(d.connections.filter(c=>c.status==='public'||c.status==='configured_unverified').map(c=>c.symbol));
  if(!host)return;
  host.innerHTML='<h2>Connexions du moteur</h2><p class="help">Un graphique visible ne signifie pas que le moteur reçoit ses données. Le test ci-dessous vérifie une cotation récente ; l’historique est contrôlé lors de l’analyse.</p>'+d.connections.map((c,i)=>`<article class="conditional-plan"><h3>${escapeHtml(c.symbol)}</h3><p>${escapeHtml(c.provider)}</p><p class="help">${c.status==='public'?'Accès public sans clé':c.status==='configured_unverified'?'Configurée · à tester':'Données non connectées'}<br>${escapeHtml(c.reason)}</p>${configuredQuotes.has(c.symbol)?`<button type="button" data-verify="${i}">Tester le cours</button>`:''}<p class="help" id="connection-check-${i}" role="status"></p></article>`).join('')+'<p class="help">Les comptes de trading et les accès aux données du moteur sont distincts. Aucun abonnement n’est souscrit par cette application. Les marchés non connectés restent sans projection calculée.</p>';
  host.querySelectorAll('[data-verify]').forEach(button=>button.addEventListener('click',async()=>{
   const i=Number(button.dataset.verify),symbol=d.connections[i].symbol,result=host.querySelector('#connection-check-'+i);button.disabled=true;result.textContent='Vérification…';
   try{const response=await fetch('/api/cours?'+new URLSearchParams({symbol}),{cache:'no-store',signal:AbortSignal.timeout(15000)});const q=await response.json();if(!response.ok){result.textContent=typeof q.reason==='string'?q.reason:'Cours indisponible';return}const at=Date.parse(q.priceAt),price=Number(q.price);if(!response.ok||q.symbol!==symbol||!Number.isFinite(price)||price<=0||!Number.isFinite(at)||Date.now()-at>120000||at>Date.now()+60000)throw new Error();result.textContent='Cours vérifié : '+priceFormat(price)+' USD · '+parisTime(q.priceAt)+'. Ce test ne valide pas encore l’historique ni les prévisions.'}catch{result.textContent='Aucun cours récent vérifié. Le marché peut être fermé, le fournisseur indisponible ou les droits insuffisants.'}finally{button.disabled=false}
  }));
 }catch{if(host)host.innerHTML='<p>État des connexions indisponible. Réouvre cet onglet pour réessayer.</p>'}
}
async function pollLiveQuote(){
 if(quotePollPending||document.hidden||!document.querySelector('#live-market')||!configuredQuotes.has(selected))return;
 if(selected==='BTC/USD'&&liveSocket&&streamState.startsWith('● Flux direct connecté')&&Date.now()-lastStreamMessage<20000)return;
 const symbol=selected;const gap=symbol==='BTC/USD'||latestDashboard?.technical?.source?.startsWith('cTrader')?5000:60000;
 if(lastPolledSymbol===symbol&&Date.now()-lastQuotePoll<gap)return;lastPolledSymbol=symbol;lastQuotePoll=Date.now();quotePollPending=true;
 try{
  const response=await fetch('/api/cours?'+new URLSearchParams({symbol}),{cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!response.ok)return;const quote=await response.json();
  if(document.hidden||selected!==symbol||!document.querySelector('#live-market'))return;
  const at=Date.parse(quote.priceAt),price=Number(quote.price),now=Date.now();
  if(quote.symbol!==symbol||!Number.isFinite(price)||price<=0||!Number.isFinite(at)||now-at>120000||at>now+60000||(liveQuote?.symbol===symbol&&at<Date.parse(liveQuote.priceAt)))return;
  liveQuote={symbol,price,priceAt:quote.priceAt,source:quote.source};streamState='● Cours automatique · actualisation '+(gap/1000)+' secondes';paintLiveQuote();
 }catch{}finally{quotePollPending=false}
}
setInterval(pollLiveQuote,5000);

function renderContext(data){
 const host=document.querySelector('#live-context'),c=data.context;if(!host||!c)return;
 const valid=data.technical&&Date.parse(data.technical.validUntil)>Date.now();
 const plans=valid?c.plans:[];
 const study=c.newsStudy;
 const percent=n=>Number.isFinite(n)?(n>0?"+":"")+n.toLocaleString("fr-FR",{maximumFractionDigits:3})+" %":"Non calculable";
 const points=n=>Number.isFinite(n)?percent(n).replace(" %"," points"):"Non calculable";
 const measures=study?.records?.slice().sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)).slice(0,8)||[];
 const summaryHtml=(study?.summaries||[]).map(r=>`<article class="conditional-plan"><h4>Réactions à +${r.horizonHours} h</h4><p>${r.count} fenêtre(s) mesurée(s), ${r.isolatedCount} sans chevauchement avec les publications reçues.</p><dl><div><dt>Variation médiane observée</dt><dd>${percent(r.median)}</dd></div><div><dt>Écart médian hors chevauchement</dt><dd>${points(r.isolatedExcessMedian)}</dd></div></dl><p class="help">Statistique descriptive historique. L’écart est exprimé en points de pourcentage. Il ne prédit pas la prochaine annonce.</p></article>`).join('');
 const studyHtml=`<h3>Variations mesurées après les publications</h3>${summaryHtml}${measures.length?measures.map(r=>`<article class="conditional-plan"><h4><a href="${escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(r.title)}</a></h4><p class="help">${escapeHtml(r.source)} · publiée le ${parisTime(r.publishedAt)} · fenêtre +${r.horizonHours} h</p><dl><div><dt>Variation observée</dt><dd>${percent(r.observedPercent)}</dd></div><div><dt>Référence des 24 h précédentes</dt><dd>${percent(r.referencePercent)}</dd></div><div><dt>Écart à cette référence</dt><dd>${points(r.differencePercent)}</dd></div></dl><p class="help">Clôtures : ${parisTime(r.from)} → ${parisTime(r.to)} (${r.actualWindowHours} h). ${r.overlapping?"Annonces chevauchantes : attribution impossible.":"Aucun chevauchement détecté dans les publications reçues ; couverture limitée."} ${priceFormat(r.before)} → ${priceFormat(r.after)} USD.</p></article>`).join(""):"<p class=\"muted\">Aucune fenêtre mesurable : il faut une publication datée et des clôtures horaires continues avant et après.</p>"}<p class="help">${escapeHtml(study?.note||"Mesure indisponible.")}</p>`;
 host.innerHTML=`<p class="experiment-label">Analyse croisée · expérimentale</p><h2>Décision du moteur : attendre</h2><p class="help">Lecture de ${escapeHtml(data.symbol)} à ${clockTime(c.computedAt)} · Paris. Aucun signal de placement validé.</p><ul class="gate-list">${c.blockers.map(b=>`<li>${escapeHtml(b)}</li>`).join('')}${data.technical&&!valid?'<li>Analyse technique expirée : nouveaux calculs en attente</li>':''}</ul><h3>Scénarios conditionnels à surveiller</h3>${plans.length?plans.map(p=>`<article class="conditional-plan"><h4>${escapeHtml(p.side)}</h4><p>${escapeHtml(p.condition)}</p><dl><div><dt>Seuil de confirmation</dt><dd>${priceFormat(p.trigger)} USD</dd></div><div><dt>Repère d’invalidation · 1 ATR</dt><dd>${priceFormat(p.invalidation)} USD</dd></div><div><dt>Repère d’amplitude · 2 ATR</dt><dd>${priceFormat(p.reference)} USD</dd></div></dl></article>`).join(''):'<p class="muted">Pas de scénario calculable sans cours récent et historique vérifié.</p>'}<p class="help">${escapeHtml(c.planNote)}</p><h3>Nouvelles reliées au marché</h3><p class="help">${escapeHtml(c.impactNote)}</p>${c.observations.length?'<ul class="article-list">'+c.observations.slice(0,4).map(a=>`<li><a href="${escapeHtml(a.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(a.title)}</a><p class="help">${escapeHtml(a.topics.join(' · '))}<br>${escapeHtml(a.source)} · ${a.datedAt?parisTime(a.datedAt):'Date non vérifiée'} · ${escapeHtml(a.dateKind)}${a.recent?' · moins de 6 heures':''}</p></li>`).join('')+'</ul>':'<p class="muted">Aucun titre pertinent identifié dans les sources reçues. La couverture peut être incomplète.</p>'}${studyHtml}<p class="help">${escapeHtml(c.calendar.note)} Probabilité de réussite : non mesurée.</p>`;
}

loadConnections();
