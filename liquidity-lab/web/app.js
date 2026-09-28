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
    summaryCards(data);timeframeRows(data.timeframes);scoreCards(data.forecast_scores);policy(data);calibration(data);userLevelStudy(data.user_suggested_levels);events(data.recent_events);scientistJournal(data.scientist_journal);loadScientistWeekly();
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
const agentConnectionState=$('#agentConnectionState');
const agentConnectionNote=$('#agentConnectionNote');
const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const chatHistory=[];
chatModel.value=localStorage.getItem('batty-chat-model')||'gpt-6-luna';
chatEffort.value=localStorage.getItem('batty-chat-effort')||'medium';
chatModel.addEventListener('change',()=>localStorage.setItem('batty-chat-model',chatModel.value));
chatEffort.addEventListener('change',()=>localStorage.setItem('batty-chat-effort',chatEffort.value));

async function checkChatConnection(){
  try{
    const response=await fetch('http://127.0.0.1:8770/api/chat/config',{cache:'no-store'});
    const config=await response.json();
    if(!response.ok)throw new Error(config.error||`Chat service returned ${response.status}.`);
    if(config.configured){
      agentConnectionState.textContent='CODEX READY';
      agentConnectionNote.textContent='Local Codex chat is ready with ChatGPT sign-in. Firstmate crew dispatch is not connected.';
      agentConnectionState.classList.add('is-connected');
    }else{
      agentConnectionState.textContent='SIGN-IN NEEDED';
      agentConnectionNote.textContent='The local chat service is running, but Codex is not signed in with ChatGPT.';
    }
  }catch(error){
    agentConnectionState.textContent='CHAT OFFLINE';
    agentConnectionNote.textContent='The local chat service on port 8770 is unavailable. Start Batty Count Desk to enable replies.';
    agentConnectionState.classList.remove('is-connected');
  }
}
checkChatConnection();

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
const singleAssetWrap=$('#singleAssetWrap');
const manualDateOverride=$('#manualDateOverride');
const rerunOverride=$('#rerunOverride');
const scientistRuns=$('#scientistRuns');
const forecastForm=$('#scientistForecastForm');
const outcomeDialog=$('#scientistOutcomeDialog');
const outcomeForm=$('#scientistOutcomeForm');
let scientistLevels=[];
let scientistDailyRuns=[];
let scientistWorkflow={};
let scientistWeeklyPreregistrations=[];
let lastScientistRunsSnapshot='';
let scientistLocalActivity={};

