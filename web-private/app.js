'use strict';
const markets=[{symbol:'XAU/USD',name:'Or',group:'Métaux'},{symbol:'EUR/USD',name:'Euro / Dollar',group:'Forex'},{symbol:'BTC/USD',name:'Bitcoin',group:'Crypto'},{symbol:'US100',name:'US Tech 100 · CFD',group:'Indices'},{symbol:'WTI',name:'Pétrole WTI',group:'Énergie'},{symbol:'AAPL',name:'Apple',group:'Actions'}];
const providers={'XAU/USD':'OANDA:XAUUSD','EUR/USD':'OANDA:EURUSD','BTC/USD':'COINBASE:BTCUSD','US100':'CAPITALCOM:US100','WTI':'TVC:USOIL','AAPL':'NASDAQ:AAPL'};
const tabs=['Marchés','Prévisions','Actualités','Paramètres'];
let tab='Marchés',selected='XAU/USD',horizon=24,analysisInterval='1h';
const content=document.querySelector('#content');
function setTab(value){if(!tabs.includes(value))throw new Error('Menu inconnu');tab=value;render();window.scrollTo(0,0)}
function selectMarket(value){if(!markets.some(m=>m.symbol===value))throw new Error('Instrument inconnu');selected=value;render()}
function setHorizon(value){if(![24,48,72].includes(value))throw new Error('Horizon inconnu');horizon=value;render()}
function render(){
 document.querySelectorAll('nav button').forEach(b=>{if(b.dataset.tab===tab)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
 if(tab==='Marchés')content.innerHTML=`<h1>Marchés mondiaux</h1><p class="muted">${selected} · Cours et graphique</p><section class="chart-panel" aria-label="Graphique de ${selected}"><div id="chart-widget"></div></section><p class="help">Source : TradingView · ${providers[selected]}. Données en temps réel ou différées selon le marché. Les cotations peuvent différer de celles de ton courtier.</p><h2>Cotations automatiques</h2><section id="market-quotes" class="quotes-grid"></section><p class="help">Les cotations évoluent sans recharger la page lorsque le marché cote. Données en direct ou différées selon le fournisseur ; le délai et l’état du marché figurent dans la cotation. Elles peuvent différer de celles de ton courtier.</p><h2>Choisir un marché</h2><div class="markets">${markets.map(m=>`<button class="market" data-symbol="${m.symbol}" aria-pressed="${selected===m.symbol}"><span><span class="symbol">${m.symbol}</span><span class="name">${m.name} · ${m.group}</span></span><span class="selection">${selected===m.symbol?'Sélectionné':''}</span></button>`).join('')}</div><button class="primary" id="scenarios">Voir les scénarios</button>`;
 if(tab==='Prévisions')content.innerHTML=`<h1>Analyse ciblée · ${selected}</h1>${marketPicker()}<section class="live-clock" aria-label="Date et heure actuelles à Paris"><p id="live-date"></p><p id="live-time"></p><span>Heure de Paris · horloge de ton appareil</span></section><section id="live-market" class="market-hero"></section><section id="live-forecast" class="forecast-hero"></section><section id="live-context" class="panel context-panel" aria-label="Synthèse prix et actualités"></section><p class="muted" id="analysis-clock"></p><h2>Intervalle des indicateurs</h2><div class="horizons">${['15m','1h','4h','1D'].map(i=>`<button data-interval="${i}" aria-pressed="${analysisInterval===i}">${i==='1D'?'1 jour':i}</button>`).join('')}</div><p class="help">Cet intervalle mesure la tendance des bougies, pas une prévision du prix dans ${analysisInterval==='1D'?'24 heures':analysisInterval}.</p><section class="panel"><details id="engine-details"><summary>Détails du moteur, méthode et actualités</summary><h2>Moteur expérimental sur données brutes</h2><p class="help">Connexion sans compte : BTC/USD. Autres marchés : flux de prix à connecter. Les actualités ne sont pas converties en prévisions de prix.</p><div id="engine-result" aria-live="polite"></div></details><button class="secondary" id="refresh-engine">Actualiser les données</button></section><section class="analysis-widget" id="technical-widget" aria-label="Analyse technique"></section><p class="help">Source : TradingView · ${providers[selected]}. La synthèse achat / neutre / vente repose sur des indicateurs techniques. Elle ne garantit aucun résultat et n’intègre pas les actualités ci-dessous.</p><section class="panel"><h2>Avant de prendre une position</h2><p>${marketFactors[selected]}</p><p class="muted">Facteurs à surveiller, sans impact calculé : confronte la tendance aux nouvelles datées et aux annonces du calendrier. Une contradiction entre intervalles ou une annonce imminente peut justifier d’attendre.</p><dl><div><dt>Prévision future validée</dt><dd>Indisponible</dd></div><div><dt>Probabilité de réussite</dt><dd>Non mesurée</dd></div></dl></section><h2 class="section-title">Actualités · ${selected}</h2><section class="news-widget" id="news-widget"></section><p class="help">Si le fournisseur ne propose pas d’article pour cet instrument, consulte le flux international dans Actualités. Aucun article absent n’est remplacé par du contenu inventé.</p><h2 class="section-title">Annonces internationales</h2><p class="help">Vérifie le fuseau indiqué dans le calendrier avant toute décision. Les valeurs prévues sont le consensus économique, pas une prévision du cours.</p><section class="events-widget" id="events-widget"></section><button class="secondary" id="refresh-analysis">Actualiser l’analyse</button>`;
 if(tab==='Actualités')content.innerHTML=`<h1>Actualités internationales</h1>${marketPicker()}<h2 class="section-title">Marché ciblé · ${selected}</h2><section class="news-widget" id="news-widget"></section><h2 class="section-title">Flux international</h2><section class="news-widget" id="world-news-widget"></section><h2 class="section-title">Calendrier économique</h2><p class="help">Heures selon le fuseau affiché par le fournisseur. Les filtres du calendrier sont interactifs.</p><section class="events-widget" id="events-widget"></section>`;
 if(tab==='Paramètres')content.innerHTML='<h1>Paramètres</h1><section class="panel"><h2>Installer sur ton iPhone</h2><ol class="steps"><li>Ouvre cette application dans <strong>Safari</strong>.</li><li>Ouvre le menu <strong>Partager</strong>, puis choisis <strong>Sur l’écran d’accueil</strong>.</li><li>Si l’option apparaît, active <strong>Ouvrir comme app web</strong>, puis touche <strong>Ajouter</strong>.</li></ol><p class="help">Connecte-toi avec ton compte Vercel si une connexion est demandée.</p></section><section class="panel"><h2>GLOBAL TRADING AI · 0.11.0</h2><p class="muted">Données du moteur hors Bitcoin : CFD Capital.com quand cet accès est configuré. Les widgets TradingView gardent leurs sources distinctes. Version web avec graphiques, analyse technique par intervalle, actualités ciblées et calendrier économique. Variations mesurées après les publications quand les données le permettent. Effet causal et position parfaite non établis. Aucun ordre n’est transmis.</p></section><section class="panel" id="connections"><p>Vérification des connexions…</p></section>';if(tab==='Paramètres')loadConnections();
 if(tab==='Marchés'){mountChart();mountMarketQuotes()}
 if(tab==='Prévisions'){
 updateClock();
 updateDashboardClock();
 if(selected!=='BTC/USD')mountSelectedQuote();
 loadEngine(selected,analysisInterval);
 mountEmbed('technical-widget','technical-analysis',{symbol:providers[selected],interval:analysisInterval,displayMode:'single',showIntervalTabs:false,disableInterval:true,width:'100%',height:450},'https://www.tradingview.com/chart/?symbol='+encodeURIComponent(providers[selected]),'Analyse technique');
 }
 if(tab==='Prévisions'||tab==='Actualités'){
 mountEmbed('news-widget','timeline',{feedMode:'symbol',symbol:providers[selected],displayMode:'regular',width:'100%',height:500},'https://www.tradingview.com/news/','Actualités');
 mountEmbed('events-widget','events',{countryFilter:'ar,au,br,ca,cn,fr,de,in,id,it,jp,kr,mx,ru,sa,za,tr,gb,us,eu',importanceFilter:'0,1',width:'100%',height:550},'https://www.tradingview.com/economic-calendar/','Calendrier économique');
 }
 if(tab==='Actualités')mountEmbed('world-news-widget','timeline',{feedMode:'all_symbols',displayMode:'regular',width:'100%',height:500},'https://www.tradingview.com/news/','Actualités internationales');
 content.querySelector('#market-picker')?.addEventListener('change',e=>selectMarket(e.target.value));
 content.querySelectorAll('[data-interval]').forEach(b=>b.addEventListener('click',()=>{analysisInterval=b.dataset.interval;render()}));
 content.querySelector('#refresh-engine')?.addEventListener('click',()=>loadEngine(selected,analysisInterval));
 content.querySelector('#refresh-analysis')?.addEventListener('click',()=>render());
 content.querySelectorAll('[data-symbol]').forEach(b=>b.addEventListener('click',()=>selectMarket(b.dataset.symbol)));
 content.querySelectorAll('[data-horizon]').forEach(b=>b.addEventListener('click',()=>setHorizon(Number(b.dataset.horizon))));
 content.querySelector('#scenarios')?.addEventListener('click',()=>setTab('Prévisions'));
}
const marketFactors={
 'XAU/USD':'Or : décisions de la Fed, taux réels américains, dollar, inflation et tensions géopolitiques.',
 'EUR/USD':'Euro / dollar : annonces de la BCE et de la Fed, inflation et emploi dans les deux zones.',
 'BTC/USD':'Bitcoin : liquidité mondiale, annonces réglementaires, flux institutionnels et événements crypto.',
 'US100':'US Tech 100 CFD de Capital.com : taux américains, résultats des grandes entreprises et annonces technologiques.',
 'WTI':'Pétrole WTI : stocks américains, annonces de l’OPEP+, production et événements géopolitiques.',
 'AAPL':'Apple : résultats, perspectives de ventes, nouveaux produits et chaîne de production internationale.'
};
function marketPicker(){return `<label for="market-picker">Marché ciblé</label><select id="market-picker">${markets.map(m=>`<option value="${m.symbol}" ${selected===m.symbol?'selected':''}>${m.symbol} · ${m.name}</option>`).join('')}</select>`}
function updateClock(){const el=document.querySelector('#analysis-clock');if(el)el.textContent='Consultation : '+new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',dateStyle:'full',timeStyle:'short'}).format(new Date())+' · heure de Paris. Cette heure ne certifie pas la fraîcheur des données du fournisseur.'}
function mountEmbed(id,type,options,url,label){
 const host=content.querySelector('#'+id);if(!host)return;
 const container=document.createElement('div');container.className='tradingview-widget-container';
 const widget=document.createElement('div');widget.className='tradingview-widget-container__widget';container.appendChild(widget);
 const credit=document.createElement('div');credit.className='tradingview-widget-copyright';
 const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener nofollow';link.textContent=label+' · par TradingView';credit.appendChild(link);container.appendChild(credit);
 const script=document.createElement('script');script.src='https://s3.tradingview.com/external-embedding/embed-widget-'+type+'.js';script.async=true;
 script.textContent=JSON.stringify({colorTheme:'dark',isTransparent:false,locale:'fr',...options});
 script.onerror=()=>{widget.textContent='Le fournisseur n’a pas pu être chargé. Utilise le lien ci-dessous ou actualise.'};
 container.appendChild(script);host.replaceChildren(container);
}
setInterval(updateClock,60000);
function mountChart(){
 const host=content.querySelector('#chart-widget');
 const container=document.createElement('div');container.className='tradingview-widget-container';container.style.height='100%';container.style.width='100%';
 const chart=document.createElement('div');chart.className='tradingview-widget-container__widget';chart.style.height='calc(100% - 32px)';chart.style.width='100%';container.appendChild(chart);
 const credit=document.createElement('div');credit.className='tradingview-widget-copyright';
 const link=document.createElement('a');link.href='https://www.tradingview.com/chart/?symbol='+encodeURIComponent(providers[selected]);link.target='_blank';link.rel='noopener nofollow';link.textContent=selected+' · par TradingView';credit.appendChild(link);container.appendChild(credit);
 const script=document.createElement('script');script.type='text/javascript';script.src='https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';script.async=true;
 script.textContent=JSON.stringify({autosize:true,symbol:providers[selected],interval:'60',timezone:'Europe/Paris',theme:'dark',style:'1',locale:'fr',allow_symbol_change:false,hide_side_toolbar:true,hide_top_toolbar:false,hide_legend:false,hide_volume:true,calendar:false,details:false,hotlist:false,save_image:false,backgroundColor:'#07121e',gridColor:'rgba(168,187,203,0.12)',withdateranges:true,studies:[],support_host:'https://www.tradingview.com'});
 script.onerror=()=>{if(host.isConnected){const error=document.createElement('p');error.className='widget-error';error.textContent='Le graphique n’a pas pu être chargé. Vérifie ta connexion ou ouvre-le sur TradingView.';chart.replaceChildren(error)}};
 container.appendChild(script);host.replaceChildren(container);
}
document.querySelectorAll('nav button').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));render();
if(document.modelContext?.registerTool){const lifecycle=new AbortController();try{Promise.resolve(document.modelContext.registerTool({name:'configure_analysis_view',title:'Choisir un instrument et un horizon',description:'Sélectionne un instrument et un horizon puis ouvre les scénarios. Ne génère aucune prévision et ne transmet aucun ordre.',inputSchema:{type:'object',properties:{symbol:{type:'string',enum:markets.map(m=>m.symbol)},hours:{type:'number',enum:[24,48,72]}},required:['symbol','hours'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||!markets.some(m=>m.symbol===input.symbol)||![24,48,72].includes(input.hours))throw new Error('Instrument ou horizon invalide');selected=input.symbol;horizon=input.hours;setTab('Prévisions');return{symbol:selected,hours:horizon,status:'technical-analysis-only'}}},{signal:lifecycle.signal})).catch(()=>{});window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true})}catch{}}

function mountSelectedQuote(){
 const live=content.querySelector('#live-market');if(!live)return;
 live.innerHTML=`<p class="eyebrow">${selected} · Cotation automatique</p><div id="selected-quote"></div><p class="help">Source : TradingView · ${providers[selected]}. Le cours évolue automatiquement sans rechargement pendant la cotation. Données en direct ou différées selon le fournisseur ; voir le délai et l’état affichés. La projection du moteur nécessite un accès distinct aux données brutes.</p>`;
 mountEmbed('selected-quote','single-quote',{symbol:providers[selected],width:'100%',height:200},'https://www.tradingview.com/chart/?symbol='+encodeURIComponent(providers[selected]),selected);
}
function mountMarketQuotes(){
 const host=content.querySelector('#market-quotes');if(!host)return;
 host.innerHTML=markets.map((m,i)=>`<article class="quote-card"><h3>${m.name}</h3><div id="market-quote-${i}"></div></article>`).join('');
 markets.forEach((m,i)=>mountEmbed('market-quote-'+i,'single-quote',{symbol:providers[m.symbol],width:'100%',height:200},'https://www.tradingview.com/chart/?symbol='+encodeURIComponent(providers[m.symbol]),m.symbol));
}
