const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const art = {'volume-profile':'volume-profile-color.png',liquidity:'liquidity-color.png',bias:'bias-color.png','structure-zones':'liquidity-zones-color.png','market-research':'market-research-color.svg',fibonacci:'fibonacci-color.png','liquidity-zones':'liquidity-zones-color.png','daily-bias':'daily-bias-color.png','elliott-wave':'elliott-wave-color.png','confirmed-swings':'confirmed-swings-color.png',confluence:'convergence-color.png','premium-discount':'premium-discount-color.png'};
const profileCopy = {
  liquidity:{purpose:'Map confirmed external and internal swing price lines without treating a visible line as proof of resting orders.',use:'Choose a stored symbol and timeframe. External pivots use 14 bars on each side; internal pivots use 5. A line is available only after its final right-side bar closes. Watch the first later interaction, the response, and the nearest opposing confirmed line.',versions:[['v1.0.0 · Liquidity Map','Confirmed external and internal levels, pivot/confirmation timestamps, and later close-through state. Forward signal efficiency is unscored.'],['v001 · Chart convergence','30m and 1h anchors with present internal levels and visual convergence tags. Outcome parity and predictive claims remain unverified.'],['v000 · Archived chart baseline','Chart-timeframe pivots and wick-swept history. Retained for comparison.']]},
  bias:{purpose:'Describe confirmed market structure and prior-period context.',use:'Read the last confirmed swing sequence and any visible prior-period sweep as context. Treat direction as provisional until a separately defined outcome is tested.',versions:[['v1.0.0','Confirmed swing structure and prior-period liquidity context; descriptive, unscored.']]},
  'volume-profile':{purpose:'Show historical volume distributed across price bins.',use:'Select a stored symbol and lookback. Inspect the point of control and value area as descriptions of observed volume, not directional probabilities.',versions:[['v1.0.0','Local volume distribution with provenance and descriptive quality checks.']]},
};
const state = {catalog:[],experiments:[],selectedIndicator:'liquidity',selectedExperiment:'',profileTab:'overview',report:null,runtime:null,chat:null};
const params = new URLSearchParams(location.search);
const embedded = params.get('embed') === '1';
if (embedded) document.body.classList.add('embed');

