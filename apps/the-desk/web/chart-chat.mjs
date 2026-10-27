import {frame,requestedFrame,chartSnapshot,chartScope,sameScope,applyMarkup,restoreMarkup,owned,drawingScope,scopeKey} from './chart-chat-model.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 4h16v12H9l-5 4V4Z" stroke="currentColor" stroke-width="1.5"/><path d="m7 12 3-3 3 2 4-5" stroke="currentColor" stroke-width="1.5"/></svg>';
async function api(path,payload){const r=await fetch('/api/chart-chat/'+path,payload===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const d=await r.json();if(!r.ok)throw Error(d.error||'Chart chat unavailable');return d;}
export function setupChartChat({workspace,toast}){
 const ws=workspace(),button=document.createElement('button');button.id='chartChatButton';button.innerHTML=icon+'<span>Chart chat</span>';button.setAttribute('aria-expanded','true');document.querySelector('.header-spacer').before(button);
 const panel=document.createElement('aside');panel.id='chartChat';panel.setAttribute('aria-label','Trading chart chat');
 panel.innerHTML=`<header class="cc-header"><div class="cc-brand">${icon}<div><strong>Desk intelligence</strong><small>YOUR CHART. YOUR CONVERSATION.</small></div></div><button id="ccHistory" aria-label="Chat history" title="Chat history">◷</button><button id="ccNew" aria-label="New trading chat" title="New chat">＋</button><button id="ccClose" aria-label="Collapse chart chat" title="Collapse">‹</button></header>
 <div class="cc-context"><span class="cc-live"></span><strong id="ccMarket"></strong><span id="ccScope">Active chart</span></div>
 <div id="ccHistoryList" hidden></div><div id="ccMessages" role="log" aria-label="Trading conversation" aria-live="polite"></div>
 <div id="ccWork" hidden></div><div class="cc-canvas-tools"><button id="ccUndo" disabled>↶ Undo markup</button><button id="ccHide">◉ Hide AI</button><button id="ccClear">Clear AI drawings</button></div>
 <form id="ccForm"><textarea id="ccInput" aria-label="Ask the trading chat" placeholder="Ask about this chart, or tell me what to draw…" rows="3" maxlength="4000"></textarea><div class="cc-composer-bottom"><label title="Let the analyst research current outside facts"><input id="ccWeb" type="checkbox"> Web research</label><span class="cc-model">Codex · Auto</span><button type="button" id="ccStop" hidden>■ Stop</button><button id="ccSend" type="submit" aria-label="Send trading request">↑</button></div></form>
 <p class="cc-disclaimer">Chart research · verify the evidence before trading.</p><div id="ccResize" role="separator" aria-orientation="vertical" aria-label="Resize chart chat" tabindex="0"></div>`;
 document.querySelector('.desk-main').prepend(panel);
 const $=id=>panel.querySelector('#'+id),messages=$('ccMessages');let chatId=null,running=null,scope=null,epoch=0,polling=false,undo=null,hidden=false,pending=false;
 const seen=new Set(),applications=new Map();let contextChanged=false;
 const labels=new Map();
 function syncMarkup(){for(const cell of ws.cells()){const key=scopeKey(chartScope(ws,cell));for(const d of cell.chart.drawings.all().filter(owned)){const visible=!hidden&&drawingScope(d)===key;if(d.visible!==visible)cell.chart.drawings.update(d.id,{visible});}}}
 function attachScopes(){for(const cell of ws.cells()){if(labels.has(cell))continue;const overlay=document.createElement("div");overlay.className="cc-chart-labels";cell.host.append(overlay);labels.set(cell,overlay);cell.chart.on("market:changed",()=>{if(running)contextChanged=true;syncMarkup();});}}
 function paintLabels(){for(const [cell,overlay] of labels){if(!ws.cells().includes(cell)){overlay.remove();labels.delete(cell);continue;}const n=cell.chart.renderer?.renderer||cell.chart.rendererControl?.renderer,pane=n?.scene?.panes.get("price");if(!pane)continue;const placed=[];overlay.innerHTML=cell.chart.drawings.all().filter(d=>owned(d)&&d.visible!==false&&d.type==="hray").map(d=>{const label=d.text.value.split(" · ").at(-1),rank=Number(label.match(/^#(\d+)/)?.[1]);if(!rank||rank>6)return "";const y=n.coords.priceToY(d.anchors[0].price,pane.scale,pane.bounds);if(y<10||y>pane.bounds.top+pane.bounds.height-15||placed.some(v=>Math.abs(v-y)<18))return "";placed.push(y);return `<span style="top:${y}px;color:${d.style.lineColor}">${esc(label.replace(/Buy-side|Sell-side/g,"").trim())}</span>`;}).join("");}}
 function resize(){for(const c of ws.cells())c.chart.resize();}
 function open(show){panel.hidden=!show;button.setAttribute('aria-expanded',String(show));localStorage.setItem('desk.chart-chat.open',String(show));resize();if(show)$('ccInput').focus();}
 function context(){const s=chartScope(ws);$('ccMarket').textContent=s.symbol.split(':').at(-1)+' · '+s.timeframe;$('ccMarket').title=s.symbol;$('ccScope').textContent=running?'Run pinned to captured chart':'Active chart';}
 function empty(){messages.innerHTML=`<div class="cc-welcome"><div class="cc-orbit">✧</div><span class="cc-eyebrow">THE CHART IS YOUR CANVAS</span><h1>What do you see?<br>Let’s work it out.</h1><p>Explore a market, compare the evidence,<br>and put your ideas on the chart.</p><div class="cc-prompts"><button data-prompt="On the one-minute chart, draw me a volume profile for every completed swing."><span>▥</span>Profile every swing<small>Volume · 1 minute</small></button><button data-prompt="On the 30-minute chart, draw the liquidity levels and tell me which levels have the strongest evidence and why."><span>≋</span>Find the liquidity<small>Rank the evidence · 30 minutes</small></button><button data-prompt="Ask RIDER and Spider to explain the active chart, the missing context and what would confirm or invalidate the next move."><span>⌁</span>Read this chart<small>Structure · scenarios · invalidation</small></button></div><div class="cc-team"><span>R</span><span>S</span><div>RIDER + Spider<small>Specialists working behind your chat</small></div></div></div>`;
  for(const b of messages.querySelectorAll('[data-prompt]'))b.onclick=()=>{$('ccInput').value=b.dataset.prompt;$('ccForm').requestSubmit();};}
 function user(text){if(messages.querySelector('.cc-welcome'))messages.innerHTML='';const d=document.createElement('article');d.className='cc-message cc-user';d.innerHTML='<div class="cc-message-label">YOU<button class="cc-edit" aria-label="Reuse this message">Edit &amp; resend</button></div><p></p>';d.querySelector('p').textContent=text;d.querySelector('.cc-edit').onclick=()=>{$('ccInput').value=text;$('ccInput').focus();};messages.append(d);scroll();}
 function scroll(){messages.scrollTop=messages.scrollHeight;}
 function status(text,error=false){$('ccWork').hidden=false;$('ccWork').classList.toggle('cc-error',error);$('ccWork').textContent=text;}
 function controls(){const busy=!!running||pending;$('ccSend').disabled=busy;$('ccStop').hidden=!running;$('ccNew').disabled=busy;$('ccUndo').disabled=!undo||busy;$('ccClear').disabled=busy;$('ccHide').disabled=busy;context();}
 function render(r){
  if(seen.has(r.id))return;seen.add(r.id);
  const d=document.createElement('article');d.className='cc-message cc-assistant';d.dataset.run=r.id;
  const source=r.snapshot,method=r.result?.method||[];
  const links=(r.sources||[]).filter(url=>{try{return new URL(url).protocol==='https:';}catch{return false;}});
  d.innerHTML=`<div class="cc-message-label">${icon} DESK <span>${esc(r.status==='complete'?r.application:r.status)}</span></div><p class="cc-answer"></p>
   ${r.result?.drawings?.length?`<div class="cc-result"><span>◇</span><strong>${r.result.drawings.length} ${r.result.action==='volume_profile'?'swing profiles':'chart objects'}</strong><small>${esc(r.application||'Prepared · pending chart application')}</small></div>`:''}
   ${(r.reviews||[]).map(v=>`<details class="cc-review"><summary><i>${v.agent[0]}</i>${esc(v.agent)} <span>Evidence review</span></summary><p>${esc(v.summary)}</p><p class="cc-muted">${esc(v.limitations)}</p></details>`).join('')}
   ${r.result?.action==='liquidity'?`<div class="cc-levels">${r.result.evidence.slice(0,6).map(e=>`<div><strong>#${e.rank} · ${e.price.toLocaleString(undefined,{maximumFractionDigits:4})}</strong><span>${e.side==='high'?'Buy-side':'Sell-side'} · ${e.touches} reaction(s)</span><small>${esc(e.reason)}</small></div>`).join('')}</div>`:''}
   <details class="cc-evidence"><summary>Source & method</summary><p>${esc(source?.symbol)} · ${esc(source?.timeframe)} · UTC<br>Completed cutoff ${source?esc(new Date(source.completedCutoff).toISOString()):'unavailable'}<br>${source?.bars?.length||0} completed bars · ${source?.gaps||0} gaps<br>Snapshot created ${source?esc(new Date(source.cutoff).toISOString()):'unavailable'} · refresh manually</p><p>${esc(method.join('\n'))}</p><code>${esc(source?.sha256?.slice(0,16))}</code>${links.map((url,i)=>`<a target="_blank" rel="noopener noreferrer" href="${esc(url)}">Research source ${i+1} ↗</a>`).join('')}</details>
   <div class="cc-reply-actions"><button data-copy>Copy</button><button data-rate="helpful" aria-label="Helpful reply">♡ Helpful</button><button data-rate="unhelpful" aria-label="Unhelpful reply">Improve</button></div><div class="cc-followups"></div>`;
  d.querySelector('.cc-answer').innerHTML=esc(r.answer||r.error||'No response.').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>');
  d.querySelector('[data-copy]').onclick=()=>navigator.clipboard.writeText(r.answer||r.error||'').catch(()=>toast('Clipboard unavailable',true));
  for(const b of d.querySelectorAll('[data-rate]'))b.onclick=()=>{localStorage.setItem('desk.chart-chat.rating.'+r.id,b.dataset.rate);b.textContent=b.dataset.rate==='helpful'?'♥ Helpful':'Feedback noted';if(b.dataset.rate==='unhelpful'){$('ccInput').value='Please improve your previous answer: ';$('ccInput').focus();}};
  for(const text of r.followups||[]){const b=document.createElement('button');b.textContent=text;b.onclick=()=>{$('ccInput').value=text;$('ccInput').focus();};d.querySelector('.cc-followups').append(b);}
  messages.append(d);scroll();
 }
 async function apply(r,runEpoch){
  if(runEpoch!==epoch)return;
  const existing=applications.get(r.id);if(existing){render(await api('applied',{id:r.id,sha256:r.snapshot.sha256,outcome:existing}));return;}
  const cell=ws.cells().find(c=>c.id===r.snapshot.cellId);
  let outcome='Analysis complete · no chart changes';
  if(r.result?.drawings.length||r.result?.action==='clear'){
   if(contextChanged||!cell||!sameScope(r.snapshot,chartScope(ws,cell))||!sameScope(scope,chartScope(ws))){outcome='Not applied · chart context changed';}
   else{
    const current=chartSnapshot(ws),byTime=new Map(current.bars.map(b=>[b.time,b]));
    // Never apply after a provider correction or history replacement at the same symbol.
    const unchanged=r.snapshot.bars.every(b=>{const x=byTime.get(b.time);return x&&['open','high','low','close','volume'].every(k=>x[k]===b[k]);});
    if(!unchanged)outcome='Not applied · source candles changed';
    else{const change=applyMarkup(cell.chart,r.result);undo={cell,change,scope:chartScope(ws,cell)};hidden=false;$('ccHide').textContent='◉ Hide AI';outcome=r.result.action==='clear'?'AI drawings cleared':`${change.ids.length} drawings applied to ${r.snapshot.timeframe}`;}
   }
  }
  syncMarkup();applications.set(r.id,outcome);
  const done=await api('applied',{id:r.id,sha256:r.snapshot.sha256,outcome});render(done);controls();
 }
 async function poll(){
  if(polling||!running)return;polling=true;const id=running,runEpoch=epoch;
  try{const r=await api('run?id='+id);if(id!==running||runEpoch!==epoch)return;
   if(r.status==='running'){$('ccWork').hidden=false;$('ccWork').innerHTML='<div class="cc-working"><span></span> Working with your chart</div>'+r.events.slice(-4).map(e=>`<div class="cc-step"><b>${esc(e.agent)}</b><span>${esc(e.message)}</span></div>`).join('');}
   else{if(r.status==='ready')await apply(r,runEpoch);else render(r);running=null;$('ccWork').hidden=true;controls();}
  }catch(e){status(e.message+' · retrying connection',true);}finally{polling=false;}
 }
 async function send(e){
  e.preventDefault();if(running||pending)return;const text=$('ccInput').value.trim();if(!text)return;
  pending=true;controls();const requestEpoch=++epoch;
  try{
   const target=ws.active,original=chartScope(ws),tf=requestedFrame(text),expectedFrame=tf?frame(tf):original.timeframe;
   if(tf&&frame(target.chart.market.timeframe)!==frame(tf)){
    ws.sync.set('timeframe',false);status('Opening '+frame(tf)+' on the active chart…');await target.chart.setMarket({timeframe:tf});await target.chart.ready();
   }
   await target.chart.ready();
   if(ws.active!==target||chartScope(ws).symbol!==original.symbol||chartScope(ws).timeframe!==expectedFrame)throw Error('Chart changed while loading. Send the request again on the intended chart.');
   const snap=chartSnapshot(ws);scope=chartScope(ws);contextChanged=false;const r=await api('send',{text,chatId,snapshot:snap,web:$('ccWeb').checked});
   if(requestEpoch!==epoch)return;chatId=r.chatId;localStorage.setItem('desk.chart-chat.last',chatId);user(text);$('ccInput').value='';running=r.id;status('Reading the active chart…');void poll();
  }catch(e){status(e.message,true);}finally{pending=false;controls();}
 }
 $('ccForm').onsubmit=send;
 $('ccInput').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('ccForm').requestSubmit();}};
 $('ccStop').onclick=async()=>{if(!running)return;const id=running;epoch++;running=null;status('Stopped. Pending chart changes discarded.');controls();try{await api('stop',{id});}catch(e){status('Chart changes stopped locally. Server cancellation is unconfirmed: '+e.message,true);}};
 $('ccNew').onclick=()=>{epoch++;chatId=null;seen.clear();localStorage.removeItem('desk.chart-chat.last');empty();$('ccWork').hidden=true;$('ccInput').focus();};
 $('ccClose').onclick=()=>open(false);button.onclick=()=>open(panel.hidden);
 $('ccUndo').onclick=()=>{if(!undo)return;if(!ws.cells().includes(undo.cell)||!sameScope(undo.scope,chartScope(ws,undo.cell)))return toast('Return to the original chart before undoing this markup.',true);restoreMarkup(undo.cell.chart,undo.change);undo=null;syncMarkup();controls();};
 $('ccHide').onclick=()=>{hidden=!hidden;syncMarkup();$('ccHide').textContent=hidden?'◉ Show AI':'◉ Hide AI';};
 $('ccClear').onclick=()=>{const cell=ws.active;undo={cell,scope:chartScope(ws),change:applyMarkup(cell.chart,{action:'clear',drawings:[]})};controls();};
 $('ccHistory').onclick=async()=>{const list=$('ccHistoryList');list.hidden=!list.hidden;if(list.hidden)return;try{const data=await api('history');list.innerHTML=data.chats.map(c=>`<button data-chat="${c.id}">${esc(c.title)}<small>${new Date(c.updated*1000).toLocaleDateString()}</small></button>`).join('')||'<p>No saved conversations.</p>';for(const b of list.querySelectorAll('[data-chat]'))b.onclick=()=>load(b.dataset.chat);}catch(e){status(e.message,true);}};
 async function load(id){if(running||pending)return toast('Stop the current reply before switching chats.',true);try{const data=await api('history?chatId='+id);epoch++;chatId=id;seen.clear();messages.innerHTML='';for(const r of data.runs){user(r.text);if(r.status==='running'){running=r.id;scope=r.snapshot;void poll();}else if(r.status==='ready'){r.application='Saved analysis · markup not reapplied';render(r);}else render(r);}if(!data.runs.length)empty();$('ccHistoryList').hidden=true;localStorage.setItem('desk.chart-chat.last',id);controls();}catch(e){status(e.message,true);}}
 let startX=0,startW=0;
 $('ccResize').onpointerdown=e=>{startX=e.clientX;startW=panel.offsetWidth;const move=e=>{panel.style.width=Math.max(290,Math.min(620,startW+e.clientX-startX))+'px';resize();};const up=()=>{localStorage.setItem('desk.chart-chat.width',panel.style.width);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);};
 $('ccResize').onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){panel.style.width=Math.max(290,Math.min(620,panel.offsetWidth+(e.key==='ArrowRight'?20:-20)))+'px';resize();}};
 const savedWidth=parseInt(localStorage.getItem('desk.chart-chat.width'));if(savedWidth)panel.style.width=Math.max(290,Math.min(620,savedWidth))+'px';
 ws.on('cell:active',()=>{if(running)contextChanged=true;context();});ws.on('cell:created',()=>{attachScopes();context();});attachScopes();syncMarkup();setInterval(paintLabels,200);setInterval(()=>{context();void poll();},1300);
 empty();open(localStorage.getItem('desk.chart-chat.open')!=='false'&&innerWidth>850);const saved=localStorage.getItem('desk.chart-chat.last');if(saved)void load(saved);return {open};
}
