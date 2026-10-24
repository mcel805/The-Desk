import {brokerAPI,brokerMoney,portfolioMetrics,isVerified,accountOptions,feedChoices,assetMatchesChart,escapeHTML as esc} from './account-context.mjs';
const $=s=>document.querySelector(s);
export function setupChartAccount({paperAccounts,paperId,onPaper,onChange,onMarket,instrument,toast}){
 let status={connected:false,accounts:[]},wallet=null,selected=localStorage.getItem('the-desk.broker-account')||'',snapshot=null,asset=null,brokerQuote=null,assets=[],kind='crypto',sequence=0,searchSequence=0,busy=false,last=0,portfolioError='',feeds={hl:new Set(),cb:new Set(),bn:new Set()},feedsReady=false;
 const drawer=document.createElement('dialog');drawer.id='brokerAssets';drawer.setAttribute('aria-labelledby','brokerAssetsTitle');
 drawer.innerHTML=`<header class="rh-header"><div><h2 id="brokerAssetsTitle">Robinhood assets</h2><p id="assetAccount"></p></div><button id="closeBrokerAssets" aria-label="Close assets">×</button></header><div class="rh-controls"><label>Asset class<select id="brokerAssetKind"><option value="crypto">Crypto · full USD catalog</option><option value="equity">Stocks & ETFs · search</option></select></label><label>Search<input id="brokerAssetSearch" placeholder="Symbol or name" maxlength="80"></label><button id="brokerAssetSearchButton">Search / refresh</button></div><p id="brokerAssetCoverage" role="status"></p><div id="brokerAssetResults"></div><p class="muted small">Catalog eligibility is a snapshot. Robinhood rechecks the account, quote, session, limits and restrictions at review. Options and futures are not enabled in this chart ticket.</p>`;
 document.body.append(drawer);
 function account(){return status.accounts.find(a=>a.id===selected);}
 function valid(){return isVerified(status)&&!!account();}
 function changed(){onChange();render();}
 function render(){
  const select=$('#accountSelect'),value=selected?'rh:'+selected:paperId(),html=accountOptions(paperAccounts(),value,status,wallet);
  if(select.innerHTML!==html)select.innerHTML=html;select.value=value;
  if(selected&&!account()){
   const option=document.createElement('option');option.value=value;option.textContent='○ Robinhood · saved account · disconnected';select.append(option);select.value=value;
  }
  const dot=$('#accountConnectionDot');dot.className='status-dot'+(selected&&valid()?' ok':'');
  dot.title=selected?(valid()?'Robinhood account verified by this Desk':'Robinhood disconnected or verification expired'):'Paper account · simulation';
  $('#accountConnection').textContent=selected?(valid()?'Robinhood connected · '+account().account:'Robinhood disconnected / unverified'):'Paper account · simulation';
  $('#brokerAssetsButton').hidden=!selected;$('#brokerAccountRefresh').hidden=!selected;
  $('#manageAccount').disabled=!!selected;$('#addAccount').disabled=!!selected;
  $('#assetAccount').textContent=account()?account().name+' '+account().account:'Connect Robinhood in this Desk to browse account-scoped assets.';
  const metrics=portfolioMetrics(snapshot?.sources?.portfolio),source=snapshot?.sources?.portfolio;
  if(selected){
   const fresh=valid()&&source?.status==='complete'&&Date.now()/1000-source.observedAt<60;
   for(const id of ['balance','equity','unrealized','buyingPower'])$('#'+id).textContent=fresh?brokerMoney(metrics[id]):'Unavailable';
   $('#unrealized').className='';
   $('#accountBalanceAsOf').textContent=portfolioError||(!source?'Refresh account for broker balances':(fresh?'Broker snapshot · ':'Retained snapshot · ')+new Date(source.observedAt*1000).toLocaleTimeString());
   $('#accountBalanceAsOf').title='Robinhood cash, portfolio value and equity buying power. Open P&L unavailable in this response. Crypto buying power is shown in the ticket.';
  }else $('#accountBalanceAsOf').textContent='';
 }
 async function refresh(force=false){
  if(busy||(!force&&Date.now()-last<30000))return;busy=true;last=Date.now();const mine=sequence;
  try{
   await brokerAPI('/session',{});const next=await brokerAPI('/status');if(mine!==sequence)return;status=next;
   if(selected&&valid()){
    const snap=await brokerAPI('/sync',{accountId:selected,sources:['portfolio']});if(mine!==sequence)return;snapshot=snap;portfolioError='';
    if(!asset){
     let saved;try{saved=JSON.parse(localStorage.getItem('the-desk.broker-asset:'+selected));}catch{}
     if(saved&&['crypto','equity'].includes(saved.kind)&&typeof saved.symbol==='string'){
      const data=await brokerAPI('/markets/'+(saved.kind==='crypto'?'crypto?':'equities?')+new URLSearchParams({accountId:selected,q:saved.symbol}));
      if(mine!==sequence)return;const restored=data.assets.find(a=>a.symbol===saved.symbol&&a.kind===saved.kind);if(restored)await chooseAsset(restored);
     }
    }
   }
  }catch(e){if(mine!==sequence)return;status={...status,connected:false};brokerQuote=null;portfolioError='Broker verification failed · balances unavailable';}
  finally{busy=false;changed();}
 }
 async function select(value){
  if(value.startsWith('connect:')){
   if(value==='connect:robinhood')$('#robinhoodButton').click();else $('#walletButton').click();render();return;
  }
  ++sequence;++searchSequence;snapshot=null;asset=null;brokerQuote=null;assets=[];portfolioError='';
  renderAssets();
  selected=value.startsWith('rh:')?value.slice(3):'';
  if(selected)localStorage.setItem('the-desk.broker-account',selected);else localStorage.removeItem('the-desk.broker-account');
  if(!selected)await onPaper(value);changed();
  if(selected){await refresh(true);if(valid()&&!asset)await openAssets();}
 }
 async function loadFeeds(){
  if(feedsReady)return;
  const results=await Promise.allSettled([
   fetch('https://api.hyperliquid.xyz/info',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'meta'})}).then(r=>{if(!r.ok)throw Error();return r.json();}),
   fetch('https://api.exchange.coinbase.com/products').then(r=>{if(!r.ok)throw Error();return r.json();})
  ]);
  if(results[0].status==='fulfilled')feeds.hl=new Set((results[0].value.universe||[]).filter(x=>!x.isDelisted).map(x=>x.name));
  if(results[1].status==='fulfilled'&&Array.isArray(results[1].value))feeds.cb=new Set(results[1].value.filter(x=>x.status==='online'&&!x.trading_disabled).map(x=>x.id));
  const verified=await Promise.allSettled(['BTCUSDT','ETHUSDT','SOLUSDT'].map(async symbol=>{const r=await fetch('/api/spider/symbol?'+new URLSearchParams({instrument:'binance:'+symbol}));if(!r.ok)throw Error();return symbol;}));
  feeds.bn=new Set(verified.filter(r=>r.status==='fulfilled').map(r=>r.value));
  feedsReady=results.every(x=>x.status==='fulfilled');
 }
 function renderAssets(){
  const mine=sequence,scopeAccount=selected,query=$('#brokerAssetSearch').value.trim().toLowerCase(),visible=kind==='crypto'?assets.filter(a=>!query||(a.symbol+' '+a.name).toLowerCase().includes(query)):assets;
  $('#brokerAssetResults').innerHTML=visible.length?visible.map((a,i)=>`<button class="broker-asset-row" data-broker-asset="${i}"><span><strong>${esc(a.symbol)}</strong><small>${esc(a.name)}</small></span><span>${esc(a.halted?'Halt / region restriction':a.displayOnly?'Display only':a.restriction)}<small>${a.kind==='crypto'?esc('Min '+(a.minQuantity??'unavailable')+' · step '+(a.quantityStep??'unavailable')+(a.marketOnly?' · market only':'')):'Account checked · regular-session chart'}</small></span><span>${a.eligible?'View / select':'Restricted · view'}</span></button>`).join(''):'<p class="rh-empty">No assets found in the loaded scope.</p>';
  drawer.querySelectorAll('[data-broker-asset]').forEach(b=>b.onclick=()=>{if(mine===sequence&&scopeAccount===selected)return chooseAsset(visible[Number(b.dataset.brokerAsset)]);});
 }
 async function search(){
  if(!valid())throw Error('Connect Robinhood in this Desk first.');const mine=sequence,searchId=++searchSequence,searchKind=kind,acct=selected,query=$('#brokerAssetSearch').value;
  $('#brokerAssetSearchButton').disabled=true;$('#brokerAssetCoverage').textContent='Reading account-scoped Robinhood instruments…';
  assets=[];renderAssets();
  try{
   if(kind==='equity'&&!query.trim()){$('#brokerAssetCoverage').textContent='Search by stock ticker or company name. The MCP exposes search rather than an exhaustive stock catalog.';assets=[];renderAssets();return;}
   const data=await brokerAPI('/markets/'+(kind==='crypto'?'crypto?':'equities?')+new URLSearchParams({accountId:acct,q:query}));
   if(mine!==sequence||acct!==selected||searchId!==searchSequence||searchKind!==kind)return;assets=data.assets;
   $('#brokerAssetCoverage').textContent=(data.complete?'Complete catalog · ':'Search results · ')+assets.length+' instruments · '+new Date(data.observedAt*1000).toLocaleTimeString()+' · '+data.scope;renderAssets();
  }finally{$('#brokerAssetSearchButton').disabled=false;}
 }
 async function openAssets(){
  if(!drawer.open)drawer.showModal();render();
  try{await search();}catch(e){$('#brokerAssetCoverage').textContent=e.message;}
 }
 async function chooseAsset(next){
  const mine=sequence,acct=selected;await loadFeeds();if(mine!==sequence||acct!==selected)return;
  ++sequence;asset=next;brokerQuote=null;const choices=feedChoices(asset,feeds.hl,feeds.cb,feeds.bn);
  localStorage.setItem('the-desk.broker-asset:'+selected,JSON.stringify({kind:asset.kind,symbol:asset.symbol}));
  const chosen=choices.find(c=>c.instrument===instrument())||choices[0];
  $('#brokerChartFeed').innerHTML=choices.map(c=>`<option value="${esc(c.instrument)}">${esc(c.label)}</option>`).join('');
  $('#brokerChartFeed').value=chosen.instrument;
  $('#brokerChartFeed').hidden=false;drawer.close();changed();
  try{await onMarket(chosen.instrument);await quoteRefresh();}catch(e){toast(e.message,true);}changed();
 }
 async function quoteRefresh(){
  if(!selected||!asset||!valid())return;const mine=sequence,a=asset;
  try{const q=await brokerAPI('/markets/quote?'+new URLSearchParams({accountId:selected,kind:a.kind,symbol:a.symbol}));if(mine===sequence&&asset===a)brokerQuote=q;}
  catch{if(mine===sequence&&asset===a)brokerQuote=null;}
  changed();
 }
 function quote(){
  if(!brokerQuote||!valid()||!assetMatchesChart(asset,instrument()))return null;
  const ages=[brokerQuote.bidTime,brokerQuote.askTime].map(t=>(Date.now()-Date.parse(t))/1000);
  if(!brokerQuote.bid||!brokerQuote.ask||ages.some(n=>!Number.isFinite(n)||n<0))return null;
  return {bid:brokerQuote.bid,ask:brokerQuote.ask,last:(Number(brokerQuote.bid)+Number(brokerQuote.ask))/2,age:Math.max(...ages),received_at:Math.min(Date.parse(brokerQuote.bidTime),Date.parse(brokerQuote.askTime))/1000,tick:asset.priceStep||'.01',qty_step:asset.quantityStep||'1',transport:'Robinhood MCP · polled quote'};
 }
 $('#accountSelect').onchange=e=>select(e.target.value).catch(e=>toast(e.message,true));
 $('#brokerAssetsButton').onclick=openAssets;$('#brokerAccountRefresh').onclick=()=>refresh(true);$('#closeBrokerAssets').onclick=()=>drawer.close();
 $('#brokerAssetKind').onchange=async e=>{kind=e.target.value;assets=[];$('#brokerAssetSearch').value='';try{await search();}catch(e){$('#brokerAssetCoverage').textContent=e.message;}};
 $('#brokerAssetSearchButton').onclick=()=>search().catch(e=>$('#brokerAssetCoverage').textContent=e.message);
 $('#brokerAssetSearch').oninput=()=>{if(kind==='crypto')renderAssets();};$('#brokerAssetSearch').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#brokerAssetSearchButton').click();}};
 $('#brokerChartFeed').onchange=async e=>{if(!asset||!feedChoices(asset,feeds.hl,feeds.cb,feeds.bn).some(c=>c.instrument===e.target.value))return;brokerQuote=null;changed();try{await onMarket(e.target.value);await quoteRefresh();}catch(error){toast(error.message,true);}};
 window.addEventListener('desk:robinhood-connection',()=>refresh(true));
 window.addEventListener('desk:wallet-context',e=>{wallet=e.detail;render();});
 setInterval(()=>{render();if(selected){refresh();quoteRefresh();}},10000);
 return {get selected(){return selected;},get asset(){return asset;},get status(){return status;},account,valid,quote,render,refresh,openAssets,
  get metrics(){const s=snapshot?.sources?.portfolio;return valid()&&s?.status==='complete'&&Date.now()/1000-s.observedAt<60?portfolioMetrics(s):{};},get matches(){return assetMatchesChart(asset,instrument());},
  review:async ticket=>{if(!valid()||!assetMatchesChart(asset,instrument()))throw Error('Select a Robinhood asset for this chart and verify the account.');return brokerAPI('/ticket/review',{accountId:selected,kind:asset.kind,symbol:asset.symbol,side:ticket.side,quantity:ticket.quantity??null,dollarAmount:ticket.dollarAmount??null,orderType:ticket.orderType,limitPrice:ticket.price??null,chartInstrument:instrument()});},
  submit:async previewId=>{if(!valid())throw Error('Robinhood account verification expired. Refresh before submitting.');return brokerAPI('/ticket/submit',{previewId});},
  orders:async()=>{if(!valid()||!asset)throw Error('Select and verify a Robinhood asset first.');return brokerAPI('/orders?'+new URLSearchParams({accountId:selected,kind:asset.kind}));}};
}
