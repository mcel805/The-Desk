const $=selector=>document.querySelector(selector);
const number=value=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(value??0);
const pct=value=>value==null?'—':`${(value*100).toFixed(1)}%`;
const money=value=>value==null?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value);
const time=value=>value?new Date(value).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'—';
const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function summaryCards(data){
  const cards=[
    ['Zones',data.totals.zones,'immutable forecasts'],
    ['Trials',data.totals.trials,'one-contract shadow each'],
    ['Resolved',data.totals.outcomes,'target / stop / timeout'],
    ['Open',data.totals.unresolved_trials,'awaiting outcome'],
    ['Broker fills',data.totals.fills,'execution truth records'],
  ];
  $('#summary').innerHTML=cards.map(([label,value,note])=>`<article class="stat"><div class="stat-label">${label}</div><div class="stat-value">${number(value)}</div><div class="stat-note">${note}</div></article>`).join('');
}

function timeframeRows(rows){
  $('#timeframeRows').innerHTML=rows.map(row=>{
    const progress=Math.min(100,(row.clean_resolved/400)*100);
    const targetCi=row.target_rate_wilson_95?`${pct(row.target_rate_wilson_95[0])}–${pct(row.target_rate_wilson_95[1])}`:'CI pending';
    const expectancyCi=row.expectancy_r_day_block_bootstrap_95?`${row.expectancy_r_day_block_bootstrap_95[0].toFixed(2)}–${row.expectancy_r_day_block_bootstrap_95[1].toFixed(2)}R`:'block CI pending';
    return `<tr><td class="tf">${safe(row.timeframe)}</td><td>${number(row.zones)}</td><td>${number(row.touched)}</td><td>${number(row.trials)}</td><td>${number(row.clean_resolved)}</td><td>${pct(row.target_rate)}<div class="muted">95% ${targetCi}</div></td><td>${row.expectancy_r==null?'—':`${row.expectancy_r.toFixed(2)}R`}<div class="muted">${money(row.net_dollars)} · ${expectancyCi}</div></td><td><div class="bar" aria-label="${progress.toFixed(0)} percent of 400-trial gate"><i style="width:${progress}%"></i></div><div class="muted">${number(row.clean_resolved)} / 400</div></td></tr>`;
  }).join('');
}

function scoreCards(scores){
  $('#forecastScores').innerHTML=['attraction','reaction'].map(name=>{
    const score=scores[name];
    if(!score)return `<div class="score"><div class="eyebrow">${name}</div><strong>Not scored</strong><span>Waiting for matched outcomes</span></div>`;
    const skillCi=score.skill_block_bootstrap_95?`${pct(score.skill_block_bootstrap_95[0])}–${pct(score.skill_block_bootstrap_95[1])}`:'block CI pending';
    return `<div class="score"><div class="eyebrow">${name}</div><strong>${score.brier.toFixed(3)}</strong><span>Brier · n=${score.n}<br>base rate ${pct(score.base_rate)} · skill ${score.skill==null?'—':pct(score.skill)}<br>95% ${skillCi}</span></div>`;
  }).join('');
}

function policy(data){
  const entries=Object.entries(data.executable_policy);
  $('#policyCounts').innerHTML=entries.length?entries.map(([name,count])=>`<span class="pill ${name==='eligible_first_in'?'good':'warn'}">${safe(name.replaceAll('_',' '))}: ${number(count)}</span>`).join(''):'<div class="empty">No trials yet.</div>';
}

function calibration(data){
  $('#calibration').innerHTML=['attraction','reaction'].map(name=>{
    const bins=data.calibration[name];
    if(!bins.length)return `<div class="cal-group"><h3>${name}</h3><div class="empty">Waiting for matched outcomes.</div></div>`;
    const rows=bins.map(bin=>`<div class="cal-row"><span>${Math.round(bin.lower*100)}–${Math.round(bin.upper*100)}%</span><div class="cal-track"><i class="cal-pred" style="width:${bin.mean_probability*100}%"></i><i class="cal-obs" style="width:${bin.observed_rate*100}%"></i></div><span>${pct(bin.observed_rate)} · n=${bin.n}</span></div>`).join('');
    return `<div class="cal-group"><h3>${name}</h3>${rows}</div>`;
  }).join('');
}

