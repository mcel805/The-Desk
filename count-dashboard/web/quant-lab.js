import {runSmaBacktest} from './quant-backtest.mjs';

const $ = selector => document.querySelector(selector);
const providerSpecs = {
  binance:{label:'Binance public data',className:'BinanceProvider',market:'BTCUSDT',type:'spot or perpetual, according to market symbol'},
  coinbase:{label:'Coinbase Exchange public data',className:'CoinbaseProvider',market:'BTC-USD',type:'spot'},
  hyperliquid:{label:'Hyperliquid public data',className:'HyperliquidProvider',market:'BTC',type:'perpetual or spot, according to market symbol'},
};
const storageKey = 'count-desk-quant-lab-v1';
const versionsKey = 'count-desk-quant-lab-strategies-v1';
let chart = null;
let bars = [];
let source = null;
let history = [];
let versions = [];
let activePanel = '';
let lastResult = null;
let lastRunKey = '';
let loadSequence = 0;

function readStored(key, fallback) { try { const value = JSON.parse(localStorage.getItem(key)); return Array.isArray(value) ? value : fallback; } catch { return fallback; } }
history = readStored(storageKey, []);
versions = readStored(versionsKey, []);
function save() { try { localStorage.setItem(storageKey, JSON.stringify(history.slice(-24))); localStorage.setItem(versionsKey, JSON.stringify(versions.slice(-50))); } catch {} }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
function fmt(value, maximumFractionDigits=2) { return Number(value).toLocaleString(undefined,{maximumFractionDigits}); }
function utc(time) { return new Date(time).toISOString().replace('T',' ').replace(/\.\d{3}Z$/,' UTC'); }
function runKey() { return JSON.stringify({name:draft.name,fast:draft.fast,slow:draft.slow,feeBps:draft.feeBps,source:source&&{id:source.id,market:source.market,timeframe:source.timeframe,cutoff:source.cutoff}}); }
function addMessage(role, content, error=false) {
  const node = document.createElement('div');
  node.className = `${role === 'user' ? 'user-message' : 'assistant-message'}${error ? ' error' : ''}`;
  if (role !== 'user') { const author=document.createElement('span'); author.className='message-author'; author.textContent='✦ COUNT DESK'; node.append(author); }
  const body=document.createElement('p'); body.textContent=content; node.append(body);
  $('#chatStream').append(node); $('#chatStream').scrollTop=$('#chatStream').scrollHeight;
  return node;
}
for (const message of history) if (message && ['user','assistant'].includes(message.role) && typeof message.content==='string') addMessage(message.role,message.content);
function setStatus(message, error=false) { $('#sourceState').textContent=message; $('#sourceState').style.color=error?'#ffb8c1':''; }
function panel(name,title,html) { activePanel=name; $('#panelEyebrow').textContent='QUANT LAB · '+name.toUpperCase(); $('#panelTitle').textContent=title; $('#panelBody').innerHTML=html; $('#sidePanel').hidden=false; }
function closePanel() { activePanel=''; $('#sidePanel').hidden=true; }
$('#closePanel').addEventListener('click',closePanel);
function updateClock(){ $('#clock').textContent=new Date().toISOString().slice(11,19); }
updateClock(); setInterval(updateClock,1000);
function validMarket(value){ return /^[A-Z0-9/_-]{1,32}$/.test(value); }
function isBar(bar) { return Number.isFinite(bar?.time) && Number.isFinite(bar?.open) && Number.isFinite(bar?.high) && Number.isFinite(bar?.low) && Number.isFinite(bar?.close); }
async function loadChart() {
  const sequence=++loadSequence;
  const id=$('#provider').value, spec=providerSpecs[id], market=$('#market').value.trim().toUpperCase(), timeframe=$('#timeframe').value;
  if (!validMarket(market)) { setStatus('Enter a valid market symbol using letters, numbers, /, - or _.',true); return; }
  const Provider=window.Vela?.[spec.className];
  if (!window.Vela?.Vela || !Provider) { setStatus('Vela browser bundle is unavailable.',true); return; }
  $('#loadChart').disabled=true; $('#chartError').hidden=true; setStatus(`Loading ${spec.label} · ${market} · ${timeframe}…`);
  try {
    const provider=new Provider();
    const nextBars=(await provider.getBars(market,timeframe,{limit:500})).filter(isBar).sort((a,b)=>a.time-b.time);
    if (sequence!==loadSequence) return;
    if (!nextBars.length) throw new Error('The public provider returned no valid bars. Check the market symbol, network, or provider availability.');
    if (chart) { chart.destroy(); chart=null; }
    $('#chart').replaceChildren();
    // This page owns its Vela instance and browser storage. It does not mutate the main chart workspace.
    chart=new window.Vela.Vela('#chart',{symbol:market,timeframe,data:nextBars,live:false,theme:'dark',drawings:true,volume:true,currentPriceLine:true,timeScale:{timezone:'UTC'},nativeBackend:'canvas2d',animations:{intro:false}});
    await chart.ready();
    await new Promise(resolve=>requestAnimationFrame(resolve));
    chart.resize();
    bars=nextBars;
    source={id,label:spec.label,market,timeframe,cutoff:nextBars.at(-1).time,loadedAt:Date.now(),type:spec.type};
    lastResult=null; lastRunKey='';
    $('#sourceCutoff').textContent=`LAST BAR ${utc(source.cutoff)}`;
    $('#barCount').textContent=`${bars.length} bars`;
    setStatus(`${spec.label} · ${market} · ${timeframe} · ${spec.type} · snapshot loaded ${utc(source.loadedAt)}`);
    if (activePanel==='connections') renderConnections();
    if (activePanel==='strategy') renderStrategy();
    if (activePanel==='indicators') void renderIndicators();
    if (activePanel==='replay') renderReplay();
  } catch(error) {
    if(sequence!==loadSequence)return;
    setStatus(error.message,true); $('#chartError').textContent=error.message; $('#chartError').hidden=false;
  } finally { if(sequence===loadSequence)$('#loadChart').disabled=false; }
}
$('#loadChart').addEventListener('click',loadChart);
$('#provider').addEventListener('change',()=>{$('#market').value=providerSpecs[$('#provider').value].market;setStatus('Source changed. Press Load chart to load its bars.');});
$('#market').addEventListener('keydown',event=>{if(event.key==='Enter')loadChart();});
$('#timeframe').addEventListener('change',()=>setStatus('Interval changed. Press Load chart to load its bars.'));
window.addEventListener('resize',()=>chart?.resize());

