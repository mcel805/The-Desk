const workbench = document.querySelector('#liquidityWorkbench');
const symbolSelect = document.querySelector('#liquiditySymbol');
const timeframeSelect = document.querySelector('#liquidityTimeframe');
const status = document.querySelector('#liquidityRunStatus');
const report = document.querySelector('#liquidityReport');
const chart = document.querySelector('#liquidityChart');
const levelsView = document.querySelector('#liquidityLevels');
let storedSymbols = [];
let lastReport = null;

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const number = value => new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(Number(value));
const timestamp = value => value ? new Intl.DateTimeFormat(undefined,{year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'short'}).format(new Date(Number(value)*1000)) : '—';

function populateTimeframes() {
  const item = storedSymbols.find(entry => entry.symbol === symbolSelect.value);
  const available = item?.timeframes.filter(entry => entry.available && entry.bars >= 32) || [];
  timeframeSelect.replaceChildren(...available.map(entry => new Option(`${entry.timeframe} · ${entry.bars} bars`, entry.timeframe)));
  if (!available.length) timeframeSelect.add(new Option('Need at least 32 stored bars', ''));
}

async function loadSymbols() {
  try {
    const response = await fetch('./api/symbols');
    if (!response.ok) throw new Error(`Catalog HTTP ${response.status}`);
    storedSymbols = (await response.json()).symbols || [];
    const available = storedSymbols.filter(item => item.timeframes.some(entry => entry.available && entry.bars >= 32));
    symbolSelect.replaceChildren(...available.map(item => new Option(item.label, item.symbol)));
    if (!available.length) symbolSelect.add(new Option('No stored history with enough bars', ''));
    const preferred = available.find(item => /MYM/i.test(item.symbol)) || available[0];
    if (preferred) symbolSelect.value = preferred.symbol;
    populateTimeframes();
    if (preferred) {
      const tf = preferred.timeframes.find(entry => entry.available && entry.bars >= 32 && entry.timeframe === '5M')
        || preferred.timeframes.find(entry => entry.available && entry.bars >= 32);
      if (tf) timeframeSelect.value = tf.timeframe;
    }
  } catch (error) {
    symbolSelect.replaceChildren(new Option('Catalog unavailable', ''));
    status.textContent = `Stored data catalog unavailable: ${error.message}`;
    status.classList.add('error');
  }
}

function timeIndex(bars, time) {
  let low = 0, high = bars.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (bars[middle].time < time) low = middle + 1;
    else high = middle;
  }
  if (!bars.length) return 0;
  if (low > 0 && Math.abs(bars[low-1].time-time) <= Math.abs(bars[low].time-time)) return low-1;
  return low;
}

