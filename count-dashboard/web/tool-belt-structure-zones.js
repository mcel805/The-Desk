const workbench = document.querySelector('#structureZonesWorkbench');
const symbolSelect = document.querySelector('#structureZonesSymbol');
const timeframeSelect = document.querySelector('#structureZonesTimeframe');
const status = document.querySelector('#structureZonesRunStatus');
const report = document.querySelector('#structureZonesReport');
const chart = document.querySelector('#structureZonesChart');
let catalog = [];

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmt = value => Number.isFinite(Number(value)) ? new Intl.NumberFormat('en-US',{maximumFractionDigits:3}).format(Number(value)) : '—';
const stamp = value => value ? new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(Number(value)*1000)) : '—';

function populateTimeframes() {
  const item = catalog.find(entry => entry.symbol === symbolSelect.value);
  const available = item?.timeframes.filter(entry => entry.available && entry.bars >= 32) || [];
  timeframeSelect.replaceChildren(...available.map(entry => new Option(`${entry.timeframe} · ${entry.bars} bars`, entry.timeframe)));
  if (!available.length) timeframeSelect.add(new Option('Need at least 32 stored bars', ''));
}

async function loadSymbols() {
  try {
    const response = await fetch('./api/symbols');
    if (!response.ok) throw new Error(`Catalog HTTP ${response.status}`);
    catalog = (await response.json()).symbols || [];
    const available = catalog.filter(item => item.timeframes.some(frame => frame.available && frame.bars >= 32));
    symbolSelect.replaceChildren(...available.map(item => new Option(item.label, item.symbol)));
    if (!available.length) symbolSelect.add(new Option('No stored history with enough bars', ''));
    const preferred = available.find(item => /MYM/i.test(item.symbol)) || available[0];
    if (preferred) symbolSelect.value = preferred.symbol;
    populateTimeframes();
    const frame = preferred?.timeframes.find(item => item.available && item.bars >= 32 && item.timeframe === '5M')
      || preferred?.timeframes.find(item => item.available && item.bars >= 32);
    if (frame) timeframeSelect.value = frame.timeframe;
  } catch (error) {
    symbolSelect.replaceChildren(new Option('Catalog unavailable', ''));
    status.textContent = `Stored data catalog unavailable: ${error.message}`;
    status.classList.add('error');
  }
}