function events(rows){
  $('#eventRows').innerHTML=rows.length?rows.map(row=>`<tr><td>${time(row.event_time)}</td><td class="muted">${safe(row.zone_id).slice(0,22)}</td><td class="tf">${safe(row.timeframe)}</td><td>${safe(row.side)}</td><td>${safe(row.zone_class)}</td><td class="event-${safe(row.event_type)}">${safe(row.event_type)}</td><td>${row.price==null?'—':number(row.price)}</td></tr>`).join(''):'<tr><td colspan="7" class="empty">No forecast events yet. Configure the TradingView alert or post an example payload.</td></tr>';
}

function userLevelStudy(data){
  const stats=data||{plans:0,open:0,resolved:0,win_rate:null,avg_r:null,gross_dollars:0,timeframes:[]};
  $('#userLevelSummary').innerHTML=[
    ['Plans',number(stats.plans)],['Open',number(stats.open)],['Resolved',number(stats.resolved)],
    ['Win rate',pct(stats.win_rate)],['Average R',stats.avg_r==null?'—':`${stats.avg_r.toFixed(2)}R`],['Gross P&L',money(stats.gross_dollars)],
  ].map(([label,value])=>`<div class="user-level-stat"><small>${safe(label)}</small><strong>${safe(value)}</strong></div>`).join('');
  $('#userLevelRows').innerHTML=(stats.timeframes||[]).map(row=>`<tr><td class="tf">${safe(row.timeframe)}</td><td>${number(row.plans)}</td><td>${number(row.resolved)}</td><td>${pct(row.win_rate)}</td><td>${row.avg_r==null?'—':`${row.avg_r.toFixed(2)}R`}</td><td>${row.mfe_points==null?'—':`${number(row.mfe_points)} pts`}</td><td>${row.mae_points==null?'—':`${number(row.mae_points)} pts`}</td></tr>`).join('');
  $('#userLevelContextRows').innerHTML=(stats.context_cohorts||[]).map(row=>`<tr><td>${safe(row.dimension.replaceAll('_',' '))}</td><td>${safe(row.value.replaceAll('_',' '))}</td><td>${number(row.plans)}</td><td>${number(row.resolved)}</td><td>${pct(row.win_rate)}</td><td>${row.avg_r==null?'—':`${row.avg_r.toFixed(2)}R`}</td><td>${row.mfe_points==null?'—':`${number(row.mfe_points)} pts`}</td><td>${row.mae_points==null?'—':`${number(row.mae_points)} pts`}</td></tr>`).join('')||'<tr><td colspan="8" class="empty">Context results appear when journal plans are saved.</td></tr>';
}