async function loadScientistWeekly(){
  const target=$('#scientistWeeklyResults');
  if(!target)return;
  try{
    const response=await fetch('/api/scientist-weekly',{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    const cohorts=data.cohorts||[];
    let preregistrations=[];
    try{
      const preregResponse=await fetch('/api/scientist-weekly-preregistrations',{cache:'no-store'});
      if(!preregResponse.ok)throw new Error(`HTTP ${preregResponse.status}`);
      preregistrations=(await preregResponse.json()).preregistrations||[];
      scientistWeeklyPreregistrations=preregistrations;
      updateDateDecision();
      $('#scientistWeeklyPreregistrations').innerHTML=preregistrations.length?preregistrations.map(item=>{
        const prereg=item.preregistration||{};
        return `<article class="scientist-weekly-review-card"><header><div><small>FROZEN ${time(item.created_at)} · ${safe(item.preregistration_id)}</small><strong>${safe(item.week_start)} week · ${safe(item.method_version)}</strong></div><span>PREREGISTERED · 75% TARGET</span></header><p>${safe(prereg.question)}</p><div class="scientist-weekly-review-snapshot"><span>Scheduled dates: ${prereg.trade_dates.map(safe).join(', ')}</span><span>Sample: ${prereg.minimum_eligible_forecasts} eligible · ${prereg.minimum_resolved_touched} resolved</span><span>Touch coverage ≥ ${pct(prereg.minimum_touch_coverage)} · baseline: ${safe(prereg.baseline)}</span></div><small>Calendar ${safe(prereg.calendar_source)} · SHA-256 ${safe(item.payload_sha256)}</small></article>`;
      }).join(''):'<p class="empty">No weekly cohort is preregistered yet. Freeze the research question and decision rule before the first forecast.</p>';
    }catch(error){$('#scientistWeeklyPreregistrations').innerHTML=`<p class="empty">Could not load preregistrations: ${safe(error.message)}</p>`;}
    const registered=new Set(preregistrations.map(item=>`${item.week_start}|${item.method_version}`));
    const reviewCohort=$('#scientistWeeklyReviewForm')?.elements.cohort;
    if(reviewCohort){
      const unique=[...new Map(cohorts.filter(row=>registered.has(`${row.week_start}|${row.method_version}`)).map(row=>[`${row.week_start}|${row.method_version}`,row])).values()];
      reviewCohort.innerHTML=unique.length?unique.map(row=>`<option value="${safe(JSON.stringify([row.week_start,row.method_version]))}">${safe(row.week_start)} week · ${safe(row.method_version)}</option>`).join(''):'<option value="" disabled selected>No scored weekly cohorts yet</option>';
      $('#scientistWeeklyReviewSubmit').disabled=!unique.length;
    }
    $('#scientistWeeklyStatus').textContent=cohorts.length?`${cohorts.length} weekly asset cohort${cohorts.length===1?'':'s'} · descriptive only`:'No weekly cohort recorded';
    target.innerHTML=cohorts.length?`<div class="table-wrap"><table><thead><tr><th>Trade week</th><th>Asset · contract · method</th><th>Target-before-stop</th><th>95% interval</th><th>Touch coverage</th><th>R · Brier</th><th>Sessions · unresolved</th></tr></thead><tbody>${cohorts.map(row=>`<tr><td>${safe(row.week_start)} → ${safe(row.week_end)}</td><td>${safe(row.asset_code)} · ${safe(row.contract)}<div class="muted">${safe(row.method_version)}</div><details class="weekly-timeframe-detail"><summary>Timeframe breakdown</summary>${row.timeframes.map(tf=>`<div>${safe(tf.timeframe)} · ${tf.accuracy==null?'—':pct(tf.accuracy)} · n=${tf.resolved_touched}</div>`).join('')}</details></td><td>${row.accuracy==null?'—':pct(row.accuracy)}<div class="muted">${row.targets} / ${row.resolved_touched} touched outcomes</div></td><td>${row.wilson_95?`${pct(row.wilson_95[0])}–${pct(row.wilson_95[1])}`:'—'}</td><td>${pct(row.touch_coverage)}<div class="muted">${row.resolved_touched} / ${row.forecasts}</div></td><td>${row.mean_r==null?'—':`${number(row.mean_r)}R`}<div class="muted">Brier ${row.brier_score==null?'—':number(row.brier_score)}</div></td><td>${row.sessions_with_forecasts}/${row.sessions_tracked} with forecasts<div class="muted">${row.unresolved} outcomes open</div></td></tr>`).join('')}</tbody></table></div>`:'<p class="empty">No frozen daily forecasts yet, so no weekly score can be calculated.</p>';
  }catch(error){
    $('#scientistWeeklyReviewSubmit').disabled=true;
    $('#scientistWeeklyStatus').textContent='Weekly score unavailable';
    target.innerHTML=`<p class="empty">Could not load weekly cohorts: ${safe(error.message)}</p>`;
  }
}

async function loadScientistWeeklyReviews(){
  const target=$('#scientistWeeklyReviews');if(!target)return;
  try{
    const response=await fetch('/api/scientist-weekly-reviews',{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json();const reviews=data.reviews||[];
    target.innerHTML=reviews.length?reviews.map(item=>{
      const review=item.review||{};const scores=item.score_snapshot||[];
      const assessment=review.snapshot_assessment||{};
      return `<article class="scientist-weekly-review-card"><header><div><small>APPENDED ${time(item.created_at)} · REVISION ${safe(item.review_id)}</small><strong>${safe(item.week_start)} week · ${safe(item.method_version)}</strong></div><span>${safe(review.firstmate_disposition)} · TEST ${safe(review.testing_disposition)} · REVIEW ${safe(review.review_disposition)}</span></header><p>${safe(review.chief_summary)}</p><div class="scientist-weekly-review-snapshot">${scores.map(row=>`<span>${safe(row.asset_code)} ${safe(row.contract)} · ${row.accuracy==null?'—':pct(row.accuracy)} · ${row.targets}/${row.resolved_touched} touched · coverage ${row.touch_coverage==null?'—':pct(row.touch_coverage)}</span>`).join('')}</div><p><b>Preregistered sample and coverage:</b> ${safe(assessment.status||'not assessed')} · ${assessment.eligible_forecasts||0}/${assessment.minimum_eligible_forecasts||0} eligible · ${assessment.resolved_touched||0}/${assessment.minimum_resolved_touched||0} resolved · ${assessment.observed_asset_sessions||0}/${assessment.scheduled_asset_sessions||0} scheduled asset sessions observed.</p><p><b>${safe(review.decision.replaceAll('_',' '))}:</b> ${safe(review.proposal)}${review.next_method_version?` · proposed ${safe(review.next_method_version)}`:''}</p><small>Preregn ${safe(review.preregistration_id)} · tested by ${safe(review.tested_by)} · independently reviewed by ${safe(review.reviewed_by)}${review.firstmate_task_id?` · Firstmate task ${safe(review.firstmate_task_id)}`:''} · SHA-256 ${safe(item.payload_sha256)}</small></article>`;
    }).join(''):'<p class="empty">No weekly review has been appended. Scorecards remain descriptive until the Chief synthesis, independent disposition, and Firstmate state are recorded.</p>';
  }catch(error){target.innerHTML=`<p class="empty">Could not load weekly review records: ${safe(error.message)}</p>`;}
}

const scientistRoles=[
  {id:'batty',name:'Batty',tone:'#57cbd9',aliases:['batty'],steps:[],task:'Own intake, run identity, and the Firstmate handoff.'},
  {id:'lead-researcher',name:'Lead Researcher',tone:'#83c7a7',aliases:['lead researcher'],steps:['preparation','research'],task:'Coordinate cited source work and assemble the daily evidence package.'},
  {id:'research-associate',name:'Research Associate',tone:'#6ac7bd',aliases:['research associate'],steps:['research'],task:'Review sources, tool definitions, conflicts, and falsifiable candidate ideas.'},
  {id:'analyst',name:'Analyst / Data QA',tone:'#7fe2b1',aliases:['analyst','data qa'],steps:['preparation','research'],task:'Check source rights, cutoff, contract, calendar, timeframe coverage, gaps, and risk rules.'},
  {id:'cleo',name:'Cleo',tone:'#f0b55b',aliases:['cleo','chart analyst'],steps:['research'],task:'Map and disposition liquidity levels across 60m, 30m, 15m, 5m, and 1m.'},
  {id:'junior-scientist',name:'Junior Scientist',tone:'#b79af4',aliases:['junior scientist'],steps:['prediction','recording','daily_learning'],task:'Execute the frozen daily method, record outcomes, and prepare the learning memo.'},
  {id:'lab-testing-specialist',name:'Lab Testing Specialist',tone:'#ff9d75',aliases:['lab testing specialist'],steps:['evaluation','journal'],task:'Reproduce scorecards; check completeness, leakage, duplicates, and session boundaries.'},
  {id:'outcome-method-reviewer',name:'Outcome / Method Reviewer',tone:'#d9bf72',aliases:['outcome/method reviewer','outcome-method reviewer'],steps:['evaluation','journal'],task:'Independently review the weekly calculations, interpretation, and proposed method change.'},
  {id:'chief-scientist',name:'Chief Scientist',tone:'#6db6ff',aliases:['chief scientist'],steps:['prediction','evaluation','journal','daily_learning'],task:'Own the weekly experiment, freeze the method, synthesize results, and propose next-week action.'},
];

function scientistAvatar(role){
  const avatarSeed={batty:0,cfo:1,'chief-scientist':2,'lead-researcher':3,analyst:4,'cleo':5,reviewer:6,paper:7,outcome:0,'junior-scientist':1,'research-associate':7,'lab-testing-specialist':6,'outcome-method-reviewer':6}[role.id]??scientistRoles.indexOf(role)%8;
  const hair=['#252330','#392d29','#31213a','#28343d','#423022','#262b45','#3b2927','#243936'][avatarSeed%8];
  const skin=['#dbab83','#e8bf9c','#c98866','#edc39d','#d39a75','#efcfaa','#bd8268','#dba986'][avatarSeed%8];
  const rows=['..HHHH..','.HHHHHH.','.HSSSSH.','.SSEESS.','.SSSSSS.','..SSSS..','.AAAAAA.','.AA..AA.'];
  const colors={H:hair,S:skin,E:'#17202a',A:role.tone};const tiles=[];
  rows.forEach((row,y)=>[...row].forEach((cell,x)=>{if(colors[cell])tiles.push(`<rect x="${x*4}" y="${y*4}" width="4" height="4" fill="${colors[cell]}"/>`)}));
  return `<svg class="agent-pixel scientist-agent-pixel" viewBox="0 0 32 32" role="img" aria-label="${safe(role.name)} icon">${tiles.join('')}</svg>`;
}

function elapsedLabel(seconds){
  if(seconds==null||!Number.isFinite(seconds)||seconds<0)return 'Timer starts when work is recorded';
  const whole=Math.floor(seconds);const hours=Math.floor(whole/3600);const minutes=Math.floor((whole%3600)/60);const rest=whole%60;
  return hours?`${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(rest).padStart(2,'0')} elapsed`:`${String(minutes).padStart(2,'0')}:${String(rest).padStart(2,'0')} elapsed`;
}
function scientistStateLabel(status){return ({working:'WORKING',completed:'DONE',blocked:'BLOCKED',queued:'QUEUED',skipped:'SKIPPED',not_reported:'NO UPDATE',standby:'STANDBY'})[status]||String(status||'STANDBY').toUpperCase().replaceAll('_',' ')}

function tokenUsage(detail){
  const usage=detail?.token_usage||{};
  const total=usage.total_tokens??detail?.tokens_used;
  if(total!=null&&Number.isFinite(Number(total))&&Number(total)>=0)return Number(total);
  const input=Number(usage.input_tokens);const output=Number(usage.output_tokens);
  return Number.isFinite(input)&&Number.isFinite(output)&&input>=0&&output>=0?input+output:null;
}

function roleActivity(run,role){
  const overrideAt=(run.history||[]).filter(item=>item.step_key==='prediction'&&item.detail?.report_override===true).at(-1)?.event_time;
  const events=(run.history||[]).filter(item=>role.steps.includes(item.step_key)&&role.aliases.some(alias=>String(item.owner||'').toLowerCase().includes(alias))&&(!overrideAt||item.event_time>=overrideAt)).sort((a,b)=>new Date(a.event_time)-new Date(b.event_time));
  const latest=events.at(-1);const trigger=(run.trigger_events||[]).at(-1);const local=scientistLocalActivity[run.run_id];
  let status='standby';let summary='Not dispatched. Role guidance is available; no work is claimed.';let startAt=null;let seconds=null;let tokenCount=null;
  if(role.id==='batty'){
    tokenCount=tokenUsage(trigger?.detail);
    if(local){status=local.status;summary=local.summary;seconds=local.endedAt?(local.endedAt-local.startedAt)/1000:(Date.now()-local.startedAt)/1000;startAt=local.endedAt?null:new Date(local.startedAt).toISOString();}
    else if(trigger?.event_type==='dispatched'){status='completed';summary=`Firstmate accepted the task${trigger.task_id?` · ${trigger.task_id}`:''}. Specialist updates follow from recorded work events.`;startAt=trigger.event_time;}
    else if(trigger?.event_type==='completed'){status='completed';summary='The Firstmate task returned a final status.';startAt=trigger.event_time;}
    else if(['blocked','failed','duplicate'].includes(trigger?.event_type)){status='blocked';summary=trigger.summary||'The Firstmate handoff is blocked.';startAt=trigger.event_time;}
    else if(trigger?.event_type==='superseded'){status='completed';summary=trigger.summary;startAt=trigger.event_time;}
    return {status,summary,startAt,seconds,latest:trigger,tokenCount};
  }
  if(latest){
    status=latest.event_type==='started'?'working':latest.event_type==='completed'?'completed':latest.event_type==='blocked'?'blocked':latest.event_type==='skipped'?'skipped':'queued';
    summary=latest.summary||role.task;
    const start=events.slice(0,latest.event_type==='started'?undefined:-1).reverse().find(item=>item.event_type==='started');
    if(latest.event_type==='started'){startAt=latest.event_time;seconds=(Date.now()-new Date(startAt).getTime())/1000;}
    else if(start){startAt=start.event_time;seconds=Number.isFinite(Number(latest.detail?.runtime_seconds))?Number(latest.detail.runtime_seconds):(new Date(latest.event_time)-new Date(start.event_time))/1000;}
    else if(Number.isFinite(Number(latest.detail?.runtime_seconds)))seconds=Number(latest.detail.runtime_seconds);
    const tokenEvents=events.map(item=>tokenUsage(item.detail)).filter(value=>value!=null);
    tokenCount=tokenEvents.length?tokenEvents.reduce((total,value)=>total+value,0):null;
  }else if(trigger?.event_type==='dispatched'){
    status='queued';summary='Waiting for the Firstmate task to record this role’s start.';
  }else if(trigger?.event_type==='completed'){
    status='not_reported';summary='The task returned, but no role-specific work event was recorded.';
  }else if(['blocked','failed','duplicate','superseded'].includes(trigger?.event_type)){
    status='standby';summary='Not started because this task did not dispatch.';
  }
  return {status,summary,startAt,seconds,latest,tokenCount};
}

function scientistWorkflowMarkup(run){
  const dispatched=(run.trigger_events||[]).some(item=>item.event_type==='dispatched');
  const visibleRoles=dispatched?scientistRoles:scientistRoles.slice(0,1);
  const flow=visibleRoles.map((role,index)=>{
    const activity=roleActivity(run,role);
    const tokens=activity.tokenCount==null?'tokens —':`tokens ${number(activity.tokenCount)}`;
    return `<article class="scientist-agent-task ${safe(activity.status)}" data-role="${safe(role.id)}" style="--seat-order:${index}"><div class="scientist-agent-task-head"><span class="scientist-agent-avatar">${scientistAvatar(role)}</span><div><strong>${safe(role.name)}</strong><small>${role.id==='batty'?'FIRSTMATE INTAKE':role.id==='chief-scientist'?'WEEKLY OWNER':role.id==='junior-scientist'?'DAILY OPERATOR':role.id==='lab-testing-specialist'||role.id==='outcome-method-reviewer'?'REVIEW GATE':'RESEARCH SPECIALIST'}</small></div><span class="scientist-agent-state">${scientistStateLabel(activity.status)}</span><span class="scientist-agent-lamp" aria-hidden="true"></span></div><p>${safe(activity.summary)}</p><div class="scientist-agent-metrics"><span class="scientist-agent-clock" ${activity.seconds!=null?`data-elapsed="${activity.seconds}"`:''} ${activity.status==='working'&&activity.startAt?`data-started-at="${safe(activity.startAt)}"`:''}>${elapsedLabel(activity.seconds)}</span><span>${tokens}</span></div>${activity.latest?.artifact_url?`<a class="scientist-agent-output" href="${safe(activity.latest.artifact_url)}" target="_blank" rel="noopener">Open latest work</a>`:''}</article>`;
  }).join('');
  const docs=(run.history||[]).filter(item=>item.artifact_url).map(item=>`<a class="scientist-document-row" href="${safe(item.artifact_url)}" target="_blank" rel="noopener"><span class="scientist-document-icon" aria-hidden="true">▤</span><span><strong>${safe(item.output_title||item.step_key.replaceAll('_',' '))}</strong><small>${safe(item.owner)} · ${safe(item.step_key.replaceAll('_',' '))} · ${time(item.event_time)}</small></span><span class="scientist-document-link">Open ↗</span></a>`).join('');
  return `<section class="scientist-workflow" aria-label="Session analysis work flow"><div class="scientist-workflow-heading"><div><small>BATTY → LAB TEAM · LIVE TASK STATE</small><h4>Intake, research, forecast, test, review</h4></div><span>${safe(run.trade_date)} · ${safe(run.asset_code)} · ${safe(run.contract)}</span></div><div class="scientist-agent-flow">${flow}</div><p class="scientist-telemetry-note">Elapsed time follows recorded start events. Token totals appear only when the runtime reports them.</p><div class="scientist-report-stream"><div class="scientist-report-stream-head"><div><small>SESSION DOCUMENTS</small><strong>${run.history.filter(item=>item.artifact_url).length} completed report${run.history.filter(item=>item.artifact_url).length===1?'':'s'}</strong></div><span>Every report is attached to this run</span></div>${docs||'<p class="scientist-documents-empty">No completed documents yet. Each specialist report and frozen output will appear here with its source step and timestamp.</p>'}</div></section>`;
}

function localDateTime(date){
  const shifted=new Date(date.getTime()-date.getTimezoneOffset()*60000);
  return shifted.toISOString().slice(0,16);
}

function chicagoClock(){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const value=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return {date:`${value.year}-${value.month}-${value.day}`,minutes:Number(value.hour)*60+Number(value.minute),label:`${value.year}-${value.month}-${value.day} ${value.hour}:${value.minute} CT`};
}
function nextTradingDate(value){
  const date=new Date(`${value}T12:00:00Z`);
  do{date.setUTCDate(date.getUTCDate()+1)}while(date.getUTCDay()===0||date.getUTCDay()===6);
  return date.toISOString().slice(0,10);
}
function runsForDate(date){return scientistDailyRuns.filter(run=>run.trade_date===date)}
function selectedAssets(){
  const fields=scientistRunForm.elements;
  return fields.asset_scope.value==='all'?['MYM','MCL','MGC']:[fields.single_asset_code.value];
}
function updateContractFields(){
  const fields=scientistRunForm.elements;
  const asset=fields.single_asset_code.value;
  singleAssetWrap.hidden=fields.asset_scope.value!=='one';
  fields.single_asset_code.disabled=fields.asset_scope.value!=='one';
  for(const symbol of ['MYM','MCL','MGC']){
    const input=fields[`contract_${symbol}`];
    const active=fields.asset_scope.value==='all'||symbol===asset;
    input.closest('label').hidden=!active;
    input.disabled=!active;
    input.required=active;
  }
}
function updateDateDecision(){
  const fields=scientistRunForm.elements;
  const clock=chicagoClock();
  const existing=runsForDate(clock.date);
  const relevant=existing.filter(run=>run.status==='complete'||run.status==='open');
  const completed=relevant.filter(run=>run.status==='complete').length;
  const active=relevant.length-completed;
  const nearClose=clock.minutes>=15*60&&clock.minutes<17*60;
  const weekday=new Date(`${clock.date}T12:00:00Z`).getUTCDay();
  const sameDay=relevant.length>0&&!nearClose&&weekday>0&&weekday<6;
  const suggested=sameDay?clock.date:nextTradingDate(clock.date);
  if(!manualDateOverride.checked)fields.trade_date.value=suggested;
  fields.trade_date.readOnly=!manualDateOverride.checked;
  const reason=$('#scientistDateReason');
  reason.textContent=sameDay
    ? `Clock: ${clock.label}. Found ${relevant.length} active or completed report${relevant.length===1?'':'s'} for today's trade date (${active} active, ${completed} complete). Defaulting to today; enable the rerun option to create a new report revision while preserving the old evidence.`
    : `Clock: ${clock.label}. ${nearClose?'The regular session is near its 4:00 p.m. CT close.':relevant.length?`Found ${relevant.length} active/completed report(s) for today, but this session is near/after its close.`:existing.length?'Only blocked reports exist for today.':'No active or completed report exists for today.'} Defaulting to the next weekday trade date, ${suggested}. Exchange holidays need the approved calendar.`;
  const selectedExisting=runsForDate(fields.trade_date.value).filter(run=>selectedAssets().includes(run.asset_code));
  const selectedDay=new Date(`${fields.trade_date.value}T12:00:00Z`);
  const selectedWeek=new Date(selectedDay);selectedWeek.setUTCDate(selectedWeek.getUTCDate()-((selectedWeek.getUTCDay()+6)%7));
  const weekStart=selectedWeek.toISOString().slice(0,10);
  const preregistered=scientistWeeklyPreregistrations.some(item=>item.week_start===weekStart&&item.method_version===fields.method_version.value.trim());
  const manualButton=scientistRunForm.querySelector('button[name="action"][value="manual"]');
  if(manualButton)manualButton.disabled=!preregistered;
  reason.textContent+=preregistered
    ?` Weekly method ${fields.method_version.value.trim()} is preregistered for ${weekStart}.`
    :` Freeze the weekly question, baseline, sample, and decision rule for ${weekStart} before manual forecast dispatch; that button is disabled until then.`;
  rerunOverride.disabled=!selectedExisting.length;
  if(!selectedExisting.length)rerunOverride.checked=false;
  rerunOverride.parentElement.title=selectedExisting.length?`${selectedExisting.length} existing asset report(s) can be rerun as a new immutable revision.`:'No existing report for this selection.';
  for(const symbol of ['MYM','MCL','MGC']){
    const input=fields[`contract_${symbol}`];
    if(input.dataset.userEdited==='true')continue;
    const exact=runsForDate(fields.trade_date.value).find(run=>run.asset_code===symbol);
    const saved=exact?.contract||scientistWorkflow.contract_defaults?.[symbol]||'';
    input.value=new RegExp(`^${symbol}[FGHJKMNQUVXZ](?:\\d{2}|\\d{4})$`).test(saved)?saved:'';
  }
}
function applyManualRunDefaults(){updateContractFields();updateDateDecision();}

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
  const latestPackage=run.data_packages?.at(-1);
  const packageStatus=latestPackage?`<span class="package-state ${safe(latestPackage.package_status)}">DATA PACKAGE ${safe(latestPackage.package_status)}</span>`:'<span class="package-state missing">NO DATA PACKAGE</span>';
  const report=run.selection_report||{};
  const reportLabel={ready:'PAPER SELECTIONS READY',abstain:'ABSTAIN',draft:'REPORT DRAFT',blocked:'REPORT BLOCKED'}[report.status]||'REPORT NOT STARTED';
  const reportLink=`<a class="scientist-report-link ${safe(report.status||'missing')}" href="${safe(run.selection_report_url)}" target="_blank" rel="noopener">${reportLabel}</a>`;
  const triggerEvents=(run.trigger_events||[]).slice(-3).reverse().map(item=>`<div class="scientist-trigger-event ${safe(item.event_type)}"><b>${safe(item.trigger_source)} · ${safe(item.job_id)} · ${safe(item.event_type)}</b><span>${safe(item.summary)}${item.task_id?` · task ${safe(item.task_id)}`:''}</span></div>`).join('');
  const packageBlockers=latestPackage?.package?.blockers?.length?`<div class="package-blockers">${latestPackage.package.blockers.map(reason=>`<span>${safe(reason)}</span>`).join('')}</div>`:'';
  const docCount=(run.history||[]).filter(item=>item.artifact_url).length;
  return `<article class="scientist-run-card" data-run-id="${safe(run.run_id)}"><header class="scientist-run-head"><div><small class="scientist-session-kicker">DESIGNATED TRADING SESSION · ${safe(run.timezone)}</small><h3>${safe(run.asset_code)} · ${safe(run.trade_date)} · ${safe(run.contract)}</h3><p>${safe(run.session_open)} → ${safe(run.session_close)} · ${safe(run.method_version)} · <span class="scientist-flat-rule">paper/shadow · flat by close</span></p></div>${packageStatus}<span class="run-progress">${run.completed_steps}/${run.total_steps} steps · ${safe(run.status)}</span>${reportLink}<a href="${safe(run.release_url)}" target="_blank" rel="noopener">Open session release</a></header><form class="scientist-trigger-form" data-run-id="${safe(run.run_id)}"><button type="submit">Start / resume analysis</button><span role="status" aria-live="polite">${run.trigger_events?.at(-1)?safe(run.trigger_events.at(-1).summary):'Ready. Starting records the request and shows whether Firstmate accepted it.'}</span></form>${scientistWorkflowMarkup(run)}<details class="scientist-package-entry"><summary>Upload specialist data package</summary><form class="scientist-package-form" data-run-id="${safe(run.run_id)}"><label>JSON package<input type="file" name="package_file" accept="application/json,.json" required></label><p>Lead Researcher coordinates sourcing; Analyst checks provenance and gaps; Cleo maps levels. A package is ready only when rights, calendar, timeframe coverage, asset risk, and costs pass.</p><button type="submit">Validate and append package</button><span role="status"></span></form>${packageBlockers}${latestPackage?`<small class="package-hash">v${latestPackage.package_version} · SHA-256 ${safe(latestPackage.payload_sha256)}</small>`:''}</details><section class="scientist-step-section"><div class="scientist-step-section-head"><div><small>REPORT FLOW</small><strong>Session work log · ${run.completed_steps}/${run.total_steps} stages complete · ${docCount} saved documents</strong></div><span>Open a stage to inspect or append durable evidence</span></div><div class="scientist-step-list">${steps}</div></section>${triggerEvents?`<div class="scientist-trigger-history">${triggerEvents}</div>`:''}<form class="scientist-close-form" data-run-id="${safe(run.run_id)}"><label>Session-close price<input name="close_price" type="number" step="any" placeholder="Required when a forecast was touched"></label><label>Approved resolution source<input name="resolution_source" required placeholder="Licensed feed / verified chart"></label><button type="submit">Force all forecasts flat</button><span role="status"></span></form></article>`;
}

function renderScientistRuns(){
  const status=$('#scientistWorkflowStatus');
  if(status){
    const bridge=scientistWorkflow.firstmate_dispatch_configured?'Firstmate dispatch configured':'Firstmate dispatch disconnected';
    const scheduler=scientistWorkflow.scheduler_configured?'local scheduler config found':'local scheduler config missing';
    const cronInstall=scientistWorkflow.scheduler_installation==='not_detectable_from_dashboard'?'OS cron installation is not visible to this dashboard.':'';
    status.innerHTML=`<strong>${safe(bridge)} · ${safe(scheduler)}</strong><span>Manual order: match the weekly preregistration, upload a source-verified ready package for each asset, then request the run. Frozen forecasts become a selection report only when the prediction step completes. ${scientistWorkflow.firstmate_dispatch_configured?'Accepted work is tracked by Firstmate task ID.':'Requests are recorded and blocked until a Firstmate dispatch bridge is configured.'} ${safe(cronInstall)} The dashboard does not claim analysis completed from a button click.</span>`;
    status.dataset.ready=scientistWorkflow.firstmate_dispatch_configured?'true':'false';
  }
  scientistRun.innerHTML='<option value="">Choose a daily asset run</option>'+scientistDailyRuns.filter(run=>run.status!=='complete').map(run=>`<option value="${safe(run.run_id)}">${safe(run.trade_date)} · ${safe(run.asset_code)} · ${safe(run.contract)}</option>`).join('');
  scientistRuns.innerHTML=scientistDailyRuns.length?scientistDailyRuns.map(scientistRunMarkup).join(''):'<p class="empty">No daily Scientist runs yet.</p>';
  updateScientistClocks();
}

function updateScientistClocks(){
  document.querySelectorAll('.scientist-agent-clock[data-started-at]').forEach(clock=>{
    const card=clock.closest('.scientist-agent-task');
    const seconds=card?.classList.contains('working')
      ?(Date.now()-new Date(clock.dataset.startedAt).getTime())/1000
      :Number(clock.dataset.elapsed);
    clock.textContent=elapsedLabel(seconds);
  });
}

async function loadScientistRuns(){
  try{
    const response=await fetch('/api/scientist-runs',{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json();scientistDailyRuns=data.runs||[];scientistWorkflow=data.workflow||{};renderScientistRuns();updateDateDecision();
  }catch(error){scientistRuns.innerHTML=`<p class="empty">Could not load daily runs: ${safe(error.message)}</p>`;}
}
setInterval(updateScientistClocks,1000);
let scientistPollInFlight=false;
setInterval(()=>{
  const dispatched=scientistDailyRuns.some(run=>run.trigger_events?.at(-1)?.event_type==='dispatched');
  if(dispatched&&!scientistPollInFlight){scientistPollInFlight=true;loadScientistRuns().finally(()=>{scientistPollInFlight=false;});}
},4000);
setInterval(()=>{
  if(scientistDailyRuns.some(run=>run.trigger_events?.at(-1)?.event_type==='dispatched'))loadScientistRuns();
},4000);

const manualContractInputs=['MYM','MCL','MGC'].map(asset=>scientistRunForm.elements[`contract_${asset}`]);
scientistRunForm.elements.asset_scope.addEventListener('change',()=>{updateContractFields();updateDateDecision()});
scientistRunForm.elements.single_asset_code.addEventListener('change',()=>{updateContractFields();updateDateDecision()});
manualDateOverride.addEventListener('change',()=>{updateDateDecision();scientistRunForm.elements.trade_date.focus()});
scientistRunForm.elements.trade_date.addEventListener('change',()=>{manualContractInputs.forEach(input=>delete input.dataset.userEdited);updateDateDecision()});
scientistRunForm.elements.method_version.addEventListener('input',updateDateDecision);
manualContractInputs.forEach(input=>input.addEventListener('input',()=>{input.dataset.userEdited='true'}));
applyManualRunDefaults();
scientistRunForm.addEventListener('submit',async event=>{
  event.preventDefault();const status=$('#scientistRunStatus');status.textContent='Batty is checking the date, existing reports, and contract identities…';
  const fields=scientistRunForm.elements;
  try{
    const tradeDate=fields.trade_date.value;
    const assets=selectedAssets();
    const contracts=Object.fromEntries(assets.map(asset=>[asset,fields[`contract_${asset}`].value.trim().toUpperCase()]));
    const missing=assets.filter(asset=>!contracts[asset]);
    if(missing.length)throw new Error(`Enter the dated contract for ${missing.join(', ')}. No contract identity was guessed.`);
    const invalid=assets.filter(asset=>!new RegExp(`^${asset}[FGHJKMNQUVXZ](?:\\d{2}|\\d{4})$`).test(contracts[asset]));
    if(invalid.length)throw new Error(`Confirm the dated futures contract code for ${invalid.join(', ')} before opening the run.`);
    const action=event.submitter?.value||'open';
    const opened=[];const dispatched=[];const skipped=[];
    for(const asset of assets){
      const contract=contracts[asset];
      let run=scientistDailyRuns.find(item=>item.trade_date===tradeDate&&item.asset_code===asset&&item.contract===contract&&item.method_version===fields.method_version.value.trim());
      if(!run){
        const payload={trade_date:tradeDate,asset_code:asset,contract,method_version:fields.method_version.value.trim(),mandate:fields.mandate.value.trim(),created_by:'user'};
        const response=await fetch('/api/v1/scientist-run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        const result=await response.json();if(!response.ok)throw new Error(result.message||result.error||`HTTP ${response.status}`);
        run=result.result.run;opened.push(run.run_id);
      }
      if(action!=='manual')continue;
      const prediction=run.steps?.find(step=>step.step_key==='prediction')?.latest;
      const alreadyComplete=prediction?.event_type==='completed';
      if(alreadyComplete&&!rerunOverride.checked){skipped.push(`${asset}: report already complete; enable rerun override to start a new revision`);continue;}
      const lastTrigger=run.trigger_events?.at(-1);
      if(lastTrigger?.event_type==='dispatched'){skipped.push(`${asset}: Firstmate task is still active`);continue;}
      scientistLocalActivity[run.run_id]={status:'working',summary:'Batty is preparing the manual run and checking the handoff.',startedAt:Date.now()};
      await loadScientistRuns();
      const triggerResponse=await fetch('/api/v1/scientist-trigger',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({run_id:run.run_id,trigger_source:'manual',job_id:'manual_analysis',idempotency_key:crypto.randomUUID(),force_override:Boolean(alreadyComplete&&rerunOverride.checked)})});
      const triggerResult=await triggerResponse.json();if(!triggerResponse.ok)throw new Error(triggerResult.message||triggerResult.error||`HTTP ${triggerResponse.status}`);
      dispatched.push(`${asset}: ${triggerResult.result.event.summary}`);
      const local=scientistLocalActivity[run.run_id];
      if(local){local.status=triggerResult.result.event.event_type==='dispatched'?'completed':'blocked';local.summary=triggerResult.result.event.summary;local.endedAt=Date.now();}
      await loadScientistRuns();
    }
    updateDateDecision();
    status.textContent=action==='open'
      ? `${assets.length} session tracker(s) opened or resumed. No analysis was dispatched.`
      : [...dispatched,...skipped].join(' · ')||`${assets.length} manual analysis request(s) recorded.`;
  }catch(error){
    for(const local of Object.values(scientistLocalActivity))if(local.status==='working'){local.status='blocked';local.summary=`Manual run stopped: ${error.message}`;local.endedAt=Date.now();}
    status.textContent=error.message;await loadScientistRuns();
  }
});

scientistRuns.addEventListener('submit',async event=>{
  const form=event.target.closest('.scientist-trigger-form');if(!form)return;
  event.preventDefault();const status=form.querySelector('[role="status"]');status.textContent='Requesting Firstmate dispatch…';
  try{
    const response=await fetch('/api/v1/scientist-trigger',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({run_id:form.dataset.runId,trigger_source:'manual',job_id:'manual_analysis',idempotency_key:crypto.randomUUID()})});
    const result=await response.json();if(!response.ok)throw new Error(result.message||result.error||`HTTP ${response.status}`);
    status.textContent=result.result.event.summary;await loadScientistRuns();
  }catch(error){status.textContent=error.message;}
});

scientistRuns.addEventListener('submit',async event=>{
  const form=event.target.closest('.scientist-package-form');if(!form)return;
  event.preventDefault();const status=form.querySelector('[role="status"]');const file=form.elements.package_file.files[0];
  if(!file){status.textContent='Choose a JSON package first.';return;}
  status.textContent='Reading package…';
  try{
    const packageData=JSON.parse(await file.text());
    const response=await fetch('/api/v1/scientist-data-package',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({run_id:form.dataset.runId,package:packageData})});
    const result=await response.json();if(!response.ok)throw new Error(result.message||result.error||`HTTP ${response.status}`);
    status.textContent=`Package ${result.result.package.package_status} · ${result.result.package.package_id}`;await loadScientistRuns();
  }catch(error){status.textContent=`Package rejected: ${error.message}`;}
});

scientistRuns.addEventListener('submit',async event=>{
  const form=event.target.closest('.scientist-step-form');if(!form)return;
  event.preventDefault();const status=form.querySelector('[role="status"]');status.textContent='Appending…';
  const fields=form.elements;
  try{
    const payload={run_id:form.dataset.runId,step_key:form.dataset.stepKey,event_type:fields.event_type.value,owner:fields.owner.value.trim(),summary:fields.summary.value.trim(),output_title:fields.output_title.value.trim(),output_url:fields.output_url.value.trim(),output_document:fields.output_document.value.trim(),detail:{entered_by:'dashboard_user',trigger_source:'manual'}};
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
loadScientistWeekly();
loadScientistWeeklyReviews();

function upcomingPreregistrationWeek(){
  const value=chicagoClock().date;const date=new Date(`${value}T12:00:00Z`);
  let days=(8-date.getUTCDay())%7;if(days===0)days=7;
  date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);
}
const weeklyPreregForm=$('#scientistWeeklyPreregForm');
weeklyPreregForm.elements.week_start.value=upcomingPreregistrationWeek();
weeklyPreregForm.addEventListener('submit',async event=>{
  event.preventDefault();const fields=weeklyPreregForm.elements;const status=$('#scientistWeeklyPreregStatus');status.textContent='Checking cutoff and freezing the registration…';
  const payload={week_start:fields.week_start.value,method_version:fields.method_version.value.trim(),
    question:fields.question.value.trim(),baseline:fields.baseline.value.trim(),calendar_source:fields.calendar_source.value.trim(),
    source_boundary:fields.source_boundary.value.trim(),scheduled_trade_dates:fields.scheduled_trade_dates.value.trim(),
    minimum_eligible_forecasts:fields.minimum_eligible_forecasts.value,minimum_resolved_touched:fields.minimum_resolved_touched.value,
    minimum_touch_coverage_percent:fields.minimum_touch_coverage_percent.value,sequential_plan:fields.sequential_plan.value.trim(),
    decision_rule:fields.decision_rule.value.trim(),recorded_by:'user'};
  try{
    const response=await fetch('/api/v1/scientist-weekly-preregistration',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const result=await response.json();if(!response.ok)throw new Error(result.message||result.error||`HTTP ${response.status}`);
    status.textContent=`Preregistration ${result.result.preregistration_id} frozen · SHA-256 ${result.result.payload_sha256.slice(0,16)}…`;
    await loadScientistWeekly();
  }catch(error){status.textContent=error.message;}
});

$('#scientistWeeklyReviewForm').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget;const status=$('#scientistWeeklyReviewStatus');status.textContent='Snapshotting the selected weekly scorecard and appending review…';
  try{
    const fields=form.elements;const [weekStart,methodVersion]=JSON.parse(fields.cohort.value);
    const payload={
      week_start:weekStart,method_version:methodVersion,chief_summary:fields.chief_summary.value.trim(),
      testing_by:fields.testing_by.value.trim(),testing_disposition:fields.testing_disposition.value,
      test_notes:fields.test_notes.value.trim(),reviewed_by:fields.reviewed_by.value.trim(),
      review_disposition:fields.review_disposition.value,review_notes:fields.review_notes.value.trim(),
      decision:fields.decision.value,next_method_version:fields.next_method_version.value.trim(),
      proposal:fields.proposal.value.trim(),firstmate_disposition:fields.firstmate_disposition.value,
      firstmate_task_id:fields.firstmate_task_id.value.trim(),recorded_by:'user',
    };
    const response=await fetch('/api/v1/scientist-weekly-review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const result=await response.json();if(!response.ok)throw new Error(result.message||result.error||`HTTP ${response.status}`);
    status.textContent=`Review ${result.result.review_id} appended with frozen scorecard snapshot ${result.result.payload_sha256.slice(0,16)}…`;
    form.reset();await loadScientistWeeklyReviews();
  }catch(error){status.textContent=error.message;}
});

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