function renderChart(data) {
  const bars = data.bars || [];
  if (!bars.length) { chart.innerHTML = '<text x="40" y="60" fill="#b9c7cf">No closed bars available.</text>'; return; }
  const visible = bars.slice(-420), firstTime = visible[0].time, lastTime = visible.at(-1).time;
  const zones = (data.zones || []).filter(zone => zone.createdTime <= lastTime && (zone.stateTime == null || zone.stateTime >= firstTime));
  const pools = (data.pools || []).filter(pool => pool.createdTime <= lastTime && (pool.stateTime == null || pool.stateTime >= firstTime));
  const swings = (data.swings || []).filter(swing => swing.time >= firstTime && swing.time <= lastTime);
  const events = (data.events || []).filter(event => event.time >= firstTime && event.time <= lastTime);
  const prices = visible.flatMap(bar => [bar.high,bar.low]);
  zones.forEach(zone => prices.push(zone.top,zone.bottom));
  pools.forEach(pool => prices.push(pool.price));
  let min=Math.min(...prices),max=Math.max(...prices);
  const pad=(max-min || Math.abs(max)*.002 || 1)*.07;min-=pad;max+=pad;
  const left=36,top=22,w=790,h=420,right=895,step=w/Math.max(1,visible.length-1);
  const xTime=value=>{let low=0,high=visible.length-1;while(low<high){const mid=(low+high)>>1;if(visible[mid].time<value)low=mid+1;else high=mid;}return left+low*step;};
  const yPrice=value=>top+(max-Number(value))/(max-min)*h;
  const bodyW=Math.max(1,Math.min(4,step*.58)),out=[];
  for(let tick=0;tick<=5;tick++){const y=top+tick*h/5,value=max-tick*(max-min)/5;out.push(`<line class="sz-grid" x1="${left}" y1="${y}" x2="${left+w}" y2="${y}"/><text class="liquidity-axis-label" x="${left+w+12}" y="${y+4}">${fmt(value)}</text>`);}
  for(const zone of zones){const x1=xTime(zone.originTime),terminal=['INVALIDATED','EXPIRED'].includes(zone.state),x2=terminal?xTime(zone.stateTime):left+w;if(x2<=x1)continue;const y=yPrice(zone.top),height=Math.max(1,Math.abs(yPrice(zone.bottom)-y));out.push(`<g class="sz-zone ${zone.side.toLowerCase()} ${zone.state.toLowerCase()}"><rect x="${x1}" y="${Math.min(y,yPrice(zone.bottom))}" width="${Math.max(1,x2-x1)}" height="${height}"/><title>${esc(zone.zoneId)} · ${zone.side} · ${zone.state} · ${fmt(zone.bottom)}–${fmt(zone.top)} · ${zone.touchCount} touches</title></g>`);}
  for(const pool of pools){const terminal=['RECLAIMED','ACCEPTED','EXPIRED'].includes(pool.state),x1=xTime(pool.firstMemberTime),x2=terminal?xTime(pool.stateTime):left+w,y=yPrice(pool.price);out.push(`<g class="sz-pool ${pool.side.toLowerCase()} ${pool.state.toLowerCase()}"><line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/><title>${esc(pool.poolId)} · equal ${pool.side.toLowerCase()} cluster · ${pool.state} · ${fmt(pool.price)} · ${pool.memberTimes.length} pivots</title></g>`);}
  for(let i=0;i<visible.length;i++){const bar=visible[i],x=left+i*step,up=bar.close>=bar.open,color=up?'#71c9b3':'#e98283',oy=yPrice(bar.open),cy=yPrice(bar.close);out.push(`<g class="sz-candle"><line x1="${x}" y1="${yPrice(bar.high)}" x2="${x}" y2="${yPrice(bar.low)}" stroke="${color}"/><rect x="${x-bodyW/2}" y="${Math.min(oy,cy)}" width="${bodyW}" height="${Math.max(1,Math.abs(cy-oy))}" fill="${color}"/></g>`);}
  for(const swing of swings){const x=xTime(swing.time),y=yPrice(swing.price);out.push(`<circle class="sz-swing ${swing.side.toLowerCase()}" cx="${x}" cy="${y}" r="2.4"><title>${swing.side} pivot ${fmt(swing.price)} · known ${stamp(swing.confirmedTime)}</title></circle>`);}
  const labels=events.slice(-14).map(event=>{const x=xTime(event.time),y=yPrice(event.price),bull=event.direction==='BULLISH';const c=bull?'bull':'bear';return `<g class="sz-event ${c}"><path d="M${x-5},${y+(bull?8:-8)} L${x},${y} L${x+5},${y+(bull?8:-8)}"/><text x="${x+5}" y="${y+(bull?-6:14)}">${esc(event.kind)}</text><title>${esc(event.kind)} ${esc(event.direction)} · close crossed ${fmt(event.price)} at ${stamp(event.time)}</title></g>`;});out.push(...labels);
  out.push(`<text class="liquidity-time-label" x="${left}" y="${top+h+22}">${esc(stamp(firstTime))}</text><text class="liquidity-time-label" text-anchor="end" x="${left+w}" y="${top+h+22}">${esc(stamp(lastTime))}</text>`);
  const tags=zones.filter(zone=>!['INVALIDATED','EXPIRED'].includes(zone.state)).slice(-7).map(zone=>({price:(zone.top+zone.bottom)/2,label:`${zone.sequence} ${zone.side}`,klass:zone.side.toLowerCase()})).concat(pools.filter(pool=>['OPEN','TESTED'].includes(pool.state)).slice(-4).map(pool=>({price:pool.price,label:`EQ ${pool.side}`,klass:'pool'})));
  const rows=tags.map(tag=>({tag,y:yPrice(tag.price)})).sort((a,b)=>a.y-b.y),labelGap=14;
  rows.forEach((row,index)=>{row.labelY=Math.max(top+7,index?rows[index-1].labelY+labelGap:top+7);});
  for(let i=rows.length-1;i>=0;i--)rows[i].labelY=Math.min(rows[i].labelY,top+h-5-(rows.length-1-i)*labelGap);
  rows.forEach(({tag,y,labelY})=>out.push(`<path class="sz-leader ${tag.klass}" d="M${left+w},${y} L${right},${labelY}"/><text class="sz-tag ${tag.klass}" x="${right+5}" y="${labelY+3}">${esc(tag.label)}</text>`));
  chart.innerHTML=out.join('');
}

