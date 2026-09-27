const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const money = (value, currency = 'USD') => value == null ? '—' : new Intl.NumberFormat(undefined,{style:'currency',currency,maximumFractionDigits:2}).format(value);
const quantity = value => new Intl.NumberFormat(undefined,{maximumFractionDigits:6}).format(Number(value)||0);
const dateTime = value => value ? new Date(value).toLocaleString([], {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}) : '—';
let workspace = {teams:[],members:[],accounts:[],imports:[]};
let ledger = {trades:[],reported_trades:[],paper_trades:[],open_positions:[],currencies:[],fills_count:0,closed_count:0,unscored_count:0};
let selectedCsv = null;
let csvText = '';
let csvHeaders = [];

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}
function post(url, body) {
  return request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
}
function stateMessage(message, bad = false) {
  const el = $('#journalApiState'); el.textContent = message; el.className = `api-state ${bad?'bad':'ok'}`;
}
function showImportMessage(message, bad = false, detail = '') {
  const el = $('#csvPreviewState'); el.hidden = false; el.className = `tj-preview-state${bad?' error':''}`;
  el.innerHTML = `${esc(message)}${detail}`;
}
function selectedFilters() {
  return {team_id:$('#filterTeam').value,member_id:$('#filterMember').value,account_id:$('#filterAccount').value};
}
async function refreshLedger() {
  try {
    const params = new URLSearchParams(Object.entries(selectedFilters()).filter(([,value])=>value));
    const payload = await request(`/api/trade-journal${params.size?`?${params}`:''}`);
    workspace = payload.workspace; ledger = payload.ledger;
    renderWorkspace(); renderLedger(); renderReportedTrades(); renderPaperTrades(); renderImports(); stateMessage('Journal is current');
  } catch (error) { stateMessage(error.message,true); }
}
function optionsFor(select, entries, valueKey, labelFn, firstLabel, selectedValue = '') {
  const previous = selectedValue || select.value;
  select.innerHTML = `${firstLabel==null?'':`<option value="">${esc(firstLabel)}</option>`}` + entries.map(item=>`<option value="${esc(item[valueKey])}">${esc(labelFn(item))}</option>`).join('');
  if (entries.some(item=>item[valueKey]===previous)) select.value=previous;
}
function renderWorkspace() {
  const teamEntries = workspace.teams;
  optionsFor($('#filterTeam'),teamEntries,'team_id',row=>row.name,'All teams');
  optionsFor($('#memberTeam'),teamEntries,'team_id',row=>row.name,'Choose a team');
  optionsFor($('#accountTeam'),teamEntries,'team_id',row=>row.name,'Choose a team');
  optionsFor($('#filterMember'),workspace.members,'member_id',row=>row.display_name,'All traders');
  optionsFor($('#accountMember'),workspace.members.filter(row=>!$('#accountTeam').value || row.team_id===$('#accountTeam').value),'member_id',row=>row.display_name,'Unassigned');
  optionsFor($('#paperAccount'),workspace.accounts,'account_id',row=>`${row.name} · ${row.broker}`,'Choose an account');
  const selectedPaperAccount=workspace.accounts.find(row=>row.account_id===$('#paperAccount').value);
  optionsFor($('#paperMember'),workspace.members.filter(row=>!selectedPaperAccount || row.team_id===selectedPaperAccount.team_id),'member_id',row=>row.display_name,'Use account trader');
  optionsFor($('#filterAccount'),workspace.accounts,'account_id',row=>`${row.name} · ${row.broker}`,'All accounts');
  optionsFor($('#importAccount'),workspace.accounts,'account_id',row=>`${row.name} · ${row.broker}${row.member_name?` · ${row.member_name}`:''}`,'Choose destination');
  $('#accountMember').disabled=!$('#accountTeam').value;
  $('#paperMember').disabled=!selectedPaperAccount;
  const roster = $('#accountRoster');
  roster.innerHTML = workspace.accounts.length ? workspace.accounts.map(row=>`<div class="tj-account-row"><div><strong>${esc(row.name)}</strong><small>${esc(row.team_name)} · ${esc(row.member_name||'Unassigned trader')}</small></div><div><strong>${esc(row.broker)}</strong><small>${esc(row.currency)} · ${esc(row.timezone)}</small></div></div>`).join('') : '<div class="tj-preview-state">Imported broker accounts will appear here. Add an account manually when preparing CSV history.</div>';
}
function renderLedger() {
  const trades=ledger.trades||[];
  const scored=trades.filter(row=>row.net_pnl!=null);
  const wins=scored.filter(row=>row.net_pnl>0).length;
  const stats=[
    ['Executions',ledger.fills_count||0,'imported fills'],
    ['Closed trades',ledger.closed_count||0,'FIFO matched'],
    ['Win rate',scored.length?`${(wins/scored.length*100).toFixed(1)}%`:'—',`${wins} winning trades with known multiplier`],
    ['Open positions',(ledger.open_positions||[]).length,'unmatched opening fills'],
    ['Broker reports',(ledger.reported_trades||[]).length,'reported separately from fills'],
    ['P&L currencies',(ledger.currencies||[]).length||'—','fill-based totals shown below'],
  ];
  $('#journalStats').innerHTML=stats.map(([label,value,note])=>`<div class="tj-stat"><small>${label}</small><strong>${value}</strong><span>${note}</span></div>`).join('');
  $('#ledgerMeta').textContent=`${ledger.fills_count||0} executions · ${trades.length} reconstructed closes · ${ledger.unscored_count||0} need a multiplier`;
  $('#tradeRows').innerHTML=trades.length?trades.map(row=>`<tr>
    <td>${dateTime(row.exit_time)}<small>Entry ${dateTime(row.entry_time)}</small></td>
    <td>${esc(row.member_name||'Unassigned')}<small>${esc(row.account_name)} · ${esc(row.broker)}</small></td>
    <td><strong>${esc(row.symbol)}</strong><small>${esc(row.asset_class)}</small></td>
    <td class="tj-${esc(row.side)}">${esc(row.side.toUpperCase())}</td>
    <td>${quantity(row.quantity)}</td><td>${quantity(row.entry_price)} → ${quantity(row.exit_price)}</td>
    <td class="${row.gross_pnl==null?'':row.gross_pnl>=0?'tj-positive':'tj-negative'}">${money(row.gross_pnl,row.currency)}</td>
    <td>${money(row.costs,row.currency)}</td>
    <td class="${row.net_pnl==null?'':row.net_pnl>=0?'tj-positive':'tj-negative'}">${money(row.net_pnl,row.currency)}</td>
    <td><button type="button" class="tj-review-button" data-review="${row.trade_id}">${row.notes||row.tags?.length||row.satisfaction?'Edit review':'Add review'}</button>${row.tags?.length?`<small>${esc(row.tags.join(' · '))}</small>`:''}</td>
  </tr>`).join(''):'<tr><td colspan="10" class="tj-empty">No closed trades match these filters. Upload broker executions to start the journal.</td></tr>';
  document.querySelectorAll('[data-review]').forEach(button=>button.addEventListener('click',()=>openReview(button.dataset.review)));
  const positions=ledger.open_positions||[];
  $('#openPositions').innerHTML=positions.length?`<span class="tj-open-title">Open from imported fills</span>`+positions.map(row=>`<span class="tj-position-chip">${esc(row.account_name)} · ${esc(row.symbol)} ${esc(row.side)} ${quantity(row.quantity)}</span>`).join(''):'';
  $('#currencyTotals').innerHTML=(ledger.currencies||[]).map(row=>`<span class="tj-currency-chip">${row.trades} closed · ${row.wins} wins · net <strong class="${row.net_pnl>=0?'tj-positive':'tj-negative'}">${money(row.net_pnl,row.currency)}</strong></span>`).join('');
}
function renderReportedTrades() {
  const rows=ledger.reported_trades||[];
  const syncs=workspace.broker_syncs||[];
  $('#robinhoodSyncMeta').textContent=syncs.length?`Last MCP import ${dateTime(syncs[0].last_sync_at)}`:'No Robinhood snapshot imported';
  $('#reportedTradeRows').innerHTML=rows.length?rows.map(row=>`<tr>
    <td>${dateTime(row.trade_time)}</td>
    <td>${esc(row.member_name||'Unassigned')}<small>${esc(row.account_name)}</small></td>
    <td><strong>${esc(row.symbol)}</strong><small>Broker summary</small></td>
    <td>${esc(row.side.toUpperCase())}</td>
    <td>${quantity(row.quantity)}</td>
    <td>${money(row.price,row.currency)}</td>
    <td class="${row.reported_realized_pnl==null?'':row.reported_realized_pnl>=0?'tj-positive':'tj-negative'}">${row.reported_realized_pnl==null?'Not supplied':money(row.reported_realized_pnl,row.currency)}</td>
    <td>Robinhood MCP<small>Read only</small></td>
  </tr>`).join(''):'<tr><td colspan="8" class="tj-empty">No Robinhood broker-reported trades match these filters.</td></tr>';
}
function renderPaperTrades() {
  const rows=ledger.paper_trades||[];
  const open=rows.filter(row=>row.status==='open').length;
  $('#paperTradeMeta').textContent=`${open} open · ${rows.length-open} closed · simulated gross only`;
  $('#paperTradeRows').innerHTML=rows.length?rows.map(row=>`<tr>
    <td>${row.status==='open'?'OPEN':`CLOSED${row.exit_time?` · ${dateTime(row.exit_time)}`:''}`}<small>Entry ${dateTime(row.entry_time)}</small></td>
    <td>${esc(row.member_name||'Unassigned')}<small>${esc(row.account_name)} · ${esc(row.broker)}</small></td>
    <td><strong>${esc(row.symbol)}</strong><small>${esc(row.asset_class)}</small></td>
    <td class="tj-${esc(row.side)}">${esc(row.side.toUpperCase())}</td>
    <td>${quantity(row.quantity)}</td>
    <td>${money(row.entry_price,row.currency)} · ${row.stop_price==null?'—':money(row.stop_price,row.currency)} · ${row.target_price==null?'—':money(row.target_price,row.currency)}</td>
    <td>${row.exit_price==null?'—':money(row.exit_price,row.currency)}</td>
    <td class="${row.gross_pnl==null?'':row.gross_pnl>=0?'tj-positive':'tj-negative'}">${row.gross_pnl==null?'—':money(row.gross_pnl,row.currency)}</td>
    <td>${row.r_multiple==null?'—':`${Number(row.r_multiple).toFixed(2)}R`}</td>
    <td>${row.status==='open'?`<button type="button" class="tj-review-button" data-paper-close="${esc(row.paper_trade_id)}">Record exit</button>`:'Paper'}</td>
  </tr>`).join(''):'<tr><td colspan="10" class="tj-empty">No paper trades match these filters. Log a simulated trade above to begin.</td></tr>';
  document.querySelectorAll('[data-paper-close]').forEach(button=>button.addEventListener('click',()=>openPaperClose(button.dataset.paperClose)));
}
function renderImports() {
  const rows=workspace.imports||[];
  $('#importRows').innerHTML=rows.length?rows.map(row=>`<tr><td>${dateTime(row.imported_at)}</td><td>${esc(row.filename)}<small>${esc(row.broker)}</small></td><td>${esc(row.account_name)}</td><td>${row.total_rows}</td><td>${row.imported_rows}</td><td>${row.duplicate_rows}</td><td>${row.rejected_rows?`<details><summary>${row.rejected_rows} rows</summary><small>${(row.row_errors||[]).slice(0,30).map(item=>`Row ${item.row}: ${esc(item.error)}`).join('<br>')}</small></details>`:'0'}</td></tr>`).join(''):'<tr><td colspan="7" class="tj-empty">No files imported yet.</td></tr>';
}
function guessHeader(field, headers) {
  const synonyms={
    execution_time:['execution time','trade time','date/time','datetime','timestamp','time','date','date time'],
    symbol:['symbol','ticker','contract','instrument','underlying'], side:['side','buy/sell','action','transaction type','type'],
    quantity:['quantity','qty','shares','size','filled quantity','filled qty'], price:['price','fill price','execution price','avg price'],
    execution_id:['execution id','exec id','trade id','transaction id','executionid'], asset_class:['asset class','security type','asset type','type of instrument'],
    commission:['commission','comm','broker commission'], fees:['fees','fee','other fees','exchange fees'], currency:['currency','ccy'],
    multiplier:['multiplier','point value','contract multiplier'], order_id:['order id','orderid','order number'], exchange:['exchange','venue'],
  };
  const normalized=headers.map(header=>header.trim().toLowerCase());
  const index=normalized.findIndex(header=>synonyms[field]?.includes(header));
  return index<0?'':headers[index];
}
const mappingFields=[['execution_time','Execution date/time',true],['symbol','Symbol / contract',true],['side','Buy or sell',true],['quantity','Quantity',true],['price','Fill price',true],['execution_id','Execution ID',false],['asset_class','Asset class',false],['commission','Commission',false],['fees','Other fees',false],['currency','Currency',false],['multiplier','Contract multiplier',false],['order_id','Order ID',false],['exchange','Exchange',false]];
function renderMapping() {
  const container=$('#csvMapping'); container.hidden=false;
  container.innerHTML=mappingFields.map(([field,label,required])=>`<label class="tj-map-field${required?' required':''}">${label}<select data-map="${field}"><option value="">${required?'Select column':'Skip'}</option>${csvHeaders.map(header=>`<option value="${esc(header)}" ${guessHeader(field,csvHeaders)===header?'selected':''}>${esc(header)}</option>`).join('')}</select></label>`).join('');
  container.querySelectorAll('[data-map]').forEach(select=>select.addEventListener('change',updateImportButton));
  updateImportButton();
}
function currentMapping() { return Object.fromEntries([...document.querySelectorAll('[data-map]')].map(select=>[select.dataset.map,select.value])); }
function updateImportButton() {
  const mapping=currentMapping();
  $('#importCsv').disabled=!csvText||!$('#importAccount').value||mappingFields.filter(row=>row[2]).some(row=>!mapping[row[0]]);
}
async function handleFile(file) {
  if(!file)return;
  selectedCsv=file; $('#csvFileName').textContent=file.name; $('#csvDrop').classList.add('has-file');
  $('#csvMapping').hidden=true; $('#csvPreviewState').hidden=true; $('#importCsv').disabled=true;
  try {
    if(file.size>20_000_000) throw new Error('CSV files must be smaller than 20 MB');
    csvText=await file.text();
    $('#previewCsv').disabled=false;
    showImportMessage('File loaded. Read the headers, check the suggested mapping, then import.');
  } catch(error) { csvText=''; $('#previewCsv').disabled=true; showImportMessage(error.message,true); }
}
async function previewCsv() {
  try {
    const preview=await post('/api/trade-journal/preview',{csv_text:csvText});
    csvHeaders=preview.headers; renderMapping();
    const sample=preview.sample[0]?` · first row: ${Object.entries(preview.sample[0]).slice(0,4).map(([key,value])=>`${key}: ${value}`).join(' / ')}`:'';
    showImportMessage(`${preview.total_rows} non-empty rows · ${preview.headers.length} columns${sample?`<br>${esc(sample)}`:''}`);
  } catch(error) { showImportMessage(error.message,true); }
}
async function importCsv() {
  const button=$('#importCsv'); button.disabled=true; button.textContent='Importing…';
  try {
    const result=await post('/api/trade-journal/import',{account_id:$('#importAccount').value,filename:selectedCsv?.name||'trades.csv',csv_text:csvText,mapping:currentMapping()});
    const detail=result.errors?.length?`<details><summary>Show first ${result.errors.length} rejected row(s)</summary><div>${result.errors.map(item=>`Row ${item.row}: ${esc(item.error)}`).join('<br>')}</div></details>`:'';
    showImportMessage(result.already_imported?'This exact file was already imported.':`Imported ${result.imported_rows} executions · ${result.duplicate_rows} duplicates skipped · ${result.rejected_rows} rows need correction.`,result.rejected_rows>0,detail);
    await refreshLedger();
  } catch(error) { showImportMessage(error.message,true); }
  finally { button.textContent='Import executions'; updateImportButton(); }
}
function openReview(tradeId) {
  const trade=ledger.trades.find(row=>row.trade_id===tradeId); if(!trade)return;
  $('#reviewTradeId').value=trade.trade_id;
  $('#reviewTitle').textContent=`${trade.side.toUpperCase()} ${trade.symbol} · ${dateTime(trade.exit_time)}`;
  $('#reviewTags').value=(trade.tags||[]).join(', '); $('#reviewNotes').value=trade.notes||'';
  $('#reviewSatisfaction').value=trade.satisfaction||''; $('#reviewDialog').showModal();
}
function openPaperClose(tradeId) {
  const trade=(ledger.paper_trades||[]).find(row=>row.paper_trade_id===tradeId); if(!trade)return;
  $('#paperCloseTradeId').value=trade.paper_trade_id;
  $('#paperCloseTitle').textContent=`Close paper ${trade.side} · ${trade.symbol}`;
  $('#paperExitPrice').value=''; $('#paperCloseNotes').value=''; $('#paperCloseDialog').showModal();
}
function updatePaperSideOptions() {
  const assetClass=$('#paperAssetClass').value;
  const defaults={equity:'1',crypto:'1',option:'100'};
  $('#paperMultiplier').value=defaults[assetClass]||'';
}
function bindEvents() {
  $('#refreshLedger').addEventListener('click',refreshLedger);
  ['filterTeam','filterMember','filterAccount'].forEach(id=>document.getElementById(id).addEventListener('change',refreshLedger));
  $('#accountTeam').addEventListener('change',()=>renderWorkspace());
  $('#memberTeam').addEventListener('change',()=>renderWorkspace());
  $('#paperAccount').addEventListener('change',()=>renderWorkspace());
  $('#paperAssetClass').addEventListener('change',updatePaperSideOptions);
  $('#csvFile').addEventListener('change',event=>handleFile(event.target.files[0]));
  $('#importAccount').addEventListener('change',updateImportButton);
  $('#previewCsv').addEventListener('click',previewCsv);
  $('#importCsv').addEventListener('click',importCsv);
  $('#csvDrop').addEventListener('dragover',event=>{event.preventDefault();$('#csvDrop').classList.add('has-file');});
  $('#csvDrop').addEventListener('dragleave',()=>$('#csvDrop').classList.toggle('has-file',Boolean(selectedCsv)));
  $('#csvDrop').addEventListener('drop',event=>{event.preventDefault();handleFile(event.dataTransfer.files[0]);});
  $('#teamForm').addEventListener('submit',async event=>{event.preventDefault();try{await post('/api/trade-journal/teams',{name:$('#teamName').value});$('#teamName').value='';await refreshLedger();}catch(error){stateMessage(error.message,true);}});
  $('#memberForm').addEventListener('submit',async event=>{event.preventDefault();try{await post('/api/trade-journal/members',{team_id:$('#memberTeam').value,display_name:$('#memberName').value});$('#memberName').value='';await refreshLedger();}catch(error){stateMessage(error.message,true);}});
  $('#accountForm').addEventListener('submit',async event=>{event.preventDefault();try{await post('/api/trade-journal/accounts',{team_id:$('#accountTeam').value,member_id:$('#accountMember').value,broker:$('#accountBroker').value,name:$('#accountName').value,external_ref:$('#accountRef').value,currency:$('#accountCurrency').value,timezone:$('#accountTimezone').value});$('#accountName').value='';$('#accountRef').value='';await refreshLedger();}catch(error){stateMessage(error.message,true);}});
  $('#reviewForm').addEventListener('submit',async event=>{event.preventDefault();try{await post('/api/trade-journal/reviews',{trade_id:$('#reviewTradeId').value,tags:$('#reviewTags').value,notes:$('#reviewNotes').value,satisfaction:$('#reviewSatisfaction').value});$('#reviewDialog').close();await refreshLedger();}catch(error){stateMessage(error.message,true);}});
  $('#cancelReview').addEventListener('click',()=>$('#reviewDialog').close());
  $('#paperTradeForm').addEventListener('submit',async event=>{event.preventDefault();try{await post('/api/trade-journal/paper-trades',{account_id:$('#paperAccount').value,member_id:$('#paperMember').value,asset_class:$('#paperAssetClass').value,symbol:$('#paperSymbol').value,side:$('#paperSide').value,quantity:$('#paperQuantity').value,entry_price:$('#paperEntry').value,stop_price:$('#paperStop').value,target_price:$('#paperTarget').value,multiplier:$('#paperMultiplier').value,notes:$('#paperNotes').value});$('#paperTradeForm').reset();$('#paperQuantity').value='1';$('#paperAssetClass').value='equity';updatePaperSideOptions();await refreshLedger();stateMessage('Paper trade recorded · no broker order sent');}catch(error){stateMessage(error.message,true);}});
  $('#paperCloseForm').addEventListener('submit',async event=>{event.preventDefault();try{await post('/api/trade-journal/paper-trades/close',{paper_trade_id:$('#paperCloseTradeId').value,exit_price:$('#paperExitPrice').value,close_notes:$('#paperCloseNotes').value});$('#paperCloseDialog').close();await refreshLedger();stateMessage('Paper trade closed · simulated result recorded');}catch(error){stateMessage(error.message,true);}});
  $('#cancelPaperClose').addEventListener('click',()=>$('#paperCloseDialog').close());
}
bindEvents(); updatePaperSideOptions(); refreshLedger();
