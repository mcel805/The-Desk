const workbench = document.querySelector('#biasWorkbench');
const symbolSelect = document.querySelector('#biasSymbol');
const timeframeSelect = document.querySelector('#biasTimeframe');
const status = document.querySelector('#biasRunStatus');
const report = document.querySelector('#biasReport');
const chart = document.querySelector('#biasChart');
let storedSymbols = [];

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = value => Number.isFinite(Number(value)) ? new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(Number(value)) : '—';
const stamp = value => value ? new Intl.DateTimeFormat(undefined,{year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(Number(value)*1000)) : '—';

function populateTimeframes() {
  const item=storedSymbols.find(entry=>entry.symbol===symbolSelect.value);
  const available=item?.timeframes.filter(entry=>entry.available&&entry.bars>=40)||[];
  timeframeSelect.replaceChildren(...available.map(entry=>new Option(`${entry.timeframe} · ${entry.bars} bars`,entry.timeframe)));
  if(!available.length)timeframeSelect.add(new Option('Need at least 40 stored bars',''));
}

async function loadSymbols() {
  try {
    const response=await fetch('./api/symbols');if(!response.ok)throw new Error(`Catalog HTTP ${response.status}`);
    storedSymbols=(await response.json()).symbols||[];
    const available=storedSymbols.filter(item=>item.timeframes.some(entry=>entry.available&&entry.bars>=40));
    symbolSelect.replaceChildren(...available.map(item=>new Option(item.label,item.symbol)));
    if(!available.length)symbolSelect.add(new Option('No stored history with enough bars',''));
    const preferred=available.find(item=>/MYM/i.test(item.symbol))||available[0];
    if(preferred){symbolSelect.value=preferred.symbol;populateTimeframes();timeframeSelect.value=preferred.timeframes.find(tf=>tf.available&&tf.bars>=40&&tf.timeframe==='5M')?.timeframe||timeframeSelect.options[0]?.value||'';}
  } catch(error) { symbolSelect.replaceChildren(new Option('Catalog unavailable',''));status.textContent=`Stored data catalog unavailable: ${error.message}`;status.classList.add('error'); }
}

function renderChart(data) {
  const bars=(data.bars||[]).slice(-220),points=data.points||[],swings=data.swings||[],events=data.events||[];
  if(!bars.length){chart.innerHTML='<text x="40" y="60" fill="#b9c7cf">No closed bars available.</text>';return;}
  const left=36,top=24,w=790,h=418,right=895,step=w/Math.max(1,bars.length-1);
  const min=Math.min(...bars.map(x=>x.low)),max=Math.max(...bars.map(x=>x.high)),pad=(max-min||1)*.07,lo=min-pad,hi=max+pad;
  const xIndex=bars.map(x=>x.time),idx=time=>{let l=0,r=xIndex.length-1;while(l<r){let m=(l+r)>>1;if(xIndex[m]<time)l=m+1;else r=m;}return l;};
  const X=i=>left+i*step,Y=p=>top+(hi-p)/(hi-lo)*h,body=Math.max(1,Math.min(4,step*.58)),out=[];
  for(let t=0;t<=5;t++){const y=top+t*h/5,p=hi-t*(hi-lo)/5;out.push(`<line class="bias-grid" x1="${left}" y1="${y}" x2="${left+w}" y2="${y}"/><text class="liquidity-axis-label" x="${left+w+12}" y="${y+4}">${esc(num(p))}</text>`);}
  bars.forEach((bar,i)=>{const x=X(i),up=bar.close>=bar.open,oy=Y(bar.open),cy=Y(bar.close),color=up?'#71c9b3':'#e98283';out.push(`<g class="liquidity-candle ${up?'up':'down'}"><line x1="${x}" y1="${Y(bar.high)}" x2="${x}" y2="${Y(bar.low)}" stroke="${color}"/><rect x="${x-body/2}" y="${Math.min(oy,cy)}" width="${body}" height="${Math.max(1,Math.abs(cy-oy))}" fill="${color}"/></g>`);});

  const latestHigh=[...swings].reverse().find(s=>s.side==='HIGH'&&s.time>=bars[0].time);
  const latestLow=[...swings].reverse().find(s=>s.side==='LOW'&&s.time>=bars[0].time);
  for(const [s,klass] of [[latestHigh,'high'],[latestLow,'low']])if(s){const x=X(idx(s.time)),y=Y(s.price);out.push(`<line class="bias-pivot ${klass}" x1="${x}" y1="${y}" x2="${left+w}" y2="${y}"/><text class="bias-tag ${klass}" x="${x+3}" y="${y-5}">${klass==='high'?'last confirmed swing high':'last confirmed swing low'}</text>`);}
  for(const swing of swings.filter(s=>s.time>=bars[0].time)){const x=X(idx(swing.time)),y=Y(swing.price),high=swing.side==='HIGH';out.push(`<circle class="bias-swing ${high?'high':'low'}" cx="${x}" cy="${y}" r="3.2"><title>${swing.side} ${num(swing.price)} · confirmed ${stamp(swing.confirmedTime)}</title></circle>`);}
  for(const event of events.filter(e=>e.time>=bars[0].time)){const x=X(idx(event.time)),y=Y(event.price),bull=event.direction==='BULLISH';out.push(`<path class="bias-break ${bull?'bull':'bear'}" d="M${x-5},${y+(bull?8:-8)} L${x},${y} L${x+5},${y+(bull?8:-8)}"/><text class="bias-event-tag ${bull?'bull':'bear'}" x="${x+6}" y="${y+(bull?-6:14)}">${event.kind}</text>`);}
  out.push(`<text class="liquidity-time-label" x="${left}" y="${top+h+22}">${esc(stamp(bars[0].time))}</text><text class="liquidity-time-label" text-anchor="end" x="${left+w}" y="${top+h+22}">${esc(stamp(bars.at(-1).time))}</text>`);chart.innerHTML=out.join('');
}

function render(data) {
  const point=data.points?.at(-1)||{},displayBias=data.overallBias||point.bias||'MIXED',tone=displayBias==='BULLISH'?'bull':displayBias==='BEARISH'?'bear':'mixed';
  const mismatch=point.legacyBias&&point.legacyBias!=='MIXED'&&point.bias!=='MIXED'&&point.legacyBias!==point.bias;
  document.querySelector('#biasHeadline').innerHTML=`<span class="bias-direction ${tone}">${esc(displayBias)}</span><div><strong>${esc(data.overallReason||point.phase||'NO CONFIRMED DIRECTION')}</strong><small>${mismatch?'Prior-period sweep context conflicts with structure':`Selected ${esc(point.bias||'MIXED')} · ${esc(data.higherTimeframe||'Higher TF')} ${esc(data.higherStructure?.bias||'UNAVAILABLE')} · ${esc(data.timeframeAlignment||'')}`}</small></div><span class="bias-unscored">UNSCORED · NO PROBABILITY</span>`;
  const sources=data.sources?.length?data.sources.map(s=>`${esc(s.source)} · ${esc(s.dataset_id)} · ${s.derived?'derived':'native'} · retrieved ${esc(s.retrieved_at||'unknown')} · SHA-256 ${esc(s.source_sha256||'unavailable')}`).join('<br>'):'No source records found';
  document.querySelector('#biasMeta').innerHTML=`<strong>Instrument / timeframe:</strong> ${esc(data.symbol)} / ${esc(data.timeframe)} · <strong>Closed-bar cutoff:</strong> ${esc(stamp(data.confirmedCutoff))} · latest stored bar excluded ${esc(stamp(data.excludedLatestStoredBar))}<br><strong>Settings:</strong> pivots ${data.settings.pivot_length} bars each side · sweep buffer ${num(data.sweepBuffer)} · acceptance buffer ${num(data.acceptanceBuffer)} · tick size ${num(data.tickSize)}${data.tickSize==null?' (unknown; buffers are zero)':''}<br><strong>Sources:</strong> ${sources}<br><strong>Snapshot SHA-256:</strong> ${esc(data.dataSnapshotHash)} · rights ${esc(data.sourceRights)} · ${esc(data.measurementState)}`;
  document.querySelector('#biasStructureRead').textContent=`${point.structure||'MIXED'} swing sequence · ${point.phase||'No confirmed direction'} · last confirmed high ${num(point.lastSwingHigh?.price)} · low ${num(point.lastSwingLow?.price)}`;
  document.querySelector('#biasHigherRead').textContent=`${data.higherTimeframe||'Higher timeframe'}: ${data.higherStructure?.bias||'UNAVAILABLE'} · ${data.timeframeAlignment||'No alignment read'} · cutoff ${stamp(data.higherStructure?.cutoff)}`;
  document.querySelector('#biasLiquidityRead').textContent=`${point.legacyBias||'MIXED'} · ${point.legacyReason||'No prior-period levels available'}`;
  document.querySelector('#biasProtectedRead').textContent=point.activeBreak?.protectedPrice==null?'Not established':`${point.activeBreak.direction==='BULLISH'?'Bullish':'Bearish'} break reference ${num(point.activeBreak.protectedPrice)} · swing time ${stamp(point.activeBreak.protectedTime)}`;
  const events=[...(data.events||[])].slice(-12).reverse();
  document.querySelector('#biasEvents').innerHTML=`<div class="bias-event-head"><strong>STRUCTURE EVENTS</strong><span>${data.events?.length||0} confirmed breaks</span></div>${events.map(e=>`<article class="bias-event-row ${e.direction==='BULLISH'?'bull':'bear'}"><b>${esc(e.kind)} · ${esc(e.direction)}</b><span>close through ${num(e.price)}</span><small>${stamp(e.time)} · pivot ${stamp(e.levelTime)}${e.protectedPrice!=null?` · protected swing ${num(e.protectedPrice)}`:''}</small></article>`).join('')||'<p class="liquidity-empty">No confirmed close-through events in this window.</p>'}`;
  renderChart(data);report.hidden=false;
  status.textContent=data.status==='insufficient_history'?'Not enough confirmed bars for this pivot setting.':`${data.barsUsed} closed bars reviewed · ${data.swings.length} confirmed swings · ${data.events.length} confirmed structure breaks. This is descriptive context, not a tested forecast.`;
  status.classList.toggle('error',data.status!=='ready');
}

document.addEventListener('click',event=>{if(event.target.closest('[data-open-bias]')){window.setActiveToolBeltIndicator?.('bias');workbench.hidden=false;workbench.scrollIntoView({behavior:'smooth',block:'start'});}});
document.querySelector('#closeBiasWorkbench')?.addEventListener('click',()=>{workbench.hidden=true;});
symbolSelect?.addEventListener('change',populateTimeframes);
document.querySelector('#biasForm')?.addEventListener('submit',async event=>{
  event.preventDefault();if(!symbolSelect.value||!timeframeSelect.value)return;
  status.textContent='Calculating confirmed swing structure and prior-period context…';status.classList.remove('error');report.hidden=true;
  const q=new URLSearchParams({symbol:symbolSelect.value,timeframe:timeframeSelect.value,pivot_length:document.querySelector('#biasPivotLength').value,sweep_buffer_ticks:document.querySelector('#biasSweepBuffer').value,acceptance_buffer_ticks:document.querySelector('#biasAcceptanceBuffer').value});
  try{const response=await fetch(`./api/tool-belt/bias?${q}`),data=await response.json();if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);render(data);}catch(error){status.textContent=`Bias read unavailable: ${error.message}`;status.classList.add('error');}
});
loadSymbols();
