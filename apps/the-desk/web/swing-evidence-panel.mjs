import {buildSwingEvidence,EvidenceArchive,EVIDENCE_VERSION} from './swing-evidence.mjs';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=v=>Number.isFinite(v)?v.toLocaleString(undefined,{maximumFractionDigits:2}):'—';
const stamp=v=>v?new Date(v).toISOString().replace('T',' ').slice(0,19)+' UTC':'—';
function table(head,rows,empty='No qualifying records in this configuration cohort yet.'){return rows.length?`<div class="table-scroll"><table><thead><tr>${head.map(h=>'<th>'+esc(h)+'</th>').join('')}</tr></thead><tbody>${rows.map(r=>'<tr>'+r.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')}</tbody></table></div>`:'<p class="small muted">'+esc(empty)+'</p>';}

export function setupSwingEvidence(){
  if(!$('#swingEvidence'))return;
  let cache=null,market=null,run=null,busy=false,report=null,url=null;
  async function get(path){const r=await fetch(path);if(!r.ok)throw Error('Research archive unavailable');return r.json();}
  function render(){
    if(!cache)return;
    const value=$('#evidenceCost').value.trim(),costBps=value===''?null:Number(value);
    try{report=buildSwingEvidence(cache.export(),{activeRun:run,costBps});}
    catch(e){$('#evidenceState').textContent=e.message;return;}
    const c=report.counts;
    $('#savedSwingCount').textContent=c.saved_completed_swings;
    $('#historicalSwingCount').textContent=c.warmup_swings;
    $('#boundarySwingCount').textContent=c.boundary_swings;
    $('#developingSwingCount').textContent=c.developing_swings;
    $('#swingCount').textContent=c.forward_swings;
    $('#setupCount').textContent=c.entered_opportunities;
    $('#outcomeCount').textContent=c.resolved_opportunities;
    $('#auditRemaining').textContent=Math.max(0,50-c.forward_swings);
    $('#evidenceProgress').innerHTML=report.milestones.map(m=>`<div><span>${esc(m.label)} · ${m.observed} / ${m.swings}</span><progress max="${m.swings}" value="${Math.min(m.observed,m.swings)}"></progress></div>`).join('');
    $('#evidenceState').textContent=`${market} · ${report.cohort?.config.swing_minutes||'—'}m swing engine on 1m source candles · cohort ${report.cohort_id.slice(0,10)} · ${report.run_ids.length} matching run(s). Saved completed legs = ${c.warmup_swings} historical + ${c.boundary_swings} crossed start + ${c.forward_swings} fully forward. Only fully forward legs advance the 50 / 200 audits.`;
    const v=report.coverage;
    $('#evidenceCoverage').textContent=`${v.observations} retained snapshots · ${number(v.observed_minutes)} minutes of recorded observation. First evidence ${stamp(v.first_observation)}; last evidence ${stamp(v.last_observation)}. Page refreshed ${stamp(Date.now())}.`;
    $('#evidenceExplanation').textContent=c.forward_swings===0&&c.saved_completed_swings>0?`Saved swings exist. The forward counter is zero because no complete A → B leg both began during observation and received the later opposite-pivot confirmation. ${c.developing_swings} latest leg(s) remain unfinalized. Historical and crossed-start legs stay visible below.`:'The latest leg remains provisional until the next opposite pivot confirms its endpoint. Historical context and crossed-start legs do not advance the forward audit.';
    $('#evidenceWarning').textContent=report.coverage.issues.join(' ');
    $('#evidenceCosts').textContent=costBps==null?'Gross results only. Venue fees, spread, slippage and funding are not known.':`Cost scenario: ${costBps} round-trip bps on entry notional. This is your assumption, not verified venue costs.`;
    $('#swingRecords').innerHTML=table(['Finalized / observed','Direction','A → B','Duration','Size · ticks','Scope'],report.swings.slice(-50).reverse().map(s=>[stamp(s.finalized_at),s.direction,number(s.start.price)+' → '+number(s.end.price),s.duration_minutes+'m',number(s.ticks),s.scope]));
    $('#attemptRecords').innerHTML=table(['First observed','Profile','Parent / candidate','Status','Reason'],report.attempts.filter(c=>c.scope==='FORWARD').slice(-50).reverse().map(c=>[stamp(c.first_seen),c.profile,c.parent+' / '+c.candidate_id,c.state,c.reason]));
    $('#outcomeRecords').innerHTML=table(['Signal observed','Profile','Initial stop / target','Fixed-bracket outcome','Gross R','Cost-scenario R','Sample'],report.plans.filter(p=>p.scope==='FORWARD').slice(-50).reverse().map(p=>[stamp(p.observed_at),p.profile,number(p.frozen.initial_stop)+' / '+number(p.frozen.target),p.outcome.status+' · '+(p.outcome.reason||''),number(p.outcome.gross_r),number(p.outcome.net_r),p.primary?'First entry for opportunity':'Diagnostic / no entry']),`${c.forward_attempts} live candidate(s), ${c.qualified_plans} recorded forward READY plans. No entered plan means no trade outcome, R result, or win rate to report.`);
    $('#patternRecords').innerHTML=table(['Profile / Jev pattern','Jev lean vs side','Entered / resolved','Target / stop / time','Ambiguous / pending','Mean gross R','Mean scenario R'],report.patterns.map(g=>[g.profile+' / '+g.pattern,g.model_relation,g.entered+' / '+g.resolved,g.targets+' / '+g.stops+' / '+g.time_exits,g.ambiguous+' / '+g.unresolved,number(g.mean_gross_r),number(g.mean_net_r)]),'No entered opportunities yet. Candle forecast scores above are separate from trade setup outcomes.');
    if(url)URL.revokeObjectURL(url);
    url=URL.createObjectURL(new Blob([JSON.stringify({...report,exported_at:new Date().toISOString()},null,2)],{type:'application/json'}));
    $('#exportEvidence').href=url;$('#exportEvidence').download=`${EVIDENCE_VERSION}-${market.split(':')[1]}-${report.cohort_id.slice(0,10)}.json`;
  }
  async function refresh(){
    if(busy)return;busy=true;const selected=$('#symbol').value;
    try{
      const status=await get('/api/swing/status'),nextRun=status.symbols[selected]?.run;
      if(!cache||market!==selected||run!==nextRun){
        const raw=await get('/api/swing/export?symbol='+encodeURIComponent(selected));
        if($('#symbol').value!==selected)return;
        cache=new EvidenceArchive(raw);market=selected;run=nextRun;
      }else{
        const history=await get('/api/swing/history?symbol='+encodeURIComponent(selected));
        if($('#symbol').value!==selected)return;
        cache.ingest(history);
      }
      render();
    }catch(e){$('#evidenceState').textContent='Audit refresh unavailable · '+e.message+'. Previous audit may be stale; collection runs independently.';}
    finally{busy=false;if(selected!==$('#symbol').value)void refresh();}
  }
  $('#evidenceCost').addEventListener('input',render);
  $('#evidenceCost').addEventListener('change',render);
  $('#applyEvidenceCost').addEventListener('click',render);
  $('#refreshEvidence').addEventListener('click',()=>{cache=null;void refresh();});
  $('#symbol').addEventListener('change',()=>{cache=null;void refresh();});
  void refresh();const timer=setInterval(refresh,30000);
  window.addEventListener('pagehide',()=>{clearInterval(timer);if(url)URL.revokeObjectURL(url);});
}
