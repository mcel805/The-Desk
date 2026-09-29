const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const state = {catalog:[], protocols:[], proposals:[], report:null};
const metricOptions = {event:['precision','recall','f1','accuracy'],numeric:['mae','rmse']};
const indicatorArt = {
  'volume-profile':['volume-profile-color.png','Volume Profile'],
  fibonacci:['fibonacci-color.png','Fibonacci'],
  'liquidity-zones':['liquidity-zones-color.png','Liquidity Zones'],
  'daily-bias':['daily-bias-color.png','Daily Bias'],
  'elliott-wave':['elliott-wave-color.png','Elliott Wave'],
  'confirmed-swings':['confirmed-swings-color.png','Confirmed Swings'],
  confluence:['convergence-color.png','Confluence'],
  'premium-discount':['premium-discount-color.png','Premium / Discount'],
};

function message(value, error=false) {
  const element = $('#agentMessage');
  element.textContent = value;
  element.classList.toggle('error', error);
}

async function api(path, options={}) {
  const response = await fetch(`/api/indicator-agent/${path}`, {cache:'no-store', ...options});
  let body;
  try { body = await response.json(); } catch { throw new Error(`Server returned ${response.status} without JSON`); }
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

async function post(path, payload) {
  return api(path, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
}

function formObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function activeIndicator() { return $('#indicatorSelect').value; }
function activeProtocol() { return $('#protocolSelect').value; }

function populateMetrics() {
  const type = $('#protocolForm [name=metric_type]').value;
  const select = $('#metricSelect');
  select.replaceChildren(...metricOptions[type].map((metric) => new Option(metric.toUpperCase(), metric)));
}

function renderCatalog() {
  const previous = activeIndicator();
  const requested = new URLSearchParams(location.search).get('indicator');
  $('#indicatorSelect').replaceChildren(...state.catalog.map((item) => new Option(item.name, item.id)));
  if (state.catalog.some((item) => item.id === previous)) $('#indicatorSelect').value = previous;
  else if (state.catalog.some((item) => item.id === requested)) $('#indicatorSelect').value = requested;
  const item = state.catalog.find((entry) => entry.id === activeIndicator());
  const art = indicatorArt[item?.id];
  if (art) {
    $('#activeIndicatorArt').src = `./tool-belt-assets/${art[0]}`;
    $('#activeIndicatorArt').alt = `Colored ${art[1]} indicator illustration`;
    $('#activeIndicatorArtLabel').textContent = `${art[1].toUpperCase()} · ACTIVE`;
  }
  $('#catalogStatus').textContent = item ? `${item.protocolCount} PROTOCOL${item.protocolCount === 1 ? '' : 'S'}` : 'UNAVAILABLE';
  $('#indicatorSummary').innerHTML = item ? `<strong>${escapeHtml(item.name)}</strong><br>Current catalog purpose: ${escapeHtml(item.provisionalPurpose)}. Scoring state: <strong>${escapeHtml(item.scoringState)}</strong>. A Scientist must define a single measurable job and independent outcome before a performance claim.` : 'Catalog unavailable.';
  renderProtocolSelect();
  renderProposals();
}

function renderProtocolSelect() {
  const prior = activeProtocol();
  const protocols = state.protocols.filter((item) => item.indicator_id === activeIndicator());
  const select = $('#protocolSelect');
  select.replaceChildren(new Option(protocols.length ? 'Select protocol' : 'No protocols yet', ''), ...protocols.map((item) => new Option(`${item.title} · ${item.state} · ${item.candidate_version}`, item.id)));
  if (protocols.some((item) => item.id === prior)) select.value = prior;
  if (!select.value && protocols.length) select.value = protocols[0].id;
  renderProtocolDetail();
}

function renderProtocolDetail() {
  const item = state.protocols.find((entry) => entry.id === activeProtocol());
  state.report = null;
  $('#reportView').innerHTML = item ? '<p>Select Refresh report to calculate the latest paired result.</p>' : '<p>No protocol selected.</p>';
  $('#protocolState').textContent = item ? item.state.toUpperCase() : 'NO PROTOCOL';
  $('#freezeButton').disabled = !item || item.state !== 'draft';
  $('#uploadButton').disabled = !item || item.state !== 'frozen';
  $('#freezeScientist').value = item?.scientist || '';
  $('#decisionForm [name=scientist]').value = item?.scientist || '';
  $('#protocolDetail').innerHTML = item ? `<strong>${escapeHtml(item.title)}</strong> · ${escapeHtml(item.metric_type)} / ${escapeHtml(item.primary_metric)}<br>
    One purpose: ${escapeHtml(item.purpose)}<br>Outcome: ${escapeHtml(item.outcome_definition)}<br>
    Baseline ${escapeHtml(item.baseline_version)} → candidate ${escapeHtml(item.candidate_version)} · ${escapeHtml(item.instrument)} / ${escapeHtml(item.timeframe)}<br>
    Source: ${escapeHtml(item.source_id)} · minimum ${item.min_rows} rows · Scientist record: ${escapeHtml(item.scientist)}<br>
    <span class="report-hash">Protocol SHA-256: ${escapeHtml(item.protocol_hash)}</span>` : 'Create a Scientist protocol to begin a measured study.';
  $('#jsonExample').textContent = JSON.stringify({observations:[{
    observation_id:'unique-row-id',session_id:'session-or-trade-date',source_id:item?.source_id || 'exact-protocol-source-id',
    source_asof:'2026-09-29T14:55:00Z',decision_cutoff:'2026-09-29T15:00:00Z',outcome_time:'2026-09-29T16:00:00Z',
    input_hash:'64-lowercase-hex-characters-from-source-snapshot',
    truth:item?.metric_type === 'numeric' ? 1.2 : true,
    incumbent:item?.metric_type === 'numeric' ? 1.3 : false,
    candidate:item?.metric_type === 'numeric' ? 1.25 : true,
  }]},null,2);
}

function renderProposals() {
  const proposals = state.proposals.filter((item) => item.indicator_id === activeIndicator());
  const list = $('#proposalList');
  list.innerHTML = proposals.length ? proposals.map((item) => `<article class="agent-list-item"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.id.slice(0,8))} · ${item.events.length} lifecycle events · rollback ${escapeHtml(item.rollback_version)}</span><p>${escapeHtml(item.hypothesis)}</p><p>Expected gain: ${escapeHtml(item.expected_gain)}</p></article>`).join('') : '<p class="agent-help">No enhancement specs for this indicator yet.</p>';
  const eventSelect = $('#eventProposal');
  eventSelect.replaceChildren(...proposals.map((item) => new Option(item.title, item.id)));
  $('#eventForm button').disabled = proposals.length === 0;
}

const formatNumber = (value, pct=false) => value === null || value === undefined ? '—' : pct ? `${(value*100).toFixed(2)}%` : Number(value).toFixed(4);

function renderReport(report) {
  state.report = report;
  const pct = report.metricType === 'event';
  const days = report.daily.map((day) => `<tr><td>${escapeHtml(day.date)}</td><td>${day.rows}</td><td>${formatNumber(day.incumbent,pct)}</td><td>${formatNumber(day.candidate,pct)}</td><td>${formatNumber(day.improvement,pct)}</td></tr>`).join('');
  const interval = report.clusterBootstrap95 ? `${formatNumber(report.clusterBootstrap95[0],pct)} to ${formatNumber(report.clusterBootstrap95[1],pct)}` : 'Unavailable (<2 sessions or undefined metric)';
  $('#reportView').innerHTML = `<h3>Lab calculation · ${escapeHtml(report.scientificStatus.replaceAll('_',' '))}</h3>
    <div class="report-stats"><div class="report-stat"><small>SCORABLE ROWS</small><strong>${report.scorableRows}</strong></div><div class="report-stat"><small>SESSIONS</small><strong>${report.sessions}</strong></div><div class="report-stat"><small>INCUMBENT ${escapeHtml(report.primaryMetric.toUpperCase())}</small><strong>${formatNumber(report.incumbent,pct)}</strong></div><div class="report-stat"><small>CANDIDATE ${escapeHtml(report.primaryMetric.toUpperCase())}</small><strong>${formatNumber(report.candidate,pct)}</strong></div></div>
    <p><strong>Paired improvement:</strong> ${formatNumber(report.improvement,pct)} (positive is better). Descriptive 95% session-cluster interval: ${interval}. Minimum registered effect: ${formatNumber(report.minEffect,pct)}; minimum rows: ${report.minRows}.</p>
    <div class="report-warning">This calculation does not establish a gain or approve a version. Source and labels still need verification, and the Chief Scientist and independent reviewer must interpret the planned cohort.</div>
    <div class="report-table-wrap"><table class="report-table"><thead><tr><th>Cutoff date (UTC)</th><th>Rows</th><th>Incumbent</th><th>Candidate</th><th>Improvement</th></tr></thead><tbody>${days || '<tr><td colspan="5">No observations recorded.</td></tr>'}</tbody></table></div>
    <p>Latest recorded Scientist decision: <strong>${escapeHtml(report.lastDecision?.decision || 'none')}</strong>${report.lastDecision ? ` · ${escapeHtml(report.lastDecision.rationale)}` : ''}</p>
    <p class="report-hash">Report SHA-256: ${escapeHtml(report.reportHash)}<br>Row manifest SHA-256: ${escapeHtml(report.rowManifestHash)}</p>`;
}

async function refreshAll() {
  try {
    const [catalog, protocols, proposals] = await Promise.all([api('catalog'),api('protocols'),api('proposals')]);
    state.catalog = catalog.indicators;
    state.protocols = protocols.protocols;
    state.proposals = proposals.proposals;
    renderCatalog();
    message('Local ledger ready. Research records are paper/shadow only.');
  } catch (error) { message(error.message, true); }
}

async function refreshReport() {
  if (!activeProtocol()) return message('Select a protocol first.', true);
  try { renderReport(await api(`report?protocol_id=${encodeURIComponent(activeProtocol())}`)); message('Paired scorecard refreshed.'); }
  catch (error) { message(error.message, true); }
}

$('#protocolForm [name=metric_type]').addEventListener('change',populateMetrics);
$('#indicatorSelect').addEventListener('change',renderCatalog);
$('#protocolSelect').addEventListener('change',renderProtocolDetail);
$('#refreshReport').addEventListener('click',refreshReport);

$('#proposalForm').addEventListener('submit',async (event) => {
  event.preventDefault();
  try {
    const payload = {...formObject(event.currentTarget),indicator_id:activeIndicator(),protocol_id:activeProtocol() || null};
    const created = await post('proposals',payload);
    state.proposals.unshift({...created,events:[]});
    renderProposals();
    event.currentTarget.reset();
    message(`Build spec ${created.id.slice(0,8)} saved. Agent execution is not dispatched by this form.`);
  } catch (error) { message(error.message,true); }
});

$('#protocolForm').addEventListener('submit',async (event) => {
  event.preventDefault();
  try {
    const payload = {...formObject(event.currentTarget),indicator_id:activeIndicator()};
    payload.min_rows = Number(payload.min_rows);
    payload.min_effect = Number(payload.min_effect);
    const created = await post('protocols',payload);
    state.protocols.unshift(created);
    const catalogItem = state.catalog.find((item) => item.id === created.indicator_id);
    if (catalogItem) catalogItem.protocolCount++;
    renderCatalog();
    $('#protocolSelect').value = created.id;
    renderProtocolDetail();
    message(`Draft protocol ${created.id.slice(0,8)} saved. Verify every field before freezing.`);
  } catch (error) { message(error.message,true); }
});

$('#freezeButton').addEventListener('click',async () => {
  try {
    const result = await post('freeze',{protocol_id:activeProtocol(),scientist:$('#freezeScientist').value});
    const index = state.protocols.findIndex((item) => item.id === result.id);
    state.protocols[index] = result;
    renderProtocolSelect();
    message('Protocol frozen. This is a local recorded assertion; Scientist identity is not authenticated.');
  } catch (error) { message(error.message,true); }
});

$('#uploadButton').addEventListener('click',async () => {
  const file = $('#observationFile').files?.[0];
  if (!file) return message('Choose a JSON file first.',true);
  try {
    const parsed = JSON.parse(await file.text());
    const rows = Array.isArray(parsed) ? parsed : parsed.observations;
    const result = await post('observations',{protocol_id:activeProtocol(),observations:rows});
    $('#observationFile').value = '';
    message(`${result.accepted} append-only observations accepted. Source rights and labels still require independent verification.`);
    await refreshReport();
  } catch (error) { message(error.message,true); }
});

$('#decisionForm').addEventListener('submit',async (event) => {
  event.preventDefault();
  if (!state.report || state.report.protocol.id !== activeProtocol()) return message('Refresh the current report before a decision.',true);
  try {
    const result = await post('decisions',{...formObject(event.currentTarget),protocol_id:activeProtocol(),report_hash:state.report.reportHash});
    message(`Scientist decision ${result.decision} recorded as a local assertion. No code was promoted or reverted automatically.`);
    await refreshReport();
  } catch (error) { message(error.message,true); }
});

$('#eventForm').addEventListener('submit',async (event) => {
  event.preventDefault();
  try {
    const result = await post('proposal-events',formObject(event.currentTarget));
    const proposal = state.proposals.find((item) => item.id === result.proposal_id);
    if (proposal) proposal.events.push(result);
    renderProposals();
    message(`${result.stage.replaceAll('_',' ')} evidence appended. This record does not deploy chart code.`);
  } catch (error) { message(error.message,true); }
});

populateMetrics();
refreshAll();