async function load(){
  try{
    const response=await fetch('/api/dashboard',{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    $('#serviceStatus').textContent=`${data.status} · ${time(data.generated_at)}`;
    $('.status-dot').style.background='var(--green)';
    const warning=$('#warning');
    warning.hidden=data.costs_confirmed;
    warning.textContent=data.costs_confirmed?'':`Commission is still a placeholder ($${data.economics.round_turn_cost.toFixed(2)} round turn). Set LIQUIDITY_LAB_ROUND_TURN_COST_USD before treating net results as economic evidence.`;
    summaryCards(data);timeframeRows(data.timeframes);scoreCards(data.forecast_scores);policy(data);calibration(data);userLevelStudy(data.user_suggested_levels);events(data.recent_events);scientistJournal(data.scientist_journal);
  }catch(error){
    $('#serviceStatus').textContent='Disconnected';
    $('.status-dot').style.background='var(--red)';
    const warning=$('#warning');warning.hidden=false;warning.textContent=`Dashboard failed to load: ${error.message}`;
  }
}

$('#refresh').addEventListener('click',load);
load();
setInterval(load,30000);

const chatStream=$('#chatStream');
const agentComposer=$('#agentComposer');
const agentMessage=$('#agentMessage');
const agentPortrait=$('#agentPortrait');
const agentWorkStatus=$('#agentWorkStatus');
const sendAgentMessage=$('#sendAgentMessage');
const chatModel=$('#labChatModel');
const chatEffort=$('#labChatEffort');
const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const chatHistory=[];
chatModel.value=localStorage.getItem('batty-chat-model')||'gpt-6-luna';
chatEffort.value=localStorage.getItem('batty-chat-effort')||'medium';
chatModel.addEventListener('change',()=>localStorage.setItem('batty-chat-model',chatModel.value));
chatEffort.addEventListener('change',()=>localStorage.setItem('batty-chat-effort',chatEffort.value));

function contextFor(prompt){
  const text=prompt.toLowerCase();
  if(/75|accuracy|predict|scientist/.test(text))return ['SCIENTIST OBJECTIVE','75% is the goal, not current performance. Each MYM, MCL, and MGC call is frozen inside a daily run and must resolve by that futures session close.'];
  if(/news|headline|macro|today|impact/.test(text))return ['NEWS CHECK','No live headline feed is attached here. I’ll keep today’s catalyst list blank until a dated source is connected.'];
  if(/block|next stage|gate|ready/.test(text))return ['DAILY FORECAST GATE','Approve the licensed outcome source, holiday calendar, dated-contract roll rules, and MCL/MGC risk contracts before unattended scheduling.'];
  if(/custom|dashboard|layout|rearrange|hide|show|pin/.test(text))return ['DESK SETUP','A saved dashboard layout can change what you see first; it should never rewrite the underlying research results.'];
  return ['LAB FACT','MYM retains its named 30-tick study cohort. MCL and MGC must receive their own frozen risk rules before either asset produces a scored prediction.'];
}

function addUserMessage(text){
  const item=document.createElement('article');
  item.className='chat-message user-message';
  item.innerHTML=`<div class="message-body"><p>${safe(text)}</p><div class="message-meta">YOU <span>·</span> just now</div></div>`;
  chatStream.append(item);
}

function addTaskLine(text){
  const line=document.createElement('div');
  line.className='agent-task-line';
  line.textContent=text;
  chatStream.append(line);
  return line;
}

function addContextCard(prompt,before){
  const [label,copy]=contextFor(prompt);
  const card=document.createElement('article');
  card.className='chat-message assistant-message';
  const avatar=document.createElement('span');
  avatar.className='message-avatar message-avatar-muted';
  avatar.textContent='i';
  const body=document.createElement('div');
  body.className='message-body';
  const note=document.createElement('div');
  note.className='finance-note';
  const head=document.createElement('div');
  head.className='finance-note-head';
  head.innerHTML='<span class="finance-spark">✳</span>';
  const title=document.createElement('span');
  title.textContent=label;
  const badge=document.createElement('span');
  badge.className='sample-tag';
  badge.textContent='WHILE I CHECK';
  const paragraph=document.createElement('p');
  paragraph.textContent=copy;
  head.append(title,badge);
  note.append(head,paragraph);
  body.append(note);
  card.append(avatar,body);
  chatStream.insertBefore(card,before);
}

function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

async function typeResponse(text,body){
  const paragraph=document.createElement('p');
  paragraph.className='agent-streaming';
  body.prepend(paragraph);
  const step=reduceMotion?text.length:Math.max(1,Math.ceil(text.length/130));
  for(let i=0;i<text.length;i+=step){
    paragraph.textContent=text.slice(0,i+step);
    chatStream.scrollTop=chatStream.scrollHeight;
    await sleep(reduceMotion?0:17);
  }
  paragraph.classList.remove('agent-streaming');
}

async function replyTo(prompt){
  addUserMessage(prompt);
  document.querySelector('.quick-prompts')?.remove();
  const message=document.createElement('article');
  message.className='chat-message assistant-message';
  message.innerHTML='<span class="message-avatar"><img src="favicon.svg" alt=""></span><div class="message-body"><div class="typing-indicator" aria-label="Batty is thinking"><i></i><i></i><i></i></div></div>';
  chatStream.append(message);
  const body=message.querySelector('.message-body');
  const typing=message.querySelector('.typing-indicator');
  agentPortrait.classList.add('is-working');
  sendAgentMessage.disabled=true;
  agentWorkStatus.textContent='Reading your note';
  const taskLine=addTaskLine('Picking out what matters to your desk…');
  chatStream.insertBefore(taskLine,message);
  chatStream.scrollTop=chatStream.scrollHeight;
  await sleep(reduceMotion?0:550);
  agentWorkStatus.textContent='Checking the lab context';
  taskLine.textContent='Attaching visible research context and asking your selected model…';
  addContextCard(prompt,message);
  try{
    chatHistory.push({role:'user',content:prompt});
    const response=await fetch('http://127.0.0.1:8770/api/chat',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:chatModel.value,effort:chatEffort.value,context:'Liquidity Lab · active workspace',view:{tab:'Liquidity Lab',selection:document.querySelector('.content-shell main')?.innerText?.slice(0,6000)||'Liquidity Lab'},messages:chatHistory.slice(-24)})
    });
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||`Chat request failed (${response.status}).`);
    chatHistory.push({role:'assistant',content:result.text});
    if(typing.isConnected)typing.remove();
    agentWorkStatus.textContent='Writing it in trader terms';
    taskLine.textContent='Putting the answer into desk language…';
    await typeResponse(result.text,body);
    const meta=document.createElement('div');meta.className='message-preview-label';
    meta.textContent=`${chatModel.selectedOptions[0].textContent} · Codex / ChatGPT · visible Lab context · no Firstmate crew dispatch`;
    body.append(meta);
    taskLine.textContent='✓ Model reply received · visible Lab context attached';taskLine.classList.add('task-complete');
  }catch(error){
    chatHistory.pop();if(typing.isConnected)typing.remove();
    const paragraph=document.createElement('p');paragraph.textContent=error.message||'Batty could not reach the local chat service.';body.prepend(paragraph);
    taskLine.textContent='Chat connection needs attention';taskLine.classList.add('task-complete');
  }
  agentPortrait.classList.remove('is-working');
  agentWorkStatus.textContent='Ready when you are';
  sendAgentMessage.disabled=false;
  agentMessage.focus();
}

