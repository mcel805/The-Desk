// Warning tags are measured evidence. Jev dots retain their own meaning/color.
export const warningCodes=['SLOW','CHOP','REJECT','EXTENDED','LEVEL','DIVERGENCE','EFFORT','STRUCTURE'];
export const warningDescriptions=[
 'Progress weakens against the preceding equal window','Low progress and overlapping candles',
 'Opposing wick and adverse close near the extreme','Delivery stretched from its base',
 'Known level contact and rejection','New extreme with weaker momentum',
 'High completed volume with little body progress','Micro break → protected break → failed reclaim / departure'];
// Six-pixel symbols encode warning family. The accessible title lists every grouped event.
const shapes={SLOW:[[-3,0],[3,0]],CHOP:[[-3,2],[-1,-2],[1,2],[3,-2]],REJECT:[[-3,-2],[2,-2],[2,2],[-1,-1]],EXTENDED:[[0,-3],[3,0],[0,3],[-3,0],[0,-3]],LEVEL:[[-3,-2],[3,-2],[0,-2],[0,3]],DIVERGENCE:[[-3,3],[0,0],[3,-3],[0,0],[3,3]],EFFORT:[[-2,3],[-2,0],[-2,3],[0,3],[0,-3],[0,3],[2,3],[2,-1]],STRUCTURE:[[-3,-2],[-3,-3],[3,-3],[3,-2],[3,2],[3,3],[-3,3],[-3,2]]};
export function warningGlyph(t){const points=shapes[t.feature]||shapes.SLOW;return points.map(([x,y],i)=>`${i?'L':'M'}${t.cx+x*.75} ${t.cy+y*.75}`).join(' ');}
const esc=s=>String(s??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=n=>Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:2}):'—';
const stamp=t=>Number.isFinite(t)?new Date(t).toISOString():'—';
export function projectWarningTags(e,{timeToX,priceToY,width,top,height,now=Date.now(),timeframe='1'}){
 if(String(timeframe)!=='1'||!e)return [];
 const clears=new Map((e.events||[]).filter(x=>x.kind==='CLEARED').map(x=>[x.episode,x]));
 const rows=(e.events||[]).filter(x=>['START','UPDATE'].includes(x.kind)&&warningCodes.includes(x.feature)&&Number.isFinite(x.price)&&Number.isInteger(x.at)&&x.at<=now&&Number.isInteger(x.originAt));
 const grouped=new Map();
 for(const x of rows){const key=x.at+':'+x.side;const g=grouped.get(key)||{at:x.at,price:x.price,side:x.side,events:[]};g.events.push({...x,cleared:clears.has(x.episode??x.seq)});grouped.set(key,g);}
 return [...grouped.values()].slice(-40).flatMap((g,index)=>{
  const bar=Math.floor(g.at/60000)*60000; // receipt/recognition time, never pivot origin
  const cx=timeToX(bar),cy=priceToY(g.price)+(g.side<0?-1:1)*(34+(index%3)*17);
  if(!Number.isFinite(cx)||!Number.isFinite(cy)||cx<4||cx>width-4||cy<top+4||cy>top+height-4)return [];
  const active=g.events.filter(x=>!x.cleared),label=g.events.map(x=>x.feature+(x.kind==='UPDATE'?':'+x.severity:'')+(x.cleared?' ✓':'' )).join(' · ');
  const detail=g.events.map(x=>`${x.feature}: ${warningDescriptions[warningCodes.indexOf(x.feature)]}; ${x.cleared?'cleared':'active at last snapshot'}; severity ${x.severity}; known ${stamp(x.knownAt)}; first seen ${stamp(x.firstObserved)}; ${x.scope||'FORWARD'}`).join('\n');
  return [{id:g.events.map(x=>x.seq).join('-'),cx,cy,anchorY:priceToY(g.price),features:g.events.map(e=>e.feature),label,color:active.length?(g.side<0?'#ffb55c':'#6acddd'):'#8993a5',detail}];
 });
}
export function warningPanelHTML(e,{status='PAUSED',judgment=null,now=Date.now()}={}){
 const c=e?.closed,p=e?.provisional;
 if(!c)return '<p class="small muted">No warning evidence in this saved run. Start a new observation run with the updated server.</p>';
 const fresh=p&&status==='OBSERVING'&&now-p.observedAt<=20000&&p.observedAt<=now+1000;
 const live=fresh?p:null;
 const model=status==='OBSERVING'&&judgment?.status==='AVAILABLE'?judgment.answers?.swing_warning_response:null;
 const values=['speedRatio','efficiency','rejection','extension','level','rsi','relativeVolume','protected'];
 const closedEpisodes=(c.episodes||[]).filter(Boolean).length;
 const rows=warningCodes.map((code,i)=>`<tr><td>${code}</td><td>${c.severity[i]==null?'Unavailable':c.severity[i]>0?'Warning '+c.severity[i]:'Clear'}</td><td>${num(c.values?.[values[i]])}</td><td>${live?(live.severity[i]==null?'Unavailable':live.severity[i]>0?'Provisional '+live.severity[i]:'Clear'):'—'}</td><td>${esc(warningDescriptions[i])}</td></tr>`).join('');
 const history=[...(e.events||[])].reverse().slice(0,40);
 return `<p class="state-copy"><strong>${c.side===1?'UP':c.side===-1?'DOWN':'UNRESOLVED'} delivery · ${esc(c.state.replaceAll('_',' '))}</strong> · ${esc(status)}<br>Closed cutoff ${esc(stamp(c.closedCutoff))} · observed ${esc(stamp(c.observedAt))}</p>
 <div class="kpis"><div class="kpi"><b>${num(c.pressure)}</b><span>Warning pressure / 100 · uncalibrated</span></div><div class="kpi"><b>${c.activeFamilies}/${c.availableFamilies}</b><span>Active / available capped families</span></div><div class="kpi"><b>${closedEpisodes}</b><span>Active warning episodes</span></div><div class="kpi"><b>${c.deliverySupport}</b><span>Delivery support observations</span></div></div>
 <p class="small muted">Coverage ${esc(c.coverage)} · local stage ${c.stage}. ${live?'Provisional receipt '+esc(stamp(live.observedAt)):'No fresh forming-bar warning sample.'} Four samples in a minute share one bar; they do not count as four independent outcomes.</p>
 <div class="table-scroll"><table><thead><tr><th>Code</th><th>Closed</th><th>Measured value</th><th>Forming</th><th>Meaning</th></tr></thead><tbody>${rows}</tbody></table></div>
 <p class="state-copy">Jev warning context · ${esc(model?.choice?.replaceAll('_',' ')||'Unavailable for this snapshot')}</p>
 <p class="small muted">Warnings clear when repaired. SLOW, CHOP and DIVERGENCE share one weight cap. A score of 70 does not mean a 70% chance of reversal. Historical tags show when evidence was recognized, including delayed receipts; WARMUP tags describe reconstructed history.</p>
 <details><summary>Warning event history (${history.length} recent)</summary><div class="table-scroll"><table><thead><tr><th>Recognized UTC</th><th>Event</th><th>Code</th><th>Episode</th><th>Scope / reason</th></tr></thead><tbody>${history.map(x=>`<tr><td>${esc(stamp(x.at))}</td><td>${esc(x.kind)}</td><td>${esc(x.feature||'SWING')}</td><td>${esc(x.episode??x.seq)}</td><td>${esc((x.scope||'FORWARD')+' '+(x.reason||''))}</td></tr>`).join('')}</tbody></table></div></details>`;
}
export function renderSwingWarnings(e,options){const el=document.querySelector('#swingWarningsBody');if(el)el.innerHTML=warningPanelHTML(e,options);}