function renderLists(data) {
  const eventRows=[...(data.events||[])].slice(-14).reverse();
  const zoneRows=[...(data.zones||[])].slice(-16).reverse();
  const poolRows=[...(data.pools||[])].slice(-12).reverse();
  document.querySelector('#structureZonesEventHead').textContent=`STRUCTURE EVENTS · ${data.events?.length||0} shown / ${data.itemCounts?.events||data.events?.length||0}`;
  document.querySelector('#structureZonesEvents').innerHTML=eventRows.map(item=>`<article class="sz-row"><strong>${esc(item.kind)} · ${esc(item.direction)}</strong><span>Close crossed ${fmt(item.price)}</span><small>${stamp(item.time)} · pivot ${stamp(item.levelTime)} · range ${fmt(item.displacementAtr)} ATR${item.zoneId?` · zone ${esc(item.zoneId)}`:` · ${esc(item.zoneReason)}`}</small></article>`).join('')||'<p class="liquidity-empty">No confirmed close-through events.</p>';
  document.querySelector('#structureZonesZoneHead').textContent=`ORIGIN ZONES · ${data.zones?.length||0} shown / ${data.itemCounts?.zones||data.zones?.length||0}`;
  document.querySelector('#structureZonesZones').innerHTML=zoneRows.map(item=>`<article class="sz-row ${item.side.toLowerCase()}"><strong>${esc(item.sequence)} · ${esc(item.side)} · ${esc(item.state)}</strong><span>${fmt(item.bottom)} – ${fmt(item.top)}</span><small>Origin ${stamp(item.originTime)} · created ${stamp(item.createdTime)} · ${item.touchCount} touches${item.firstTouchTime?` · first ${stamp(item.firstTouchTime)}`:''}</small></article>`).join('')||'<p class="liquidity-empty">No zones met the displacement rule.</p>';
  document.querySelector('#structureZonesPoolHead').textContent=`SWING POOLS · ${data.pools?.length||0} shown / ${data.itemCounts?.pools||data.pools?.length||0}`;
  document.querySelector('#structureZonesPools').innerHTML=poolRows.map(item=>`<article class="sz-row pool"><strong>${esc(item.side)} · ${esc(item.state)}</strong><span>${fmt(item.price)} · ${item.memberTimes.length} pivots</span><small>First ${stamp(item.firstMemberTime)} · last pivot ${stamp(item.memberTimes.at(-1))} · ±${fmt(item.tolerance)} price units</small></article>`).join('')||'<p class="liquidity-empty">No nearby confirmed swing pairs.</p>';
}

function render(data) {
  const stateNode=document.querySelector('#structureZonesState');
  stateNode.textContent=data.structure||'NEUTRAL';
  stateNode.className=`${(data.structure||'neutral').toLowerCase()}`;
  const sources=data.sources?.length?data.sources.map(item=>`${esc(item.source)} · ${esc(item.dataset_id)} · ${item.derived?'derived':'native'} · retrieved ${esc(item.retrieved_at||'unknown')} · SHA-256 ${esc(item.source_sha256||'unavailable')}`).join('<br>'):'No source rows found';
  document.querySelector('#structureZonesMeta').innerHTML=`<strong>Instrument / timeframe:</strong> ${esc(data.symbol)} / ${esc(data.timeframe)} · <strong>Closed-bar cutoff:</strong> ${stamp(data.confirmedCutoff)} · latest stored bar excluded ${stamp(data.excludedLatestStoredBar)}<br><strong>Settings:</strong> pivot ${data.settings.pivot_length} each side · origin ${data.settings.origin_lookback} bars · min displacement ${fmt(data.settings.min_displacement_atr)} ATR · equal-pool tolerance ${fmt(data.settings.equal_tolerance_atr)} ATR<br><strong>Sources:</strong> ${sources}<br><strong>Input SHA-256:</strong> ${esc(data.inputHash)} · rights ${esc(data.sourceRights)} · ${esc(data.measurementState)}`;
  renderChart(data);renderLists(data);report.hidden=false;
  status.textContent=data.status==='insufficient_history'?'Not enough closed history for these settings.':`${data.barsUsed} closed bars · ${data.itemCounts.events} structure events · ${data.itemCounts.zones} origin zones · ${data.itemCounts.pools} swing pools. Results are descriptive, not measured forecasts.`;
  status.classList.toggle('error',data.status!=='ready');
}

document.addEventListener('click',event=>{if(event.target.closest('[data-open-structure-zones]')){window.setActiveToolBeltIndicator?.('structure-zones');workbench.hidden=false;workbench.scrollIntoView({behavior:'smooth',block:'start'});}});
document.querySelector('#closeStructureZonesWorkbench')?.addEventListener('click',()=>{workbench.hidden=true;});
symbolSelect?.addEventListener('change',populateTimeframes);
document.querySelector('#structureZonesForm')?.addEventListener('submit',async event=>{
  event.preventDefault();if(!symbolSelect.value||!timeframeSelect.value)return;
  status.textContent='Calculating structure events, zones, and pivot pools from stored bars…';status.classList.remove('error');report.hidden=true;
  const q=new URLSearchParams({symbol:symbolSelect.value,timeframe:timeframeSelect.value,
    pivot_length:document.querySelector('#structureZonesPivotLength').value,
    origin_lookback:document.querySelector('#structureZonesOriginLookback').value,
    min_displacement_atr:document.querySelector('#structureZonesDisplacement').value,
    equal_tolerance_atr:document.querySelector('#structureZonesPoolTolerance').value});
  try{const response=await fetch(`./api/tool-belt/structure-zones?${q}`),data=await response.json();if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);render(data);}
  catch(error){status.textContent=`Structure Zones unavailable: ${error.message}`;status.classList.add('error');}
});
loadSymbols();