agentComposer.addEventListener('submit',event=>{
  event.preventDefault();
  const prompt=agentMessage.value.trim();
  if(!prompt||sendAgentMessage.disabled)return;
  agentMessage.value='';
  replyTo(prompt);
});

document.querySelectorAll('[data-prompt]').forEach(button=>button.addEventListener('click',()=>{
  if(sendAgentMessage.disabled)return;
  replyTo(button.dataset.prompt);
}));

$('#mobileDashboardToggle').addEventListener('click',event=>{
  const showingDashboard=document.querySelector('.app-shell').classList.toggle('dashboard-focus');
  event.currentTarget.textContent=showingDashboard?'Back to Batty':'Open lab';
});

const scientistRoleDialog=$('#scientistRoleDialog');
$('#scientistAgent').addEventListener('click',()=>scientistRoleDialog.showModal());
$('#closeScientistRole').addEventListener('click',()=>scientistRoleDialog.close());
scientistRoleDialog.addEventListener('click',event=>{
  if(event.target===scientistRoleDialog)scientistRoleDialog.close();
});

const scientistZone=$('#scientistZone');
const scientistTargetZone=$('#scientistTargetZone');
const scientistRun=$('#scientistRun');
const scientistRunForm=$('#scientistRunForm');
const scientistRuns=$('#scientistRuns');
const forecastForm=$('#scientistForecastForm');
const outcomeDialog=$('#scientistOutcomeDialog');
const outcomeForm=$('#scientistOutcomeForm');
let scientistLevels=[];
let scientistDailyRuns=[];

function localDateTime(date){
  const shifted=new Date(date.getTime()-date.getTimezoneOffset()*60000);
  return shifted.toISOString().slice(0,16);
}