function renderChart(data) {
  const bars = data.bars || [];
  if (!bars.length) { chart.innerHTML = '<text x="40" y="60" fill="#b9c7cf">No closed bars available.</text>'; return; }
  const visible = bars.slice(-420);
  const firstTime = visible[0].time, lastTime = visible.at(-1).time;
  const closedCutoff = lastTime + Number(data.barDurationSeconds || 0);
  const visibleLevels = (data.levels || []).filter(level => (level.brokenTime == null || level.brokenTime >= firstTime) && level.confirmedTime <= closedCutoff);
  const recent = visibleLevels.slice(-48);
  const rawPrices = visible.flatMap(bar => [bar.high,bar.low]);
  recent.forEach(level => rawPrices.push(level.price));
  let min = Math.min(...rawPrices), max = Math.max(...rawPrices);
  const padding = (max-min || Math.abs(max)*0.002 || 1) * 0.06;
  min -= padding; max += padding;
  const left=36, top=22, plotW=790, plotH=420, rightX=895, step=plotW/Math.max(1,visible.length-1);
  const xForTime = value => left + Math.max(0,Math.min(visible.length-1,timeIndex(visible,value))) * step;
  const yForPrice = value => top + (max-Number(value))/(max-min)*plotH;
  const bodyW = Math.max(1,Math.min(4,step*.58));
  const out=[];

  for (let tick=0;tick<=5;tick++) {
    const y=top+tick*plotH/5, value=max-tick*(max-min)/5;
    out.push(`<line class="liquidity-grid" x1="${left}" y1="${y}" x2="${left+plotW}" y2="${y}"/><text class="liquidity-axis-label" x="${left+plotW+12}" y="${y+4}">${esc(number(value))}</text>`);
  }

  for (const level of recent) {
    const x1=xForTime(level.confirmedTime), x2=level.broken ? xForTime(level.brokenTime) : left+plotW;
    if (x2 <= x1) continue;
    const y=yForPrice(level.price), broken=level.broken;
    const kind=level.kind.toLowerCase(), side=level.side.toLowerCase();
    const className=`liquidity-level ${kind} ${side} ${broken?'broken':'active'}`;
    out.push(`<g class="${className}" data-level-id="${esc(level.id)}"><line class="liquidity-edge" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/><title>${esc(level.id)} · ${esc(level.side)} ${esc(level.kind)} · ${broken?'broken':'active'} · ${esc(number(level.price))}</title></g>`);
  }

  for (let i=0;i<visible.length;i++) {
    const bar=visible[i], x=left+i*step, high=yForPrice(bar.high), low=yForPrice(bar.low), open=yForPrice(bar.open), close=yForPrice(bar.close);
    const up=bar.close>=bar.open, color=up?'#71c9b3':'#e98283';
    const bodyY=Math.min(open,close), bodyH=Math.max(1,Math.abs(close-open));
    out.push(`<g class="liquidity-candle ${up?'up':'down'}"><line x1="${x}" y1="${high}" x2="${x}" y2="${low}" stroke="${color}"/><rect x="${x-bodyW/2}" y="${bodyY}" width="${bodyW}" height="${bodyH}" fill="${color}"/></g>`);
  }

  // Only label the most recent levels; the complete ID and lifecycle stay in
  // the ledger beneath the plot so older levels do not turn the chart into fog.
  const tags=recent.filter(level => !level.broken).slice(-12).concat(recent.filter(level => level.broken).slice(-5));
  const rows=tags.map(level => ({level,y:yForPrice(level.price)})).sort((a,b)=>a.y-b.y);
  const labelGap=17;
  rows.forEach((row,index) => { row.labelY=Math.max(top+7,index?rows[index-1].labelY+labelGap:top+7); });
  for (let i=rows.length-1;i>=0;i--) rows[i].labelY=Math.min(rows[i].labelY,top+plotH-6-(rows.length-1-i)*labelGap);
  rows.forEach(({level,y,labelY}) => {
    const label=`${level.sequence} ${level.side} ${level.kind}`;
    out.push(`<path class="liquidity-leader ${level.broken?'broken':level.side.toLowerCase()}" d="M${left+plotW},${y} L${rightX},${labelY}"/><text class="liquidity-zone-tag ${level.broken?'broken':level.side.toLowerCase()}" x="${rightX+5}" y="${labelY+4}">${esc(label)}</text>`);
  });
  out.push(`<text class="liquidity-time-label" x="${left}" y="${top+plotH+22}">${esc(timestamp(firstTime))}</text><text class="liquidity-time-label" text-anchor="end" x="${left+plotW}" y="${top+plotH+22}">${esc(timestamp(lastTime))}</text>`);
  chart.innerHTML=out.join('');
}

function renderLedger(data) {
  const all=data.levels||[];
  const rows=[...all].sort((a,b)=>b.confirmedTime-a.confirmedTime).slice(0,36);
  const active=all.filter(level=>!level.broken).length, broken=all.length-active;
  levelsView.innerHTML=`<div class="liquidity-ledger-head"><strong>LEVEL LEDGER</strong><span>${active} active · ${broken} broken · ${all.length} mapped</span></div>
    <div class="liquidity-level-list">${rows.map(level=>`<article class="liquidity-level-row ${level.broken?'is-broken':''}"><span class="level-stamp ${level.kind.toLowerCase()} ${level.side.toLowerCase()}">${level.sequence}</span><strong>${level.side} ${level.kind}</strong><span>${esc(number(level.price))}</span><span class="level-state">${level.broken?'BROKEN':'ACTIVE'}</span><small>${esc(level.id)} · pivot ${esc(timestamp(level.pivotTime))} · confirmed ${esc(timestamp(level.confirmedTime))}${level.brokenTime?` · broken ${esc(timestamp(level.brokenTime))}`:''}</small></article>`).join('')||'<p class="liquidity-empty">No confirmed levels in this window.</p>'}</div>`;
}