async function renderIndicators() {
  panel('indicators','Native Vela indicators','<p>These studies run in the Vela renderer on the loaded chart. They do not validate a trading strategy.</p><div id="indicatorList" class="panel-list"></div>');
  const list=$('#indicatorList');
  if (!chart) { list.textContent='Load a chart first.'; return; }
  try {
    const indicators=await chart.availableNativeIndicators();
    if (activePanel!=='indicators')return;
    list.replaceChildren();
    for(const item of indicators){
      const card=document.createElement('div'); card.className='card';
      const title=document.createElement('strong'); title.textContent=item.title || item.type;
      const detail=document.createElement('small'); detail.textContent=item.supported ? (item.present?'On chart':'Available') : 'Unavailable for this market';
      const button=document.createElement('button'); button.type='button';button.textContent=item.present?'Remove':'Add';button.disabled=!item.supported;
      button.addEventListener('click',()=>{try{if(item.present){const handle=chart.indicators().find(h=>h.nativeType===item.type);handle?.remove();}else chart.addNativeIndicator(item.type);renderIndicators();}catch(error){setStatus(error.message,true);}});
      card.append(title,detail,button);list.append(card);
    }
    if(!indicators.length)list.textContent='No native studies are available.';
  } catch(error){list.textContent=error.message;}
}
$('#indicatorButton').addEventListener('click',renderIndicators);

function replayInfo(){const state=chart?.replay?.state; const node=$('#replayState');if(node)node.textContent=state?.active?`Showing through ${state.cursorTime?utc(state.cursorTime):'loading'} · ${state.remaining} bars hidden`:'Replay off';}
function renderReplay(){panel('replay','Bar replay','<p>Replays only bars already loaded in this chart. Historical replay is a visual study, not a forward result.</p><label>Start at bar <input id="replayIndex" type="range" min="0" max="100" value="50"></label><p id="replayTarget"></p><div class="panel-row"><button id="replayStart">Start</button><button id="replayStep">Step</button><button id="replayPlay">Play</button><button id="replayPause">Pause</button><button id="replayStop">Stop</button></div><p id="replayState"></p>');
  if(!chart||bars.length<3){$('#replayTarget').textContent='Load a chart with at least three bars first.';return;}
  const slider=$('#replayIndex');slider.max=String(bars.length-2);slider.min='0';slider.value=String(Math.max(0,Math.floor(bars.length*.6)));
  const target=()=>{$('#replayTarget').textContent=`Start after ${utc(bars[Number(slider.value)].time)}`;};slider.addEventListener('input',target);target();replayInfo();
  $('#replayStart').addEventListener('click',async()=>{try{await chart.replay.start({from:bars[Number(slider.value)].time});replayInfo();}catch(error){$('#replayState').textContent=error.message;}});
  $('#replayStep').addEventListener('click',()=>{chart.replay.step();replayInfo();});
  $('#replayPlay').addEventListener('click',()=>{chart.replay.play(600);replayInfo();});
  $('#replayPause').addEventListener('click',()=>{chart.replay.pause();replayInfo();});
  $('#replayStop').addEventListener('click',()=>{chart.replay.stop();replayInfo();});
}
$('#replayButton').addEventListener('click',renderReplay);

