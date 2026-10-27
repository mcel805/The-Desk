import {renderSwingWarnings} from './swing-warnings.mjs';
import {settingsController} from './swing-settings.mjs';
import {setupLearningPanel} from './swing-learning-panel.mjs';
import {reliabilityText,jevErrorText} from './jev-reliability.mjs';
import {setupLiquidityStudy} from './swing-study-panel.mjs';
import {setupSwingEvidence} from './swing-evidence-panel.mjs';
import {renderSwingVolume} from './swing-volume-panel.mjs';
import {renderJevCosts,setupJevCostPanel,markJevCostsUnavailable} from './jev-cost-panel.mjs';
import {withJevCosts} from './jev-cost-loader.mjs';
const $=s=>document.querySelector(s),esc=s=>String(s??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=v=>Number.isFinite(v)?(100*v).toFixed(1)+'%':'—',price=v=>Number.isFinite(v)?v.toLocaleString(undefined,{maximumFractionDigits:5}):'—',stamp=v=>v?new Date(v).toLocaleTimeString():'—';let loaded=null,busy=false,commandBusy=false;
async function api(path,body){const r=await fetch(path,{signal:AbortSignal.timeout(12000),...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const v=await r.json();if(!r.ok)throw Error(v.error||'Research service unavailable');return v;}
function table(headers,rows,empty='No observations yet. Start a run to collect evidence.'){return rows.length?`<div class="table-scroll"><table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:'<div class="empty">'+esc(empty)+'</div>';}
function symbol(){return $('#symbol').value;}
const settings=settingsController({form:$('#config'),market:symbol,request:api,
 onMessage:text=>{$('#settingsSync').textContent=text;$('#saveConfig').disabled=$('#config [name=quantity]').disabled;},
 onState:data=>{const s=data.symbols[symbol()];$('#start').disabled=commandBusy||s.running;$('#pause').disabled=commandBusy||!s.running;
 document.querySelector('[name=jev_enabled]').disabled=!data.jev_configured;}});

async function refresh(){if(busy)return;busy=true;try{const market=symbol();const [raw,history]=await Promise.all([api('/api/swing/status'),api('/api/swing/history?symbol='+encodeURIComponent(market))]);const data=await withJevCosts(raw);if(market!==symbol())return;const s=data.symbols[market],snap=s.snapshot,otherRunning=Object.keys(data.symbols).find(k=>k!==market&&data.symbols[k].running);
$('#singleObserver').textContent=otherRunning?'Observing '+otherRunning.split(':')[1]+' on 1m. Select that market and pause it before starting '+market.split(':')[1]+'.':'One shared 1m observer per Desk server. Extra charts and Lab tabs add no model requests. Hide/show only changes visibility; Pause stops collection.';
$('#connection').textContent='Connected · '+stamp(data.as_of)+' · '+Intl.DateTimeFormat().resolvedOptions().timeZone;$('#status').textContent=s.status;$('#keyStatus').textContent=data.jev_configured?'Key available. Enabling Jev sends public market snapshots to TypeSafe.':'Add your API key in Jev connection above. Tracker works without it.';
try{renderJevCosts(data,market);}catch{}
const storage=data.jev_key_storage;
$('#jevKeyState').textContent=data.jev_configured?({'macos_keychain':'Saved in macOS Keychain · automatically loaded on startup.','server_memory':'Current key is temporary. Choose Remember current key to save it securely.','environment':'Key supplied by the server environment. Choose Remember current key to store it locally.'}[data.jev_key_source]||'Key configured.')+' A successful Jev response verifies access.':storage?.error||'No saved key loaded. Paste your TypeSafe key once and save it to Keychain.';
if(!storage)$('#jevKeyState').textContent='Secure Keychain storage is ready to install. A Desk server restart is required; the current collection and temporary key are unchanged.';
$('#jevApiKey').disabled=!storage?.available;
$('#clearJevKey').disabled=commandBusy||!storage?.available;$('#loadJevKey').disabled=commandBusy||!storage?.available;
$('#rememberJevKey').hidden=!data.jev_configured||data.jev_key_source==='macos_keychain';$('#rememberJevKey').disabled=commandBusy||!storage?.available;$('#saveJevKey').disabled=commandBusy||!storage?.available;
document.querySelector('[name=jev_enabled]').disabled=!data.jev_configured;$('#start').disabled=commandBusy||s.running||!!otherRunning;$('#pause').disabled=commandBusy||!s.running;
$('#enableJev').hidden=!data.jev_configured||s.config.jev_enabled;$('#enableJev').disabled=commandBusy||s.running||!!otherRunning;
$('#evaluationState').textContent=!data.jev_configured?'Step 1: save a TypeSafe key to enable Jev.':!s.config.jev_enabled?'Key saved · Jev is OFF. Enable Jev & start to collect directional dots.':s.running?'Jev enabled · collecting evaluations for '+market.split(':')[1]+'.':'Jev enabled · paused. Start observations to collect fresh dots.';
$('#jevReliability').textContent=reliabilityText(history.reliability);
$('#openChart').href='/?swing_market='+encodeURIComponent(market);$('#openChart').textContent='Open '+market.split(':')[1]+' 1m chart ↗';
// Settings hydrate independently; a delayed history refresh never overwrites edits.
$('#start').textContent=document.querySelector('[name=jev_enabled]').checked?'Start Jev observations':'Start tracker only';
$('#export').href='/api/swing/export?symbol='+encodeURIComponent(market);$('#export').download='swing-research-'+market.split(':')[1]+'.json';
$('#state').innerHTML=`<strong>${esc(market)}</strong> · ${esc(s.detail)}<br>${snap?`Parent #${snap.parent_id} · ${snap.trend===1?'Higher highs / lows':snap.trend===-1?'Lower highs / lows':'Rotation / developing'} · confirmed cutoff ${stamp(snap.cutoff)}<br>Gross reserved risk: $${snap.reserved_session.toFixed(2)} this UTC day · tick ${price(snap.tick)}<br>`:''}Run ${esc(s.run?.slice(0,10)||'not started')} · ${s.config.cadence_seconds}s requested cadence`;
const j=s.jev,a=j?.answers,available=j?.status==='AVAILABLE'&&s.status==='OBSERVING';
renderSwingWarnings(snap?.warnings,{status:s.status,judgment:j});
renderSwingVolume(snap?.market_synth||history.predictions[0]?.state.market_synth,{status:s.status,judgment:j});
$('#jev').innerHTML=available?`<p class="small muted">Forecast candle opens ${stamp(s.prediction_bar)} · model returned in ${j.latency_ms} ms</p>${Object.entries(a.next_bar.probabilities).map(([k,v])=>`<div class="prob"><span>${esc(k.toUpperCase())}</span><div><i style="width:${100*v}%"></i></div><span>${pct(v)}</span></div>`).join('')}<p class="small muted">Distribution concentration: ${pct(a.next_bar.confidence)}. Not a trading win rate.</p>`:`<div class="empty">${esc(!s.config.jev_enabled?'DISABLED':!s.running?'PAUSED':j?.status||'WAITING')} · ${!data.jev_configured?'Awaiting server API key.':!s.config.jev_enabled?'Jev is OFF. Use Enable Jev & start above.':!s.running?'Paused. Start observations above.':j?.status==='UNAVAILABLE'?esc(jevErrorText(j))+' Waiting for the next sample.':j?.status==='STALE'?'Response arrived too late; waiting for a fresh evaluation.':'Waiting for the next evaluation slot.'}</div>`;
$('#pattern').innerHTML=available?`<strong>${esc(a.directional_lean.choice.toUpperCase())} LEAN · ${esc(a.pattern.choice.toUpperCase())}</strong><p>Long thesis fit: ${pct(a.long_fit.noul)}<br>Short thesis fit: ${pct(a.short_fit.noul)}</p><p class="small muted">These are separate yes/no judgments. Both can be weak or conflict. Pattern recognition alone does not confirm an entry.</p>`:'Observe → recognize → validate → record. No model answer is fabricated when Jev is disabled or stale.';
const m=history.metrics;$('#sampleCount').textContent=m.n;$('#accuracy').textContent=pct(m.accuracy);$('#baseline').textContent=pct(m.baseline_accuracy);$('#brier').textContent=m.brier==null?'—':m.brier.toFixed(3);$('#metricScope').textContent=m.scope+` ${m.observation_count} retained snapshots · ${m.primary_samples} primary · ${m.n} scored · ${m.unavailable_primary} unavailable/off · ${m.pending_primary} pending · ${m.unresolved_primary} unresolved · ${m.invalid_primary} invalid/late.`;
const savedCandidates=snap?.candidates||history.predictions[0]?.state.candidates||[];$('#candidateScope').textContent=snap?'Latest tracker snapshot · '+stamp(s.observed_at):'Latest saved snapshot · '+stamp(history.predictions[0]?.at)+' · archived after restart; full recorded attempts are in the audit above.';
$('#candidates').innerHTML=table(['ID / parent','Profile','State','A → B → C','Reason'],savedCandidates.slice(-10).reverse().map(c=>[`${c.id} / ${c.parent}`,c.profile,c.state,[c.a.price,c.b.price,c.c].map(price).join(' → '),c.reason]));
$('#plans').innerHTML=table(['Plan','Observed / eligible open','Side','Reference / initial stop / target','Outcome','Gross R'],(snap?.plans||[]).filter(p=>p.reason!=='WARMUP_END'&&p.signal_at>=(s.started||Infinity)).slice(-12).reverse().map(p=>[p.id,stamp(p.observed_at||p.signal_at)+' / '+stamp(p.eligible_open),p.side===1?'LONG':'SHORT',[p.reference,p.initial_stop,p.target].map(price).join(' / '),p.status,p.gross_r?.toFixed(2)||'—']));
$('#history').innerHTML=table(['Observed','Next candle','Sample','Jev forecast','Actual','Service'],history.predictions.slice(0,50).map(p=>[stamp(p.at),stamp(p.prediction_bar),p.primary_sample?'Primary':'Intrabar',p.response?.answers?.next_bar?.choice||'—',p.outcome?.label||(history.run_ended?'Unresolved · run ended':'Pending'),p.response?.status||p.usage_status||'Unresolved']));
$('#inspect').textContent=JSON.stringify(history.predictions[0]||{message:'Start a run to capture timestamped evidence.'},null,2);
}catch(e){$('#connection').textContent='Disconnected · '+e.message;$('#status').textContent='UNAVAILABLE';renderSwingWarnings(null,{status:'UNAVAILABLE'});$('#jev').innerHTML='<div class="empty">Service unavailable. Previous judgments withheld.</div>';renderSwingVolume(null);markJevCostsUnavailable();}finally{busy=false;}}
async function command(action,config){if(commandBusy)return;commandBusy=true;$('#error').textContent='';$('#runError').textContent='';try{await api('/api/swing/control',{action,symbol:symbol(),...(config?{config}:{})});loaded=null;settings.preview();}catch(e){$('#error').textContent=e.message;$('#runError').textContent=e.message;}finally{commandBusy=false;void settings.load().catch(()=>{});void refresh();}}
function formConfig(){return settings.values();}
async function startObservations(enable=false){if(commandBusy)return;commandBusy=true;$('#runError').textContent='';$('#start').disabled=true;$('#enableJev').disabled=true;
 try{await settings.start(enable);await settings.load();}
 catch(e){$('#runError').textContent=e.message;}
 finally{commandBusy=false;$('#start').disabled=false;void settings.load().catch(()=>{});void refresh();}}

async function configureKey(action='save'){
 if(commandBusy)return;commandBusy=true;
 $('#jevKeyError').textContent='';$('#saveJevKey').disabled=true;$('#clearJevKey').disabled=true;
 let key=action==='save'?$('#jevApiKey').value:'';$('#jevApiKey').value='';
 try{const result=await api('/api/swing/key',{action,...(action==='save'?{api_key:key}:{})});key='';$('#jevKeyState').textContent=result.detail;loaded=null;}
 catch(e){$('#jevKeyError').textContent=e.message;}
 finally{key='';commandBusy=false;await refresh();}
}
$('#jevKeyForm').onsubmit=e=>{e.preventDefault();void configureKey();};$('#clearJevKey').onclick=()=>configureKey('forget');
$('#rememberJevKey').onclick=()=>configureKey('remember');$('#loadJevKey').onclick=()=>configureKey('load');
document.querySelector('[name=jev_enabled]').onchange=e=>{settings.markDirty();$('#start').textContent=e.target.checked?'Start Jev observations':'Start tracker only';};
$('#reloadConfig').onclick=()=>{settings.preview();void settings.load().catch(()=>{});};
$('#config').onsubmit=e=>{e.preventDefault();command('configure',formConfig());};$('#start').onclick=()=>startObservations();$('#enableJev').onclick=()=>startObservations(true);$('#pause').onclick=()=>command('pause');$('#symbol').onchange=()=>{settings.preview();void settings.load().catch(()=>{});refresh();};void settings.load().catch(()=>{});refresh();setInterval(refresh,5000);setInterval(()=>{if(!settings.dirty)void settings.load().catch(()=>{});},15000);
setupSwingEvidence();
setupJevCostPanel();

setupLiquidityStudy();

setupLearningPanel({request:api,escape:esc});