function renderResult(data) {
  lastReport=data;
  const sources=data.sources?.length ? data.sources.map(source=>`${esc(source.source)} · ${esc(source.dataset_id)} · ${source.derived?'derived timeframe':'native timeframe'} · retrieved ${esc(source.retrieved_at||'unknown')} · SHA-256 ${esc(source.source_sha256||'unavailable')}`).join('<br>') : 'No source record found';
  document.querySelector('#liquidityMeta').innerHTML=`<strong>Instrument / timeframe:</strong> ${esc(data.symbol)} / ${esc(data.timeframe)} · <strong>Closed-bar cutoff:</strong> ${esc(timestamp(data.confirmedCutoff))} · latest stored bar excluded: ${esc(timestamp(data.excludedLatestStoredBar))} · times shown in browser timezone<br><strong>Settings:</strong> external ${data.settings.external_length} bars each side · internal ${data.settings.internal_length} bars each side · convergence ${data.settings.convergence_atr} × mean TR(14) · <strong>Method:</strong> ${esc(data.methodId)} v${esc(data.methodVersion)}<br><strong>Sources:</strong> ${sources}<br><strong>Input SHA-256:</strong> ${esc(data.inputHash)} · <strong>Rights:</strong> ${esc(data.sourceRights)} · <strong>Learning eligibility:</strong> ${data.learningEligible?'eligible':'not approved'} · <strong>Outcomes:</strong> unscored`;
  renderChart(data); renderLedger(data); report.hidden=false;
  status.textContent=data.status==='insufficient_history'?'Not enough confirmed history to map swing levels.':`${data.levels.length} ${data.methodId} levels mapped from ${data.barsUsed} closed stored bars. Historical research only; outcomes are unscored.`;
  status.classList.toggle('error',data.status!=='ready');
  document.querySelector('#replayLiquidityBreak').disabled=!data.levels.some(level=>level.broken);
}

document.addEventListener('click',event=>{
  if(event.target.closest('[data-open-liquidity]')){
    window.setActiveToolBeltIndicator?.('liquidity');
    workbench.hidden=false;
    workbench.scrollIntoView({behavior:'smooth',block:'start'});
  }
});
document.querySelector('#closeLiquidityWorkbench')?.addEventListener('click',()=>{workbench.hidden=true;});
symbolSelect?.addEventListener('change',populateTimeframes);
document.querySelector('#liquidityForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!symbolSelect.value||!timeframeSelect.value)return;
  status.textContent='Mapping confirmed swing levels from stored bars…';status.classList.remove('error');report.hidden=true;
  const params=new URLSearchParams({symbol:symbolSelect.value,timeframe:timeframeSelect.value,
    external_length:document.querySelector('#liquidityExternalLength').value,
    internal_length:document.querySelector('#liquidityInternalLength').value,
    convergence_atr:document.querySelector('#liquidityConvergenceAtr').value});
  try{
    const response=await fetch(`./api/tool-belt/liquidity?${params}`),data=await response.json();
    if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);
    renderResult(data);
  }catch(error){status.textContent=`Liquidity map unavailable: ${error.message}`;status.classList.add('error');}
});

document.querySelector('#copyLiquiditySnapshot')?.addEventListener('click',async()=>{
  if(!lastReport)return;
  const reference={
    indicator_id:lastReport.indicatorId,
    method_id:lastReport.methodId,
    method_version:lastReport.methodVersion,
    symbol:lastReport.symbol,
    timeframe:lastReport.timeframe,
    source_id:`${lastReport.methodId}:${lastReport.symbol}:${lastReport.timeframe}:${String(lastReport.inputHash||'').slice(0,16)}`,
    source_asof:new Date(Number(lastReport.confirmedCutoff)*1000).toISOString(),
    input_hash:lastReport.inputHash,
    source_datasets:lastReport.sources||[],
    source_rights:lastReport.sourceRights,
    learning_eligible:lastReport.learningEligible,
    note:'Study reference only. Add to a frozen Indicator Agent protocol only after source rights and the independent outcome definition are approved.'
  };
  try{
    await navigator.clipboard.writeText(JSON.stringify(reference,null,2));
    status.textContent='Study reference copied. It records method, cutoff, source datasets, and input hash; it contains no scored outcome.';
    status.classList.remove('error');
  }catch(error){status.textContent=`Could not copy study reference: ${error.message}`;status.classList.add('error');}
});

document.querySelector('#replayLiquidityBreak')?.addEventListener('click',()=>{
  if(!lastReport)return;
  const latest=[...(lastReport.levels||[])].filter(level=>level.broken).sort((a,b)=>b.brokenTime-a.brokenTime).slice(0,4);
  for(const level of latest){
    const group=[...chart.querySelectorAll('.liquidity-level')].find(node=>node.dataset.levelId===level.id);
    if(!group)continue;
    const line=group.querySelector('.liquidity-edge');if(!line)continue;
    const x=Number(line.getAttribute('x2')),y=Number(line.getAttribute('y1'));
    const rays=Array.from({length:8},(_,i)=>{const angle=i*Math.PI/4,dx=Math.cos(angle),dy=Math.sin(angle);return `<line class="hit-ray" x1="${x}" y1="${y}" x2="${x+dx*20}" y2="${y+dy*20}"/>`;}).join('');
    const burst=document.createElementNS('http://www.w3.org/2000/svg','g');burst.setAttribute('class','liquidity-hit-burst');burst.innerHTML=`<circle cx="${x}" cy="${y}" r="3"/>${rays}`;chart.append(burst);
    window.setTimeout(()=>burst.remove(),850);
  }
});

loadSymbols();