const defaultStrategy={name:'SMA crossover',fast:9,slow:21,feeBps:0};
let draft={...defaultStrategy};
function renderStrategy(){
  panel('strategy','Paper backtest',`<p>Close-confirmed, long-only SMA crossover. An entry or exit signal fills at the next bar open. One unit per trade; fees are entered per side. Open positions remain unrealized. No slippage or funding model is included.</p><label>Study name<input id="studyName" maxlength="60" value="${escapeHtml(draft.name)}"></label><div class="panel-row"><label>Fast bars<input id="fastLength" type="number" min="2" max="299" value="${draft.fast}"></label><label>Slow bars<input id="slowLength" type="number" min="3" max="300" value="${draft.slow}"></label></div><label>Fee per side (basis points)<input id="feeBps" type="number" min="0" max="1000" step="0.1" value="${draft.feeBps}"></label><div class="panel-row"><button id="runStudy">Run on loaded bars</button><button id="saveStudy">Save version</button></div><div id="studyOutput"></div>`);
  $('#runStudy').addEventListener('click',()=>{try{readDraft();if(!source)throw new Error('Load a chart first.');lastResult=runSmaBacktest(bars,draft);lastRunKey=runKey();renderStudyResult(lastResult);}catch(error){lastResult=null;lastRunKey='';$('#studyOutput').textContent=error.message;}});
  $('#saveStudy').addEventListener('click',()=>{try{readDraft();if(!source||!lastResult||lastRunKey!==runKey())throw new Error('Run these exact settings on the loaded bars before saving.');const version={...draft,id:crypto.randomUUID(),createdAt:Date.now(),source:{...source},summary:{equity:lastResult.equity,trades:lastResult.trades.length,maxDrawdown:lastResult.maxDrawdown}};versions.unshift(version);save();$('#studyOutput').insertAdjacentHTML('afterbegin','<p class="good">Saved this tested version in this browser.</p>');}catch(error){$('#studyOutput').textContent=error.message;}});
  if(lastResult&&source)renderStudyResult(lastResult);
}
function readDraft(){draft={name:$('#studyName').value.trim()||'Untitled study',fast:Number($('#fastLength').value),slow:Number($('#slowLength').value),feeBps:Number($('#feeBps').value)};if(!Number.isInteger(draft.fast)||!Number.isInteger(draft.slow)||!Number.isFinite(draft.feeBps))throw new Error('Enter valid whole-number averages and fee.');}
function renderStudyResult(result){const output=$('#studyOutput');if(!output)return;const total=result.trades.length;const hit=total?fmt(result.wins/total*100,1)+'%':'—';output.innerHTML=`<h3>Historical simulation · ${escapeHtml(source.label)} · ${escapeHtml(source.market)} · ${escapeHtml(source.timeframe)}</h3><p class="muted">${result.bars} loaded bars · last bar ${utc(source.cutoff)} · 1 unit per trade · quote-currency P&amp;L</p><div class="metric-grid"><div class="metric">Closed trades<b>${total}</b></div><div class="metric">Win rate<b>${hit}</b></div><div class="metric">Net P&amp;L<b>${fmt(result.equity)}</b></div><div class="metric">Max closed-equity drawdown<b>${fmt(result.maxDrawdown)}</b></div></div><p class="warning">${result.openPosition?'One open position is excluded from closed-trade results.':'No open position at sample end.'} Fees: ${fmt(draft.feeBps,1)} bps/side. Slippage and funding excluded. Historical selection can overfit.</p><h3>Last closed trades</h3><table><thead><tr><th>Entry</th><th>Exit</th><th>Net</th></tr></thead><tbody>${result.trades.slice(-8).reverse().map(trade=>`<tr><td>${utc(trade.entryTime).slice(5,16)}</td><td>${utc(trade.exitTime).slice(5,16)}</td><td>${fmt(trade.pnl)}</td></tr>`).join('')}</tbody></table>`;}
$('#strategyButton').addEventListener('click',renderStrategy);