function nextWeekdayDate(){
  const date=new Date();
  do{date.setDate(date.getDate()+1)}while(date.getDay()===0||date.getDay()===6);
  return date.toISOString().slice(0,10);
}

function runAsset(run){return run?.asset_code||'';}
function levelAsset(level){
  const text=String(level?.contract||level?.symbol||'').toUpperCase();
  return ['MYM','MCL','MGC'].find(asset=>text===asset||text.startsWith(asset)||text.includes(`:${asset}`))||'';
}

function scientistStepMarkup(run,step){
  const latest=step.latest||{};
  const output=latest.artifact_url?`<a href="${safe(latest.artifact_url)}" target="_blank" rel="noopener">${safe(latest.output_title||'Open output')}</a>`:'';
  const latestNote=latest.summary?`<div class="scientist-step-latest"><b>Latest:</b> ${safe(latest.summary)} ${output}</div>`:'';
  return `<details class="scientist-step" data-status="${safe(step.status)}"><summary><small>${String(step.sequence).padStart(2,'0')} · ${safe(step.status)}</small><strong>${safe(step.label)}</strong><span class="step-status">${latest.event_time?time(latest.event_time):'not started'}</span></summary><form class="scientist-step-form" data-run-id="${safe(run.run_id)}" data-step-key="${safe(step.step_key)}"><label>Status<select name="event_type"><option value="started">Started</option><option value="completed">Completed</option><option value="blocked">Blocked</option><option value="reopened">Reopened</option><option value="skipped">Skipped</option></select></label><label>Owner<input name="owner" value="Chief Scientist" required></label><label class="wide-field">Evidence / decision summary<textarea name="summary" rows="3" required placeholder="Observations, decision, uncertainty, blocker, and reason"></textarea></label><label>Output title<input name="output_title" placeholder="Preparation manifest"></label><label>Clickable output URL<input name="output_url" placeholder="https://… or /local-route"></label><label class="wide-field">Output document<textarea name="output_document" rows="4" placeholder="Paste the durable Markdown/text output here"></textarea></label>${latestNote}<button type="submit">Append step event</button><span role="status"></span></form></details>`;
}

function scientistRunMarkup(run){
  const steps=run.steps.map(step=>scientistStepMarkup(run,step)).join('');
  return `<article class="scientist-run-card" data-run-id="${safe(run.run_id)}"><header class="scientist-run-head"><div><h3>${safe(run.asset_code)} · ${safe(run.trade_date)} · ${safe(run.contract)}</h3><p>${safe(run.session_open)} → ${safe(run.session_close)} · ${safe(run.method_version)} · <span class="scientist-flat-rule">flat by close</span></p></div><span class="run-progress">${run.completed_steps}/${run.total_steps} · ${safe(run.status)}</span><a href="${safe(run.release_url)}" target="_blank" rel="noopener">Open daily release</a></header><form class="scientist-close-form" data-run-id="${safe(run.run_id)}"><label>Session-close price<input name="close_price" type="number" step="any" placeholder="Required when a forecast was touched"></label><label>Approved resolution source<input name="resolution_source" required placeholder="Licensed feed / verified chart"></label><button type="submit">Force all forecasts flat</button><span role="status"></span></form><div class="scientist-step-list">${steps}</div></article>`;
}

function renderScientistRuns(){
  scientistRun.innerHTML='<option value="">Choose a daily asset run</option>'+scientistDailyRuns.filter(run=>run.status!=='complete').map(run=>`<option value="${safe(run.run_id)}">${safe(run.trade_date)} · ${safe(run.asset_code)} · ${safe(run.contract)}</option>`).join('');
  scientistRuns.innerHTML=scientistDailyRuns.length?scientistDailyRuns.map(scientistRunMarkup).join(''):'<p class="empty">No daily Scientist runs yet.</p>';
}

