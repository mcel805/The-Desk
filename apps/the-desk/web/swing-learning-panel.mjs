export function setupLearningPanel({request,escape}){
 const $=s=>document.querySelector(s);let busy=false;
 async function refresh(){if(busy)return;busy=true;try{const r=await request('/api/swing/lab');
  $('#labLearningState').textContent=r.error?'Review delayed · '+r.error+' · collection remains separate.':`${r.message||'Review pending.'} ${r.at?'Last review '+new Date(r.at).toLocaleString():''}`;
  $('#labLearningCounts').textContent=`${r.runs_reviewed??0} retained runs reviewed · ${r.snapshots??0} snapshots · ${r.forward_bars??0} forward candles · ${r.recorded_campaigns??0} recorded contacts · ${r.recorded_resolved_plans??0} resolved study outcomes`;
  $('#labLearningTrials').innerHTML=(r.decisions||[]).map(d=>`<p><strong>${escape(d.symbol)} · ${escape(d.stage)} · ${escape(d.factor)}</strong><br>${escape(d.decision)} · ${d.summary.resolved_contacts} resolved paired contacts across ${d.summary.days} UTC days. ${d.summary.unresolved_or_unmatched} incomplete/unmatched.</p>`).join('')||'<p>Waiting for a new frozen experiment. Previous data is reviewed as retrospective evidence.</p>';
  $('#labLearningIntent').textContent=r.intent?.enabled?'Automatic lab enabled · new runs recover after gaps and server restarts. Pause stops automatic collection.':'Automatic recovery paused. Start automatic lab enables recovery after gaps and server restarts.';
  $('#labLearningPolicies').textContent=(r.policies||[]).map(p=>`${p.symbol}: reference ${p.factor}=${p.baseline[p.factor]}, challenger ${p.factor}=${p.challenger[p.factor]} · ${p.stage}`).join('\n');
 }catch(e){$('#labLearningState').textContent='Review status unavailable · '+e.message;}finally{busy=false;}}
 $('#refreshLearningLab').onclick=refresh;refresh();setInterval(refresh,15000);
}