async function api(path, options={}) {
  const response = await fetch(`./api/indicator-science/${path}`, {cache:'no-store',...options});
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}
const post = (path, body) => api(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const checked = name => [...document.querySelectorAll(`[name="${name}"]:checked`)].map(input=>input.value);
const percent = value => value == null ? '—' : `${(value*100).toFixed(1)}%`;
const ageLabel = seconds => seconds<60?`${Math.max(1,Math.round(seconds))}s`:seconds<3600?`${Math.round(seconds/60)}m`:seconds<86400?`${(seconds/3600).toFixed(1)}h`:`${(seconds/86400).toFixed(1)}d`;

function renderCatalog() {
  $('#libraryStatus').textContent = `${state.catalog.length} INDICATORS · LOCAL RESEARCH`;
  $('#indicatorCards').innerHTML = state.catalog.map(item=>`<article class="indicator-card"><figure><img src="./tool-belt-assets/${esc(art[item.id]||'tool-belt-color.png')}" alt="${esc(item.name)} illustration"></figure><small>${esc(item.scoringState.toUpperCase())} · ${item.protocolCount} PROTOCOLS</small><h3>${esc(item.name)}</h3><p>${esc(item.provisionalPurpose)}</p><footer><button type="button" data-measure="${esc(item.id)}">Measure ↗</button><button type="button" class="outline" data-profile="${esc(item.id)}">View profile</button></footer></article>`).join('');
  $('#setupIndicator').replaceChildren(...state.catalog.map(item=>new Option(item.name,item.id)));
  if (!state.catalog.some(item=>item.id===state.selectedIndicator)) state.selectedIndicator=state.catalog[0]?.id||'liquidity';
  renderProfile();
}

function renderProfile() {
  const item=state.catalog.find(entry=>entry.id===state.selectedIndicator);
  if (!item) return;
  const copy=profileCopy[item.id]||{purpose:item.provisionalPurpose,use:'This indicator needs a frozen purpose, trigger, independent outcome, and source boundary before probability testing.',versions:[['Catalog record','A method adapter and version-specific release notes have not been registered.']]};
  $('#profileTitle').textContent=item.name;
  $('#profileSubhead').textContent=item.provisionalPurpose;
  $('#profileArt').src=`./tool-belt-assets/${art[item.id]||'tool-belt-color.png'}`;
  $('#profileArt').alt=`${item.name} illustration`;
  $('#profileChartLink').href=`./vela-preview.html?indicator=${encodeURIComponent(item.id)}`;
  document.querySelectorAll('[data-profile-tab]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.profileTab===state.profileTab)));
  const studies=state.experiments.filter(exp=>exp.indicator_id===item.id);
  if (state.profileTab==='overview') $('#profileBody').innerHTML=`<h3>What it does</h3><p>${esc(copy.purpose)}</p><h3>How to use it</h3><p>${esc(copy.use)}</p><div class="profile-metrics"><div><small>Current probability</small><strong>Unmeasured</strong></div><div><small>Starting mark</small><strong>50% prior</strong></div><div><small>Forward studies</small><strong>${studies.length}</strong></div></div>`;
  if (state.profileTab==='results') $('#profileBody').innerHTML=`<h3>Probability testing</h3><p>${studies.length?`${studies.length} frozen study registration${studies.length===1?'':'s'} found. Open the experiment desk for source, sample, variant, and interval details.`:'No forward study has produced an accepted probability score.'} The 50% mark is a placeholder, not a historical hit rate.</p><p>A version can advance only after a frozen paired study shows at least +3 percentage points with the planned uncertainty and coverage checks, plus independent and human review.</p><div class="profile-metrics"><div><small>Empirical probability</small><strong>Unscored</strong></div><div><small>Required gain</small><strong>+3 pp</strong></div><div><small>Accepted upgrade</small><strong>None</strong></div></div>`;
  if (state.profileTab==='versions') $('#profileBody').innerHTML=`<h3>Version record</h3>${copy.versions.map(([title,body])=>`<p><strong>${esc(title)}</strong><br>${esc(body)}</p>`).join('')}<p>New release notes must link code, settings, frozen study, review disposition, screenshots, and rollback version.</p>`;
}

function chatMessage(role,message) {
  const node=document.createElement('div');
  node.className=`chat-message ${role}`;
  node.innerHTML=`<strong>${role==='user'?'You':'Scientist setup guide'}</strong>${esc(message)}`;
  $('#setupChat').append(node);
  $('#setupChat').scrollTop=$('#setupChat').scrollHeight;
}

function askSetup(phase,message,choices=[]) {
  state.chat.phase=phase;
  chatMessage('scientist',message);
  $('#chatChoices').replaceChildren(...choices.map(([label,value])=>{const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.answer=value;return button;}));
  $('#setupReply').placeholder=phase==='rights_note'?'Describe the license or permission and its scope…':'Answer in your own words…';
}

function nextSetupQuestion() {
  const chat=state.chat;
  if($('#setupIndicator').value!=='liquidity') return askSetup('adapter',`${state.catalog.find(item=>item.id===$('#setupIndicator').value)?.name||'This indicator'} needs a versioned signal adapter before I can run a forward observer. Describe the signal you want measured; I can record the request, but this measurement cannot start yet.`);
  const field=name=>$('#measureForm').elements.namedItem(name).value.trim();
  if(!field('instrument')) return askSetup('instrument','Which exact chart symbol should I use? I could not read one from the chart.');
  if(!chat.signalConfirmed) return askSetup('signal',`I found ${field('instrument')} and the accepted Liquidity Map method. The current observer can test the first later touch of a confirmed external or internal line. BSL tests a short reversal; SSL tests a long reversal. Is that the opportunity you want measured? Confirmed reversal is also included as an entry variant.`,[['Use first later touch','first-touch']]);
  if(!chat.sourceConfirmed){
    const sources=chat.context?.sources||[];
    const required=['4H','1H','30M','15M','5M','3M','1M'];
    const coverage=sources.map(item=>{const covered=item.timeframes.map(tf=>tf.timeframe);const missing=required.filter(tf=>!covered.includes(tf));const seconds={'4H':14400,'1H':3600,'30M':1800,'15M':900,'5M':300,'3M':180,'1M':60};const recency=item.timeframes.map(tf=>{const barTime=Date.parse(tf.lastBarTime);const age=Number.isFinite(tf.lastBarAgeSeconds)?tf.lastBarAgeSeconds:Number.isFinite(barTime)?Math.max(0,(Date.now()-barTime)/1000):null;const mayOpen=typeof tf.barMayBeOpen==='boolean'?tf.barMayBeOpen:Number.isFinite(barTime)?barTime+seconds[tf.timeframe]*1000>Date.now():false;return `${tf.timeframe}: ${tf.bars} bars, last bar ${age==null?'unknown':`${ageLabel(age)} ago`}${mayOpen?' (may be open)':''}, imported ${tf.lastImportedAt?new Date(tf.lastImportedAt).toLocaleString():'unknown'}`;}).join(', ');return `${item.source_id} (${covered.join(', ')}; ${missing.length?`missing ${missing.join(', ')}`:'all seven stored'}; ${recency})`;}).join('; ');
    const feedSummary=Object.entries(chat.context?.feedStates||{}).map(([tf,item])=>`${tf} ${item.provider}/${item.status}, updated ${item.updatedAt}`).join('; ');
    const summary=sources.length?`Local stored sources for this symbol: ${coverage}. Symbol-level feed monitor: ${feedSummary||'no feed state recorded'}. Feed state is separate from source-to-contract mapping. Stored bars show historical coverage only, not future updates or rights.`:'I found no stored bars for this symbol. The study will remain blocked until an exact source has the required timeframe coverage.';
    return askSetup('source',`${summary}\nWhich exact stored source should this experiment use?`,sources.map(item=>[item.source_id,`source:${item.source_id}`]));
  }
  if(!chat.contractConfirmed) return askSetup('contract',`${field('dated_contract')?`The chart supplied “${field('dated_contract')}” as a contract hint. `:''}Give the dated contract code if verified. A continuous chart alias does not identify an expiry contract. You can leave it unresolved and save a blocked draft.`,[...(field('dated_contract')?[[`Confirm ${field('dated_contract')}`,`contract:${field('dated_contract')}`]]:[]),['Leave contract unconfirmed','unknown-contract']]);
  if(!chat.contractEvidenceConfirmed) return askSetup('contract_evidence','Where did you verify this dated contract code and its expiry? Give the exact exchange or vendor reference. I will record your reference, but cannot independently validate a license or contract mapping from the chart alias.',[['Leave reference unconfirmed','unknown-contract-evidence']]);
  if(!chat.expiryConfirmed) return askSetup('contract_expiry','What is the contract’s last trading/expiry date? Enter the date shown by your contract reference as YYYY-MM-DD.',[['Leave expiry unconfirmed','unknown-expiry']]);
  if(!chat.tickConfirmed) return askSetup('tick','What is the verified minimum price tick for that dated contract? Please give a number in price units, such as 1 or 0.25.',[['Leave tick size unconfirmed','unknown-tick']]);
  if(!chat.tickSourceConfirmed) return askSetup('tick_source','Where did you verify that tick size? Give the exact exchange or vendor contract-specification reference.',[['Leave tick reference unconfirmed','unknown-tick-source']]);
  if(!chat.contractMappingDecided){if(!field('dated_contract')){$('#measureForm').elements.namedItem('contract_mapping_confirmed').checked=false;$('#measureForm').elements.namedItem('contract_mapping_note').value='Mapping cannot be confirmed until a dated contract is identified.';chat.contractMappingDecided=true;}else return askSetup('contract_mapping',`Can you verify that the selected stored source’s bars map to ${field('dated_contract')} for this symbol? The chart symbol may be a continuous alias. Confirm only if the source/contract mapping is documented; otherwise keep this study blocked.`,[['I verified the source mapping','mapping-confirmed'],['Keep mapping unconfirmed','mapping-unconfirmed']]);}
  if(!chat.planConfirmed) return askSetup('plan',`I propose all seven timeframes (4H, 1H, 30M, 15M, 5M, 3M, 1M) and separate external/internal lines. Compare first touch with confirmed-reversal entry, opposite liquidity with external swing target, and no break-even with +1R break-even. The primary candidate is confirmed reversal / opposite liquidity / no break-even. Proposed stop: ${field('stop_ticks')} ticks; expiry: ${field('horizon_bars')} bars. Do you want this matrix, or different choices?`,[['Use this proposal','use-plan'],['Edit exact protocol','edit-plan']]);
  if(!chat.sessionPolicyConfirmed) return askSetup('session_policy','For this first pilot, outcomes will be clustered by UTC calendar date. Exchange session boundaries and contract-roll transitions are not modeled, so session-level and net-performance claims remain out of scope. Do you accept this disclosed proxy for descriptive forward signal testing?',[['Accept UTC-day proxy for pilot','accept-session-proxy'],['Keep study blocked','block-session-proxy']]);
  if(!field('rights_note')) return askSetup('rights_note',`What permits local research, agent analysis, and retention of ${field('source_id')}? Please state the authorization and scope. If you cannot confirm it, say “unconfirmed”; I can save a blocked plan.`);
  if(!chat.rightsDecided) return askSetup('rights_confirm',`You described the rights as: “${field('rights_note')}”. Do you personally confirm that this source permits this local study and retention?`,[['I confirm authorized use','confirm-rights'],['Keep this study blocked','block-rights']]);
  chat.phase='review';
  renderReview();
  const data=collect();
  const cohorts=data.timeframes.length*data.level_kinds.length*data.entries.length*data.targets.length*data.break_evens.length;
  const gates=[!data.dated_contract?'dated contract':null,!data.contract_evidence?'contract reference':null,!data.contract_expiry_date?'contract expiry':null,data.tick_size==null?'tick size':null,!data.tick_size_source?'tick-size reference':null,!data.contract_mapping_confirmed?'source mapping':null,!data.session_policy_confirmed?'UTC-day session proxy':null,!data.rights_confirmed?'source rights':null].filter(Boolean);
  askSetup('review',`Here is the plan for review: ${data.instrument} / ${data.dated_contract||'dated contract unconfirmed'}; source ${data.source_id}; first later touch of confirmed lines; ${data.timeframes.join(', ')}; ${data.level_kinds.join(' + ')}; ${cohorts} separate rule cohorts; tick ${data.tick_size??'unconfirmed'}, stop ${data.stop_ticks} ticks, expiry ${data.horizon_bars} bars. ${gates.length?`Unresolved gates: ${gates.join(', ')}. Saving will keep the study blocked.`:'All user-confirmation gates are complete; references and rights remain independently unverified.'} The 50% mark is unmeasured. Review the exact protocol, then freeze this plan.`,[['Edit exact protocol','edit-plan']]);
  $('#saveSetup').hidden=false;
}

async function openSetup(indicator=state.selectedIndicator) {
  const dialog=$('#measureDialog');
  const valid=state.catalog.some(item=>item.id===indicator);
  $('#setupIndicator').value=valid?indicator:'liquidity';
  updateAdapter();
  if(params.get('symbol') && !$('#measureForm [name=instrument]').value) $('#measureForm [name=instrument]').value=params.get('symbol');
  if(params.get('source') && !$('#measureForm [name=source_id]').value) $('#measureForm [name=source_id]').value=params.get('source');
  for(const name of ['external_length','internal_length','convergence_atr']) if(params.get(name)) $('#measureForm [name='+name+']').value=params.get(name);
  if(params.get('contract') && !$('#measureForm [name=dated_contract]').value) $('#measureForm [name=dated_contract]').value=params.get('contract');
  state.chat={phase:'loading',context:null,signalConfirmed:false,sourceConfirmed:false,contractConfirmed:false,contractEvidenceConfirmed:false,expiryConfirmed:false,tickConfirmed:false,tickSourceConfirmed:false,contractMappingDecided:false,contractMappingConfirmed:false,sessionPolicyConfirmed:false,planConfirmed:false,rightsDecided:false};
  $('#setupChat').replaceChildren();$('#chatChoices').replaceChildren();$('#setupReply').value='';$('#setupStatus').textContent='';$('#saveSetup').hidden=true;
  dialog.classList.remove('advanced-open');$('#editProtocol').setAttribute('aria-expanded','false');
  if (!dialog.open) dialog.showModal();
  chatMessage('scientist','I am checking the chart context and local stored bars so I can fill what is knowable before asking you to confirm the rest.');
  const symbol=$('#measureForm [name=instrument]').value.trim();
  if(symbol){try{state.chat.context=await api(`setup-context?symbol=${encodeURIComponent(symbol)}`);const sources=state.chat.context.sources;chatMessage('scientist',`I found ${sources.length} local source${sources.length===1?'':'s'} for ${symbol}. I cannot verify data rights, contract identity, or tick size from stored bars.`);}catch(error){chatMessage('scientist',`Local data lookup is unavailable: ${error.message}. We can still build a plan, but source coverage is unverified.`);}}
  nextSetupQuestion();
}

function updateAdapter() {
  const adapter=$('#adapterMessage');
  const id=$('#setupIndicator').value;
  adapter.hidden=id==='liquidity';
  if (id!=='liquidity') adapter.innerHTML=`<strong>${esc(state.catalog.find(item=>item.id===id)?.name||id)} method needed.</strong> The Measure action starts here. This indicator needs its own trigger and independent outcome adapter before automatic forward scoring. <a href="./indicator-agent.html?indicator=${encodeURIComponent(id)}" target="_top">Open the Scientist protocol designer ↗</a>`;
  $('#saveSetup').disabled=id!=='liquidity';
}

async function answerSetup(raw,label=raw) {
  const chat=state.chat;if(!chat)return;
  const answer=String(raw||'').trim();if(!answer)return;
  chatMessage('user',label);
  $('#setupReply').value='';$('#chatChoices').replaceChildren();$('#setupStatus').textContent='';
  const form=$('#measureForm');const field=name=>form.elements.namedItem(name);
  if(/^(what|why|how|explain|can you explain)\b/i.test(answer)){
    const topic=/rights|license|permission|retention/i.test(answer)?'The stored feed name proves only that bars exist locally. You must confirm that your source agreement permits this research, agent analysis, and retention; otherwise the plan stays blocked.':/tick/i.test(answer)?'Tick size is the contract’s minimum price increment. It converts the proposed stop distance in ticks into a price distance, so I need the dated contract specification from you.':/break.?even|\b1R\b/i.test(answer)?'One R is the initial price risk from entry to stop. The +1R break-even variant moves its virtual stop to entry only after a completed bar closes one initial risk unit in favor.':/sample|3%|3 points|probability/i.test(answer)?'Thirty resolved signals are a pilot and 200 are descriptive. A 3 percentage-point upgrade needs a preregistered paired power plan, adequate forward sample, uncertainty and coverage review; the 50% starting mark is unmeasured.':'I can explain a setting and keep the current question open. The exact protocol remains editable before the final freeze.';
    try{const result=await post('setup-help',{question:answer,phase:chat.phase,context:chat.context,draft:collect()});chatMessage('scientist',result.reply);}catch(error){chatMessage('scientist',`${topic}\nLocal model help is unavailable; the guided setup is still available.`);}
    return nextSetupQuestion();
  }
  if(!answer.includes('?')&&!answer.startsWith('source:')){
    const contractHint=chat.phase==='contract'||/\bcontract\b/i.test(answer)?answer.match(/\b[A-Z]{2,10}[FGHJKMNQUVXZ]\d{1,4}\b/i):null;
    if(contractHint){field('dated_contract').value=contractHint[0];chat.contractConfirmed=true;}
    const tickHint=answer.match(/tick(?: size)?\s*(?:is|=|:)?\s*(\d+(?:\.\d+)?)/i);
    if(tickHint&&Number(tickHint[1])>0){field('tick_size').value=tickHint[1];chat.tickConfirmed=true;}
    const stopHint=answer.match(/stop(?: distance)?\s*(?:is|=|:)?\s*(\d+(?:\.\d+)?)/i)||answer.match(/(\d+(?:\.\d+)?)\s*ticks?\s*(?:stop|distance)/i);
    if(stopHint)field('stop_ticks').value=stopHint[1];
    const horizonHint=answer.match(/(?:expiry|horizon)\s*(?:is|=|:)?\s*(\d+)\s*(?:bars?)?/i);
    if(horizonHint)field('horizon_bars').value=horizonHint[1];
    const known=chat.context?.sources?.find(item=>answer.includes(item.source_id));
    if(known){field('source_id').value=known.source_id;chat.sourceConfirmed=true;}
  }
  if(answer==='edit-plan'){
    $('#measureDialog').classList.add('advanced-open');$('#editProtocol').setAttribute('aria-expanded','true');
    chat.phase='plan_edit';return askSetup('plan_edit','The exact protocol is open below. Edit the fields you want, then tell me “done” to review the plan again.',[['Done editing','done']]);
  }
  if(chat.phase==='plan_edit'){
    if(!/^(done|ready|continue|use current)/i.test(answer))return askSetup('plan_edit','I have kept the protocol editor open. Make the change in the fields below, then send “done”.', [['Done editing','done']]);
    chat.planConfirmed=true;$('#measureDialog').classList.remove('advanced-open');$('#editProtocol').setAttribute('aria-expanded','false');return nextSetupQuestion();
  }
  if(chat.phase==='instrument'){
    field('instrument').value=answer.slice(0,100);
    try{chat.context=await api(`setup-context?symbol=${encodeURIComponent(field('instrument').value)}`);}catch(error){chatMessage('scientist',`Local coverage lookup failed: ${error.message}`);}
  }else if(chat.phase==='signal'){
    if(answer==='first-touch'||/^(yes|use|first touch|first later touch|correct|confirm)/i.test(answer))chat.signalConfirmed=true;
    else return askSetup('signal','That is a different opportunity definition. The current Liquidity observer is implemented for the first later touch of a confirmed line. If you mean confirmed reversal as the entry, that is included as a variant. Please confirm the first-touch opportunity before I freeze this method; otherwise the new signal needs an adapter.',[['Use first later touch','first-touch']]);
  }else if(chat.phase==='source'){
    const sources=chat.context?.sources||[];
    const source=answer.startsWith('source:')?answer.slice(7):/^(first|the first)$/i.test(answer)&&sources[0]?sources[0].source_id:answer.replace(/^use\s+/i,'');
    field('source_id').value=source.slice(0,200);chat.sourceConfirmed=true;
    if(!sources.some(item=>item.source_id===source))chatMessage('scientist','I cannot find stored bars with that exact source name for this symbol. The observer will wait until matching future completed bars exist.');
  }else if(chat.phase==='contract'){
    if(answer==='unknown-contract'){field('dated_contract').value='';chat.contractConfirmed=true;}
    else {
    const match=answer.match(/\b[A-Z]{2,10}[FGHJKMNQUVXZ]\d{1,4}\b/i);
    const contract=answer.startsWith('contract:')?answer.slice(9):match?match[0]:/^(yes|confirm)$/i.test(answer)&&field('dated_contract').value?field('dated_contract').value:'';
    if(!contract)return askSetup('contract','I could not identify a dated futures contract code. Give the exchange root, month code, and year, such as MYMZ2026.');
    field('dated_contract').value=contract.trim().slice(0,100);chat.contractConfirmed=true;
    const expiry=answer.match(/\b\d{4}-\d{2}-\d{2}\b/);
    if(expiry){const date=new Date(`${expiry[0]}T00:00:00Z`);if(!Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===expiry[0]&&date.getTime()>Date.now()){field('contract_expiry_date').value=expiry[0];chat.expiryConfirmed=true;}}
    if(!answer.startsWith('contract:')&&answer.length>contract.length+4){field('contract_evidence').value=answer.slice(0,500);chat.contractEvidenceConfirmed=true;}
    const tick=answer.match(/tick(?: size)?\s*(?:is|=|:)?\s*(\d+(?:\.\d+)?)/i);
    if(tick&&Number(tick[1])>0){field('tick_size').value=tick[1];chat.tickConfirmed=true;}
    }
  }else if(chat.phase==='contract_evidence'){
    if(answer==='unknown-contract-evidence'){field('contract_evidence').value='';chat.contractEvidenceConfirmed=true;}
    else {
    if(answer.length<4)return askSetup('contract_evidence','Please give the named exchange/vendor source or exact reference you used to confirm this dated contract.');
    field('contract_evidence').value=answer.slice(0,500);chat.contractEvidenceConfirmed=true;
    }
  }else if(chat.phase==='contract_expiry'){
    if(answer==='unknown-expiry'){field('contract_expiry_date').value='';chat.expiryConfirmed=true;}
    else {
    const match=answer.match(/\b\d{4}-\d{2}-\d{2}\b/);
    if(!match)return askSetup('contract_expiry','I need the verified expiry/last-trading date in YYYY-MM-DD format.');
    const date=new Date(`${match[0]}T00:00:00Z`);
    if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==match[0]||date.getTime()<=Date.now())return askSetup('contract_expiry','That date must be a valid future contract expiry/last-trading date. Enter it as YYYY-MM-DD.');
    field('contract_expiry_date').value=match[0];chat.expiryConfirmed=true;
    }
  }else if(chat.phase==='tick'){
    if(answer==='unknown-tick'){field('tick_size').value='';chat.tickConfirmed=true;}
    else {
    const number=answer.match(/\d+(?:\.\d+)?/);
    if(!number||!(Number(number[0])>0))return askSetup('tick','I need a positive numeric tick size in price units. What does the dated contract specification say?');
    field('tick_size').value=number[0];chat.tickConfirmed=true;
    }
  }else if(chat.phase==='tick_source'){
    if(answer==='unknown-tick-source'){field('tick_size_source').value='';chat.tickSourceConfirmed=true;}
    else {
    if(answer.length<4)return askSetup('tick_source','Please name the exact exchange or vendor contract-specification reference for the tick size.');
    field('tick_size_source').value=answer.slice(0,500);chat.tickSourceConfirmed=true;
    }
  }else if(chat.phase==='contract_mapping'){
    if(answer==='mapping-confirmed'){field('contract_mapping_confirmed').checked=true;field('contract_mapping_note').value='User confirms selected source bars map to the dated contract; independent verification pending.';chat.contractMappingConfirmed=true;chat.contractMappingDecided=true;}
    else if(answer==='mapping-unconfirmed'){field('contract_mapping_confirmed').checked=false;field('contract_mapping_note').value='Source-to-contract mapping unconfirmed by user.';chat.contractMappingConfirmed=false;chat.contractMappingDecided=true;}
    else return askSetup('contract_mapping','Choose whether the source-to-contract mapping is documented. If you cannot verify it, keep the study blocked.',[['I verified the source mapping','mapping-confirmed'],['Keep mapping unconfirmed','mapping-unconfirmed']]);
  }else if(chat.phase==='session_policy'){
    if(answer==='accept-session-proxy'){field('session_policy_confirmed').checked=true;chat.sessionPolicyConfirmed=true;}
    else if(answer==='block-session-proxy'){field('session_policy_confirmed').checked=false;chat.sessionPolicyConfirmed=true;}
    else return askSetup('session_policy','Please choose whether to accept the clearly disclosed UTC-day clustering proxy for this descriptive pilot.',[['Accept UTC-day proxy for pilot','accept-session-proxy'],['Keep study blocked','block-session-proxy']]);
  }else if(chat.phase==='plan'){
    if(answer==='use-plan'||/^(yes|use proposal|looks good|accept)/i.test(answer))chat.planConfirmed=true;
    else{
      const stop=answer.match(/stop(?: distance)?\s*(?:is|=|:)?\s*(\d+(?:\.\d+)?)/i)||answer.match(/(\d+(?:\.\d+)?)\s*ticks?\s*(?:stop|distance)/i);
      const horizon=answer.match(/(?:expiry|horizon)\s*(?:is|=|:)?\s*(\d+)\s*(?:bars?)?/i);
      const entries=checked('entries');
      const targets=checked('targets');
      const breakEvens=checked('break_evens');
      const current=field('primary_candidate_variant').value.split(':');
      let entry=current[0],target=current[1],breakEven=current[2];
      if(/first touch|touch entry/i.test(answer))entry='first_touch';
      if(/confirmed reversal|reversal close/i.test(answer))entry='confirmed_reversal';
      if(/external swing|swing structure/i.test(answer))target='swing_structure';
      if(/opposite liquidity|opposing liquidity|liquidity target/i.test(answer))target='opposite_liquidity';
      if(/break.?even|\+?1\s*r/i.test(answer)&&!/no break.?even|without break.?even/i.test(answer))breakEven='one_r';
      if(/no break.?even|without break.?even|no be\b/i.test(answer))breakEven='none';
      const variantChanged=entry!==current[0]||target!==current[1]||breakEven!==current[2];
      if(stop)field('stop_ticks').value=stop[1];
      if(horizon)field('horizon_bars').value=horizon[1];
      if(variantChanged){
        const candidate=`${entry}:${target}:${breakEven}`;
        if(!entries.includes(entry)||!targets.includes(target)||!breakEvens.includes(breakEven))return askSetup('plan',`That choice (${candidate.replaceAll(':',' / ')}) is not currently enabled in the variant matrix. Open the exact protocol editor to add its dimension, or choose one of the available variants.`,[['Edit exact protocol','edit-plan']]);
        field('primary_candidate_variant').value=candidate;
      }
      if(!stop&&!horizon&&!variantChanged)return askSetup('plan','Tell me the entry, target, break-even rule, stop in ticks, or expiry in bars you want to change. You can also open the exact protocol editor.',[['Use proposed matrix','use-plan'],['Edit exact protocol','edit-plan']]);
      const selected=field('primary_candidate_variant').selectedOptions[0]?.textContent||field('primary_candidate_variant').value.replaceAll(':',' / ');
      return askSetup('plan',`Updated proposal: ${selected}; ${field('stop_ticks').value} ticks stop; ${field('horizon_bars').value} bars expiry. Is this the primary comparison you want, or should I change another part?`,[['Use updated proposal','use-plan'],['Edit exact protocol','edit-plan']]);
    }
  }else if(chat.phase==='rights_note'){
    field('rights_note').value=/^(unconfirmed|unknown|not sure|no)$/i.test(answer)?'Rights not confirmed by user':answer.slice(0,1000);
    if(field('rights_note').value==='Rights not confirmed by user'){field('rights_confirmed').checked=false;chat.rightsDecided=true;}
  }else if(chat.phase==='rights_confirm'){
    if(answer==='confirm-rights'){field('rights_confirmed').checked=true;chat.rightsDecided=true;}
    else if(answer==='block-rights'){field('rights_confirmed').checked=false;chat.rightsDecided=true;}
    else return askSetup('rights_confirm','Use one of the explicit choices below. I cannot infer source rights from a casual reply.',[['I confirm authorized use','confirm-rights'],['Keep this study blocked','block-rights']]);
  }else if(chat.phase==='review')return askSetup('review','Use the exact protocol editor to change a setting, or press Freeze this plan after reading the summary.',[['Edit exact protocol','edit-plan']]);
  else if(chat.phase==='adapter')return askSetup('adapter','I recorded your desired signal in this conversation. Automatic forward scoring for this indicator requires a versioned adapter before measurement can start.');
  nextSetupQuestion();
}

function collect() {
  const form=$('#measureForm');
  const value=name=>form.elements.namedItem(name)?.value?.trim()||'';
  return {indicator_id:value('indicator_id'),title:value('title'),instrument:value('instrument'),dated_contract:value('dated_contract'),contract_evidence:value('contract_evidence'),contract_expiry_date:value('contract_expiry_date'),contract_mapping_confirmed:form.elements.namedItem('contract_mapping_confirmed').checked,contract_mapping_note:value('contract_mapping_note'),method_version:value('method_version'),scientist:value('scientist'),signal_definition:value('signal_definition'),source_id:value('source_id'),rights_note:value('rights_note'),rights_confirmed:form.elements.namedItem('rights_confirmed').checked,tick_size_source:value('tick_size_source'),session_policy_confirmed:form.elements.namedItem('session_policy_confirmed').checked,timeframes:checked('timeframes'),level_kinds:checked('level_kinds'),entries:checked('entries'),targets:checked('targets'),break_evens:checked('break_evens'),external_length:Number(value('external_length')),internal_length:Number(value('internal_length')),convergence_atr:Number(value('convergence_atr')),tick_size:value('tick_size')?Number(value('tick_size')):null,stop_ticks:Number(value('stop_ticks')),horizon_bars:Number(value('horizon_bars')),primary_candidate_variant:value('primary_candidate_variant')};
}

function refreshCandidateOptions() {
  const select=$('#candidateVariant');
  if(!select)return;
  const prior=select.value||'confirmed_reversal:opposite_liquidity:none';
  const labels={first_touch:'First touch',confirmed_reversal:'Confirmed reversal',opposite_liquidity:'Opposite liquidity',swing_structure:'External swing',none:'No break-even',one_r:'+1R break-even'};
  const candidates=[];
  for(const entry of checked('entries'))for(const target of checked('targets'))for(const be of checked('break_evens')){
    const value=`${entry}:${target}:${be}`;
    if(value!=='first_touch:opposite_liquidity:none')candidates.push(new Option(`${labels[entry]} / ${labels[target]} / ${labels[be]}`,value));
  }
  select.replaceChildren(...candidates);
  select.value=candidates.some(option=>option.value===prior)?prior:candidates[0]?.value||'';
}

function validateStep() {
  if(state.chat?.phase!=='review'){$('#setupStatus').textContent='Finish the setup conversation first.';return false;}
  for(const name of ['title','instrument','contract_mapping_note','method_version','scientist','signal_definition','source_id','rights_note']){
    const field=$(`#measureForm [name=${name}]`);if(!field.value.trim()){$('#setupStatus').textContent=`Complete ${name.replaceAll('_',' ')}.`;return false;}
  }
  const data=collect();
  for(const name of ['external_length','internal_length','convergence_atr','stop_ticks','horizon_bars']) if(!(data[name]>0)){$('#setupStatus').textContent=`Enter a valid ${name.replaceAll('_',' ')}.`;return false;}
  if(data.tick_size!==null&&!(data.tick_size>0)){$('#setupStatus').textContent='Enter a positive tick size or leave it unconfirmed in the setup chat.';return false;}
  for(const name of ['timeframes','level_kinds','entries','targets','break_evens']) if(!data[name].length){$('#setupStatus').textContent=`Select at least one ${name.replaceAll('_',' ')} option.`;return false;}
  if(data.timeframes.length!==7||data.level_kinds.length!==2){$('#setupStatus').textContent='This first Liquidity study includes all seven timeframes and both line classes.';return false;}
  if(!data.entries.includes('first_touch')||!data.targets.includes('opposite_liquidity')||!data.break_evens.includes('none')){$('#setupStatus').textContent='Keep the frozen first-touch / opposite-liquidity / no-BE baseline.';return false;}
  const candidate=data.primary_candidate_variant.split(':');
  if(!data.entries.includes(candidate[0])||!data.targets.includes(candidate[1])||!data.break_evens.includes(candidate[2])){$('#setupStatus').textContent='Select every rule used by the primary candidate.';return false;}
  return true;
}

function renderReview() {
  const data=collect();
  const count=data.timeframes.length*data.level_kinds.length*data.entries.length*data.targets.length*data.break_evens.length;
  const source=state.chat?.context?.sources?.find(item=>item.source_id===data.source_id);
  const covered=source?.timeframes?.map(item=>item.timeframe)||[];
  const missing=['4H','1H','30M','15M','5M','3M','1M'].filter(timeframe=>!covered.includes(timeframe));
  const latest=source?.timeframes?.length?Math.max(...source.timeframes.map(item=>Number.isFinite(item.lastBarAgeSeconds)?item.lastBarAgeSeconds:Math.max(0,(Date.now()-Date.parse(item.lastBarTime))/1000))):null;
  const gates=[!data.dated_contract?'contract identity':null,!data.contract_evidence?'contract reference':null,!data.contract_expiry_date?'contract expiry':null,data.tick_size==null?'tick size':null,!data.tick_size_source?'tick reference':null,!data.contract_mapping_confirmed?'source mapping':null,!data.session_policy_confirmed?'UTC-day session proxy':null,!data.rights_confirmed?'source rights':null].filter(Boolean);
  $('#reviewSummary').innerHTML=`<strong>${esc(data.title)}</strong><br>${esc(data.instrument)} · ${esc(data.dated_contract||'contract unconfirmed')} · expires ${esc(data.contract_expiry_date||'unconfirmed')} · source ${esc(data.source_id)}<br>Stored coverage: ${covered.length}/7 requested timeframes${missing.length?` · missing ${missing.map(esc).join(', ')}`:''}; newest stored bar ${latest==null?'unavailable':`${ageLabel(latest)} old`}. Historical coverage does not establish forward feed continuity.<br>Contract reference: ${esc(data.contract_evidence||'unconfirmed')} · mapping ${data.contract_mapping_confirmed?'user confirmed; independent verification pending':'unconfirmed; study will be blocked'}<br>Tick size ${esc(data.tick_size??'unconfirmed')} from ${esc(data.tick_size_source||'unconfirmed')}<br>Pivot settings: external ${data.external_length}, internal ${data.internal_length}, convergence ${data.convergence_atr} ATR<br>${data.timeframes.map(esc).join(' / ')} · ${data.level_kinds.map(esc).join(' + ')} lines<br>${count} separate timeframe × line × rule cohorts<br>Primary comparator: ${esc(data.primary_candidate_variant)} vs first_touch:opposite_liquidity:none<br>${esc(data.stop_ticks)} ticks stop · ${esc(data.horizon_bars)} bars expiry · daily status / weekly scientific review<br>Session clustering: UTC calendar-day proxy${data.session_policy_confirmed?' accepted for descriptive pilot':' not accepted; study will be blocked'}. Exchange session/roll effects are not modeled.<br>Rights: ${data.rights_confirmed?'confirmed by user; independently unverified':'unconfirmed; registration will be blocked'}${gates.length?`<br>Unresolved gates: ${gates.map(esc).join(', ')}.`:''}`;
}

async function refreshExperiments() {
  try {
    const [list,runtime]=await Promise.all([api('experiments'),api('runtime')]);
    state.experiments=list.experiments;
    state.runtime=runtime;
    $('#runtimeStatus').textContent=runtime.state==='ready'?`OBSERVER READY · ${runtime.lastScan?new Date(runtime.lastScan).toLocaleTimeString():'WAITING'}`:`OBSERVER ${runtime.state.toUpperCase()}${runtime.error?` · ${runtime.error}`:''}`;
    renderExperimentList();
    renderProfile();
    if(state.selectedExperiment) await selectExperiment(state.selectedExperiment,false);
  } catch(error) {$('#runtimeStatus').textContent=`LOCAL API UNAVAILABLE · ${error.message}`;}
}

function renderOperations(experimentId, experimentState) {
  const result=state.runtime?.lastResult;
  const item=result?.experiments?.find(entry=>entry.experimentId===experimentId);
  const scanTime=state.runtime?.lastScan?new Date(state.runtime.lastScan).toLocaleString():'No scan recorded';
  if(!item) {const message=experimentState==='armed'?'Waiting for the observer’s first report on this running study.':experimentState==='paused'?'This study is paused; new bars are not being collected.':experimentState==='blocked_readiness'?'Contract, source coverage, or session-policy readiness is unresolved; collection is not enabled.':experimentState==='blocked_rights'?'Source research rights are unconfirmed; collection is not enabled.':'This study is blocked; collection is not enabled.';return `<section class="ops-panel"><div class="ops-heading"><div><small>COLLECTION HEALTH</small><strong>${esc(scanTime)}</strong></div><span>${state.runtime?.state==='ready'?'No current scan for this study':'Observer status unavailable'}</span></div><p>${message}</p></section>`;}
  const states={scanned:'Eligible bars scanned',waiting_for_forward_bars:'Waiting for new forward bars',no_local_bars:'No stored bars',data_gaps_only:'Data gaps only',waiting_for_data:'Waiting for data'};
  const cards=item.timeframes.map(metric=>`<article class="ops-timeframe"><header><strong>${esc(metric.timeframe)}</strong><span class="ops-state ${metric.state==='scanned'?'good':metric.state==='data_gaps_only'?'gap':''}">${esc(states[metric.state]||metric.state)}</span></header><div><span>Bars scanned</span><b>${metric.barsScanned}</b><span>Eligible</span><b>${metric.eligibleBars}</b></div><div><span>Signals</span><b>${metric.newSignals}</b><span>Resolved variants</span><b>${metric.resolvedVariants}</b></div><div><span>Pending variants</span><b>${metric.pendingVariants}</b><span>Skipped bars</span><b>${metric.skippedBars}</b></div>${metric.gapReasons&&Object.keys(metric.gapReasons).length?`<small class="ops-gaps">Gaps: ${Object.entries(metric.gapReasons).map(([reason,count])=>`${esc(reason.replaceAll('_',' '))} ${count}`).join(' · ')}</small>`:''}${metric.lastEligibleBar?`<small class="ops-last-bar">Last eligible close ${esc(new Date(metric.lastEligibleBar).toLocaleString())}</small>`:''}</article>`).join('');
  return `<section class="ops-panel"><div class="ops-heading"><div><small>COLLECTION HEALTH · LOCAL PAPER OBSERVER</small><strong>Last scan ${esc(scanTime)}</strong></div><span>${esc(result.mode.replaceAll('_',' '))} · next scan within 60 seconds while Count Desk runs</span></div><div class="ops-timeframes">${cards}</div></section>`;
}

function renderExperimentList() {
  $('#experimentList').innerHTML=state.experiments.length?state.experiments.map(exp=>`<button class="experiment-item ${state.selectedExperiment===exp.id?'active':''}" type="button" data-experiment="${esc(exp.id)}"><small>${esc(exp.state==='armed'?'ON · SCAN ENABLED':exp.state==='paused'?'OFF · PAUSED':exp.state==='blocked_rights'?'BLOCKED · RIGHTS':'BLOCKED · READINESS')} · ${esc(exp.spec.indicator_id.toUpperCase())}</small><strong>${esc(exp.spec.title)}</strong><span>${esc(exp.spec.instrument)} · ${exp.observations} resolved variant records · ${new Date(exp.created_at).toLocaleDateString()}</span></button>`).join(''):'<div class="empty-state">No frozen experiments. Press Measure to register the first Liquidity cohort.</div>';
}

async function selectExperiment(id, scroll=true) {
  const exp=state.experiments.find(item=>item.id===id);
  if(!exp)return;
  state.selectedExperiment=id;
  renderExperimentList();
  try {
    const [report,brief]=await Promise.all([api(`report?experiment_id=${encodeURIComponent(id)}`),api(`upgrade-brief?experiment_id=${encodeURIComponent(id)}`)]);
    state.report=report;
    const comparison=report.primaryComparison;
    const rows=report.cohorts.map(c=>`<tr><td>${esc(c.timeframe)}</td><td>${esc(c.levelKind)}</td><td>${esc(c.variantId.replaceAll(':',' / '))}</td><td>${c.resolved}</td><td>${c.hits}</td><td>${percent(c.hitRate)}</td><td>${c.wilson95?`${percent(c.wilson95[0])}–${percent(c.wilson95[1])}`:'—'}</td><td>${c.grossMeanR==null?'—':`${c.grossMeanR.toFixed(2)}R`}</td></tr>`).join('');
    const pairedRows=report.cohortComparisons.map(c=>`<tr><td>${esc(c.timeframe)}</td><td>${esc(c.levelKind)}</td><td>${c.pairedResolved}</td><td>${c.sessions}</td><td>${c.pointDifference==null?'—':`${(c.pointDifference*100).toFixed(1)} pp`}</td><td>${c.approximate95?`${(c.approximate95[0]*100).toFixed(1)} to ${(c.approximate95[1]*100).toFixed(1)} pp`:'—'}</td><td>${esc(c.state.replaceAll('_',' '))}</td></tr>`).join('');
    const running=exp.state==='armed';
    const runStatus=running?(report.observations?'On · collecting eligible forward bars':'On · waiting for eligible forward bars'):exp.state==='paused'?'Off · forward collection paused':exp.state==='blocked_rights'?'Blocked · source rights unconfirmed':'Blocked · readiness gates unresolved';
    const blocked=exp.state==='blocked_rights'||exp.state==='blocked_readiness';
    $('#experimentDetail').innerHTML=`<div class="experiment-head"><div><h3>${esc(exp.spec.title)}</h3><p id="runStatus">${esc(runStatus)}</p></div><button class="run-switch ${running?'is-on':''}" type="button" role="switch" aria-label="Run ${esc(exp.spec.title)} experiment" aria-checked="${running}" data-run-state="${esc(exp.id)}" ${blocked?'disabled title="Resolve the frozen rights and readiness gates"':''}><span class="run-switch-track"><i></i></span><strong>${running?'On':'Off'}</strong></button></div><div class="experiment-meta"><span>${esc(exp.state.replaceAll('_',' '))}</span><span>${esc(exp.spec.instrument)} / ${esc(exp.spec.dated_contract)}</span><span>SHA ${esc(exp.spec_hash.slice(0,12))}</span></div><p>Signal: ${esc(exp.spec.signal_definition)}</p><p>Source: ${esc(exp.spec.source_id)} · rights ${exp.spec.rights_confirmed?'user confirmed, verification pending':'unconfirmed'} · frozen ${esc(exp.frozen_at)}${exp.run_started_at?` · run started ${esc(exp.run_started_at)}`:''}. All outcomes are local paper research.</p>${renderOperations(exp.id,exp.state)}<div class="result-grid"><div><small>Variant records</small><strong>${report.observations}</strong></div><div><small>Paired resolved</small><strong>${comparison.pairedResolved}</strong></div><div><small>Primary difference</small><strong>${comparison.pointDifference==null?'—':`${(comparison.pointDifference*100).toFixed(1)} pp`}</strong></div><div><small>Scientific state</small><strong>${esc(comparison.state.replaceAll('_',' '))}</strong></div></div><p>Primary: ${esc(comparison.candidateVariant)} vs ${esc(comparison.baselineVariant)}. Descriptive 95% paired interval: ${comparison.approximate95?`${(comparison.approximate95[0]*100).toFixed(1)} to ${(comparison.approximate95[1]*100).toFixed(1)} pp`:'unavailable'}. ${esc(comparison.intervalMethod)}.</p><h4>Primary comparison by timeframe and line</h4><div class="result-table-wrap"><table class="result-table"><thead><tr><th>Timeframe</th><th>Line</th><th>Paired</th><th>Sessions</th><th>Difference</th><th>95% interval</th><th>State</th></tr></thead><tbody>${pairedRows}</tbody></table></div><h4>All frozen rule variants</h4><div class="result-table-wrap"><table class="result-table"><thead><tr><th>Timeframe</th><th>Line</th><th>Rule</th><th>Resolved</th><th>Target</th><th>Rate</th><th>Wilson 95%</th><th>Mean gross R</th></tr></thead><tbody>${rows||'<tr><td colspan="8">No resolved forward observations yet.</td></tr>'}</tbody></table></div><div class="brief-card"><h4>Scientist result brief</h4><p>${esc(brief.findings)}</p><p>${esc(brief.requirements)}</p><label for="battyPrompt">Scoped Batty upgrade prompt</label><textarea id="battyPrompt" readonly>${esc(brief.battyPrompt)}</textarea><button class="secondary-button" type="button" id="copyBattyPrompt">Copy prompt</button><p><small>Prompt generation does not dispatch Batty or deploy code. Report SHA-256: ${esc(report.reportHash)}</small></p></div>`;
    if(scroll)$('#experiments').scrollIntoView({behavior:'smooth'});
  } catch(error){$('#experimentDetail').textContent=`Report unavailable: ${error.message}`;}
}

$('#timeframeChecks').innerHTML=['4H','1H','30M','15M','5M','3M','1M'].map(tf=>`<label><input type="checkbox" name="timeframes" value="${tf}" checked> ${tf}</label>`).join('');
$('#indicatorCards').addEventListener('click',event=>{const measure=event.target.closest('[data-measure]');if(measure)return openSetup(measure.dataset.measure);const profile=event.target.closest('[data-profile]');if(profile){state.selectedIndicator=profile.dataset.profile;state.profileTab='overview';renderProfile();$('#profile').scrollIntoView({behavior:'smooth'});}});
$('#experimentList').addEventListener('click',event=>{const item=event.target.closest('[data-experiment]');if(item)void selectExperiment(item.dataset.experiment);});
$('#experimentDetail').addEventListener('click',async event=>{const control=event.target.closest('[data-run-state]');if(control){control.disabled=true;$('#runStatus').textContent='Changing observer state…';try{const exp=state.experiments.find(item=>item.id===control.dataset.runState);await post('run-state',{experiment_id:exp.id,running:exp.state!=='armed'});await refreshExperiments();}catch(error){$('#runStatus').textContent=`Could not change state: ${error.message}`;control.disabled=false;}return;}if(event.target.id==='copyBattyPrompt')navigator.clipboard.writeText($('#battyPrompt').value).then(()=>event.target.textContent='Copied');});
document.querySelectorAll('[data-profile-tab]').forEach(button=>button.addEventListener('click',()=>{state.profileTab=button.dataset.profileTab;renderProfile();}));
$('#heroMeasure').addEventListener('click',()=>openSetup(state.selectedIndicator));
$('#profileMeasure').addEventListener('click',()=>openSetup(state.selectedIndicator));
$('#setupIndicator').addEventListener('change',updateAdapter);
$('#closeSetup').addEventListener('click',()=>{if(embedded)window.parent.postMessage({type:'indicator-measure-close'},location.origin);else $('#measureDialog').close();});
$('#chatChoices').addEventListener('click',event=>{const button=event.target.closest('[data-answer]');if(button)void answerSetup(button.dataset.answer,button.textContent);});
$('#sendSetupReply').addEventListener('click',()=>void answerSetup($('#setupReply').value));
$('#setupReply').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void answerSetup($('#setupReply').value);}});
$('#editProtocol').addEventListener('click',()=>{const open=$('#measureDialog').classList.toggle('advanced-open');$('#editProtocol').setAttribute('aria-expanded',String(open));$('#editProtocol').textContent=open?'Hide exact protocol ↑':'Review or edit the exact protocol ↓';if(!open&&state.chat?.phase==='plan_edit')void answerSetup('done','Done editing');});
$('#measureForm').addEventListener('change',event=>{if(['entries','targets','break_evens'].includes(event.target.name))refreshCandidateOptions();if(state.chat?.phase==='review')renderReview();});
$('#measureForm').addEventListener('submit',async event=>{event.preventDefault();if(!validateStep())return;const button=$('#saveSetup');button.disabled=true;$('#setupStatus').textContent='Freezing experiment…';try{const created=await post('experiments',collect());$('#setupStatus').textContent=`Frozen ${created.id.slice(0,8)} · ${created.state.replaceAll('_',' ')}.`;await refreshExperiments();await selectExperiment(created.id,false);if(embedded)window.parent.postMessage({type:'indicator-measure-created',experimentId:created.id},location.origin);else{$('#measureDialog').close();$('#experiments').scrollIntoView({behavior:'smooth'});}}catch(error){$('#setupStatus').textContent=error.message;}finally{button.disabled=false;}});
async function init(){try{refreshCandidateOptions();const response=await fetch('./api/indicator-agent/catalog',{cache:'no-store'});if(!response.ok)throw new Error(`Catalog HTTP ${response.status}`);const catalog=await response.json();state.catalog=catalog.indicators;state.selectedIndicator=params.get('indicator')||'liquidity';renderCatalog();await refreshExperiments();if(params.get('setup')==='1'||embedded)openSetup(state.selectedIndicator);if(params.get('experiment'))await selectExperiment(params.get('experiment'),!embedded);}catch(error){$('#libraryStatus').textContent=`Catalog unavailable · ${error.message}`;}}
init();
setInterval(refreshExperiments,20000);