async function loadScientistRuns(){
  try{
    const response=await fetch('/api/scientist-runs',{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json();scientistDailyRuns=data.runs||[];renderScientistRuns();
  }catch(error){scientistRuns.innerHTML=`<p class="empty">Could not load daily runs: ${safe(error.message)}</p>`;}
}

scientistRunForm.elements.trade_date.value=nextWeekdayDate();
scientistRunForm.elements.asset_code.addEventListener('change',()=>{
  scientistRunForm.elements.contract.value=scientistRunForm.elements.asset_code.value;
});
scientistRunForm.elements.contract.value='MYM';
scientistRunForm.addEventListener('submit',async event=>{
  event.preventDefault();const status=$('#scientistRunStatus');status.textContent='Opening…';
  const fields=scientistRunForm.elements;
  try{
    const payload={trade_date:fields.trade_date.value,asset_code:fields.asset_code.value,contract:fields.contract.value.trim(),method_version:fields.method_version.value.trim(),mandate:fields.mandate.value.trim(),created_by:'user'};
    const response=await fetch('/api/v1/scientist-run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const result=await response.json();if(!response.ok)throw new Error(result.message||result.error||`HTTP ${response.status}`);
    status.textContent=result.result.created?`Opened ${result.result.run.run_id}`:`Run already exists: ${result.result.run.run_id}`;
    await loadScientistRuns();scientistRun.value=result.result.run.run_id;scientistRun.dispatchEvent(new Event('change'));
  }catch(error){status.textContent=error.message;}
});

scientistRuns.addEventListener('submit',async event=>{
  const form=event.target.closest('.scientist-step-form');if(!form)return;
  event.preventDefault();const status=form.querySelector('[role="status"]');status.textContent='Appending…';
  const fields=form.elements;
  try{
    const payload={run_id:form.dataset.runId,step_key:form.dataset.stepKey,event_type:fields.event_type.value,owner:fields.owner.value.trim(),summary:fields.summary.value.trim(),output_title:fields.output_title.value.trim(),output_url:fields.output_url.value.trim(),output_document:fields.output_document.value.trim(),detail:{entered_by:'dashboard_user'}};
    const response=await fetch('/api/v1/scientist-step',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const result=await response.json();if(!response.ok)throw new Error(result.message||result.error||`HTTP ${response.status}`);
    await loadScientistRuns();
  }catch(error){status.textContent=error.message;}
});

scientistRuns.addEventListener('submit',async event=>{
  const form=event.target.closest('.scientist-close-form');if(!form)return;
  event.preventDefault();const status=form.querySelector('[role="status"]');status.textContent='Closing session…';
  const fields=form.elements;
  try{
    const payload={run_id:form.dataset.runId,close_price:fields.close_price.value?Number(fields.close_price.value):null,resolution_source:fields.resolution_source.value.trim()};
    const response=await fetch('/api/v1/scientist-session-close',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const result=await response.json();if(!response.ok)throw new Error(result.message||result.error||`HTTP ${response.status}`);
    status.textContent=`Resolved ${result.result.resolved} open forecasts.`;await load();await loadScientistRuns();
  }catch(error){status.textContent=error.message;}
});

async function loadScientistLevels(){
  try{
    const response=await fetch('/api/scientist-levels',{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json();scientistLevels=data.items||[];
    scientistZone.innerHTML='<option value="">Choose an active level</option>'+scientistLevels.map(zone=>`<option value="${safe(zone.zone_id)}">${safe(zone.timeframe)} · ${safe(zone.side)} · ${safe(zone.symbol)} ${number(zone.zone_bottom)}–${number(zone.zone_top)} · ${safe(zone.zone_id)}</option>`).join('');
    if(!scientistLevels.length)scientistZone.innerHTML='<option value="">No active levels in the Lab ledger</option>';
    scientistZone.disabled=!scientistLevels.length;
    scientistTargetZone.innerHTML='<option value="">Manual target price</option>';
  }catch(error){
    scientistZone.innerHTML=`<option value="">Could not load levels (${safe(error.message)})</option>`;
    scientistZone.disabled=true;
  }
}

scientistRun.addEventListener('change',()=>{
  const run=scientistDailyRuns.find(item=>item.run_id===scientistRun.value);
  const eligible=run?scientistLevels.filter(level=>levelAsset(level)===runAsset(run)):scientistLevels;
  scientistZone.innerHTML='<option value="">Choose an active level</option>'+eligible.map(zone=>`<option value="${safe(zone.zone_id)}">${safe(zone.timeframe)} · ${safe(zone.side)} · ${safe(zone.symbol)} ${number(zone.zone_bottom)}–${number(zone.zone_top)} · ${safe(zone.zone_id)}</option>`).join('');
  scientistZone.disabled=!eligible.length;
  if(run)forecastForm.elements.expires_at.value=localDateTime(new Date(run.session_close));
});

function selectedScientistZone(){return scientistLevels.find(zone=>zone.zone_id===scientistZone.value);}

function refreshScientistTargets(){
  const zone=selectedScientistZone();
  const targets=zone?scientistLevels.filter(item=>item.contract===zone.contract&&item.timeframe===zone.timeframe&&item.side!==zone.side&&item.zone_id!==zone.zone_id):[];
  scientistTargetZone.innerHTML='<option value="">Manual target price</option>'+targets.map(item=>`<option value="${safe(item.zone_id)}">${safe(item.side)} ${number(item.zone_bottom)}–${number(item.zone_top)} · ${safe(item.zone_id)}</option>`).join('');
}

scientistZone.addEventListener('change',()=>{
  const zone=selectedScientistZone();refreshScientistTargets();
  if(!zone)return;
  const entry=zone.side==='BSL'?Number(zone.zone_bottom):Number(zone.zone_top);
  forecastForm.elements.entry_price.value=entry;
  const asset=levelAsset(zone);
  forecastForm.elements.stop_price.value=asset==='MYM'?(zone.side==='BSL'?entry+30:entry-30):'';
  $('#scientistForecastStatus').textContent=asset==='MYM'?'MYM draft uses the existing 30-tick cohort rule.':`${asset} requires its asset-specific stop to be frozen before this forecast.`;
  forecastForm.elements.target_price.value='';
});

scientistTargetZone.addEventListener('change',()=>{
  const zone=selectedScientistZone();
  const target=scientistLevels.find(item=>item.zone_id===scientistTargetZone.value);
  if(zone&&target)forecastForm.elements.target_price.value=zone.side==='BSL'?target.zone_top:target.zone_bottom;
});

function scientistJournal(data){
  if(!data)return;
  window.scientistJournalRecords=data.records;
  const unresolved=data.records.filter(row=>!row.outcome).length;
  const summary=[{label:'Research target',value:'75%',note:'Goal · not measured'},...(data.assets||[]).map(row=>({label:`${row.asset_code} · ${row.resolved} resolved`,value:row.accuracy==null?'—':pct(row.accuracy),note:`${row.wins} hit · ${row.losses} miss/timeout`})),...data.timeframes.map(row=>({label:`${row.timeframe} · ${row.forecasts} forecasts`,value:row.accuracy==null?'—':pct(row.accuracy),note:`${row.resolved} graded · ${row.outcomes.target} target · ${row.outcomes.stop} stop · ${row.outcomes.timeout} timeout · ${row.outcomes.no_touch} no-touch · ${row.outcomes.ambiguous} ambiguous`} ))];
  $('#scientistJournalSummary').innerHTML=summary.map(row=>`<div class="scientist-journal-stat"><small>${safe(row.label)}</small><strong>${safe(row.value)}</strong><span>${safe(row.note)}</span></div>`).join('');
  const status=$('.scientist-objective-status');
  status.innerHTML=data.records.length?`<strong>${data.records.length} frozen forecasts</strong><span>${unresolved} awaiting next-day outcome · timeframe results shown below</span>`:'<strong>Not yet scored</strong><span>No frozen daily Scientist forecasts recorded</span>';
  $('#scientistForecastRows').innerHTML=data.records.length?data.records.map(row=>`<tr><td>${time(row.forecast_at)}</td><td class="tf">${safe(row.timeframe)}</td><td>${safe(row.side)}<div class="muted">${number(row.zone_bottom)}–${number(row.zone_top)} · ${safe(row.zone_id).slice(0,16)}</div></td><td>${pct(row.hold_probability)}<div class="muted">R:R ${number(row.reward_risk)}</div></td><td>${number(row.stop_price)} → ${number(row.target_price)}</td><td>${row.outcome?safe(row.outcome):`<button type="button" class="record-outcome-btn" data-record-outcome="${safe(row.forecast_id)}">Record outcome</button>`}</td><td>${row.r_multiple==null?'—':`${number(row.r_multiple)}R`}</td></tr>`).join(''):'<tr><td class="empty" colspan="7">No frozen Scientist forecasts yet. Select an active level above to record a daily prediction.</td></tr>';
}

function parseLines(text){return text.split(/\n|,/).map(value=>value.trim()).filter(Boolean);}

forecastForm.elements.forecast_at.value=localDateTime(new Date());
forecastForm.elements.expires_at.value='';
loadScientistLevels();
loadScientistRuns();

forecastForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const status=$('#scientistForecastStatus');status.textContent='Freezing…';
  try{
    const fields=forecastForm.elements;
    const payload={
      run_id:scientistRun.value,zone_id:scientistZone.value,forecast_at:new Date(fields.forecast_at.value).toISOString(),
      expires_at:new Date(fields.expires_at.value).toISOString(),
      hold_probability:Number(fields.hold_probability.value)/100,
      entry_price:Number(fields.entry_price.value),stop_price:Number(fields.stop_price.value),
      target_price:Number(fields.target_price.value),target_zone_id:scientistTargetZone.value||null,
      rationale:fields.rationale.value.trim(),tools:parseLines(fields.tools.value),
      research_sources:parseLines(fields.research_sources.value),scientist_version:'daily-liquidity-v0.2-draft',
    };
    const response=await fetch('/api/v1/scientist-forecast',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const result=await response.json();if(!response.ok)throw new Error(result.message||result.error||`HTTP ${response.status}`);
    status.textContent=`Frozen ${result.result.forecast.forecast_id}`;
    forecastForm.elements.rationale.value='';forecastForm.elements.tools.value='';forecastForm.elements.research_sources.value='';
    await load();
  }catch(error){status.textContent=error.message;}
});

$('#scientistForecastRows').addEventListener('click',event=>{
  const button=event.target.closest('[data-record-outcome]');if(!button)return;
  const rowId=button.dataset.recordOutcome;
  const row=window.scientistJournalRecords?.find(item=>item.forecast_id===rowId);
  outcomeForm.elements.forecast_id.value=rowId;
  $('#scientistOutcomeForecast').textContent=row?`${row.timeframe} · ${row.side} · ${number(row.zone_bottom)}–${number(row.zone_top)}`:rowId;
  outcomeForm.elements.outcome_time.value=localDateTime(new Date());
  outcomeDialog.showModal();
});

$('#closeScientistOutcome').addEventListener('click',()=>outcomeDialog.close());
$('#cancelScientistOutcome').addEventListener('click',()=>outcomeDialog.close());
outcomeDialog.addEventListener('click',event=>{if(event.target===outcomeDialog)outcomeDialog.close()});
outcomeForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const fields=outcomeForm.elements;const status=$('#scientistOutcomeStatus');status.textContent='Appending…';
  try{
    const payload={forecast_id:fields.forecast_id.value,outcome:fields.outcome.value,
      outcome_time:new Date(fields.outcome_time.value).toISOString(),
      exit_price:fields.exit_price.value?Number(fields.exit_price.value):null,
      resolution_source:fields.resolution_source.value.trim(),detail:{note:fields.detail.value.trim()}};
    const response=await fetch('/api/v1/scientist-outcome',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const result=await response.json();if(!response.ok)throw new Error(result.message||result.error||`HTTP ${response.status}`);
    outcomeDialog.close();outcomeForm.reset();await load();
  }catch(error){status.textContent=error.message;}
});