function renderLibrary(){panel('saved','Saved versions',`<p>Versions stay in this browser. Each result retains its market, timeframe, source, and last-bar cutoff.</p><div id="savedList"></div>`);const list=$('#savedList');for(const version of versions){const card=document.createElement('div');card.className='card';card.innerHTML=`<strong>${escapeHtml(version.name)}</strong><small>${escapeHtml(version.source?.label||'Unknown source')} · ${escapeHtml(version.source?.market||'—')} · ${escapeHtml(version.source?.timeframe||'—')} · ${version.source?.cutoff?utc(version.source.cutoff):'cutoff unknown'}</small><small>Fast ${version.fast} / Slow ${version.slow} · ${version.summary?.trades??'—'} closed trades · P&amp;L ${fmt(version.summary?.equity??0)}</small>`;const row=document.createElement('div');row.className='panel-row';const edit=document.createElement('button');edit.textContent='Load settings';edit.addEventListener('click',()=>{draft={name:version.name,fast:version.fast,slow:version.slow,feeBps:version.feeBps};lastResult=null;renderStrategy();});const remove=document.createElement('button');remove.textContent='Delete';remove.addEventListener('click',()=>{versions=versions.filter(item=>item.id!==version.id);save();renderLibrary();});row.append(edit,remove);card.append(row);list.append(card);}if(!versions.length)list.textContent='No saved studies yet. Run a paper backtest and save a version.';}
$('#libraryButton').addEventListener('click',renderLibrary);
function renderConnections(){const active=source?`${escapeHtml(source.label)} · ${escapeHtml(source.market)} · ${escapeHtml(source.timeframe)}<br>Loaded ${utc(source.loadedAt)} · last bar ${utc(source.cutoff)}`:'No chart source loaded.';panel('connections','Market data connections',`<div class="card"><strong>Active chart source</strong><p>${active}</p></div>${Object.entries(providerSpecs).map(([id,spec])=>`<div class="card"><strong>${escapeHtml(spec.label)}</strong><small>${escapeHtml(spec.type)} · public market bars through Vela</small><small>${source?.id===id?'ACTIVE SNAPSHOT':'AVAILABLE TO LOAD'}</small></div>`).join('')}<p class="warning">These are public market-data adapters. Broker login, balances, positions, fills, private streams, and order routing are not connected. A chart refresh requests a new snapshot; availability and freshness depend on the provider.</p>`);}
$('#connectionsButton').addEventListener('click',renderConnections);

function fileAsDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Could not read screenshot.'));reader.readAsDataURL(file);});}
$('#chatImage').addEventListener('change',()=>{$('#imageName').textContent=$('#chatImage').files[0]?.name||'No screenshot selected';});
$('#newChat').addEventListener('click',()=>{history=[];save();$('#chatStream').replaceChildren();addMessage('assistant','New Quant Lab conversation. Load a chart to include its source and cutoff.');});
for(const button of document.querySelectorAll('[data-prompt]'))button.addEventListener('click',()=>{$('#chatInput').value=button.dataset.prompt;$('#chatInput').focus();});
$('#chatInput').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();$('#chatForm').requestSubmit();}});
$('#chatForm').addEventListener('submit',async event=>{
  event.preventDefault();const prompt=$('#chatInput').value.trim();const file=$('#chatImage').files[0];if(!prompt&&!file)return;
  if(file&&file.size>8*1024*1024){addMessage('assistant','Screenshot must be 8 MB or smaller.',true);return;}
  const userText=prompt||'Please describe the attached chart screenshot as a provisional research observation.';
  addMessage('user',userText+(file?`\n[Attached ${file.name}]`:''));history.push({role:'user',content:userText});save();$('#chatInput').value='';$('#sendChat').disabled=true;
  const waiting=addMessage('assistant','Reading chart context…');
  try{
    const recent=bars.slice(-8).map(bar=>({time:utc(bar.time),open:bar.open,high:bar.high,low:bar.low,close:bar.close,volume:bar.volume}));
    const context=source?`Chart: ${source.label}; ${source.market}; ${source.timeframe}; loaded ${utc(source.loadedAt)}; last bar ${utc(source.cutoff)}. Public provider snapshot; freshness unverified. Last 8 OHLCV bars: ${JSON.stringify(recent)}. Treat structure as provisional; do not infer fills or broker account state.`:'No chart loaded. Do not infer current prices or chart structure.';
    const messages=history.slice(-23).map(item=>({role:item.role,content:item.content}));
    messages[messages.length-1]={role:'user',content:`${context}\n\nUser request: ${userText}`};
    const attachments=file?[{name:file.name,type:file.type,data:await fileAsDataUrl(file)}]:[];
    const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-6-luna',effort:'medium',context:'Quant Lab chart research',view:{tab:'Quant Lab',symbol:source?.market||'',timeframe:source?.timeframe||'',cutoff:source?Math.floor(source.cutoff/1000):null},messages,attachments})});
    const result=await response.json();if(!response.ok)throw new Error(result.error||`Chat request failed (${response.status}).`);
    waiting.remove();const answer=String(result.text||'No answer returned.');addMessage('assistant',answer);history.push({role:'assistant',content:answer});save();$('#chatImage').value='';$('#imageName').textContent='No screenshot selected';
  }catch(error){waiting.remove();addMessage('assistant',error.message,true);}finally{$('#sendChat').disabled=false;}
});

loadChart();
