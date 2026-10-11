const $ = (selector) => document.querySelector(selector);
const state = {sources: [], events: [], reports: [], activeReport: null};
const categoryNames = {
  rates: 'Central banks, rates & sovereign funding', energy: 'Geopolitics, energy & supply chains',
  earnings: 'Earnings, index concentration & AI', economy: 'Macro, labor & household conditions',
  credit: 'Credit, banks & financial stability', regulation: 'Regulation, fiscal & trade policy',
  positioning: 'Volatility, positioning & market plumbing', calendar: 'Calendar & contract mechanics',
  international: 'International policy, FX & global growth',
};
const directionNames = {up: 'Could support higher', down: 'Could pressure lower', mixed: 'Two-way / mixed', unknown: 'Unsigned'};
const colors = {up: '#83d6a4', down: '#ef9b90', mixed: '#f1d78e', unknown: '#94a8b1'};

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function localStamp(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
function isoInput(selector) {
  const value = $(selector).value;
  return value ? new Date(value).toISOString() : '';
}
function setMessage(selector, text, error = false) {
  const node = $(selector); node.textContent = text; node.classList.toggle('error', error);
}
async function api(path, options = {}) {
  const response = await fetch(`/api/market-research/${path}`, {
    cache: 'no-store', ...options,
    headers: {'Content-Type': 'application/json', ...(options.headers || {})},
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function createOption(source) {
  const option = new Option(`${source.name} · ${source.rights_status.replace('_', ' ')}`, source.id);
  option.disabled = source.rights_status === 'restricted' || !source.enabled;
  return option;
}
function renderSources() {
  const enabled = state.sources.filter((source) => source.enabled);
  const sourceSelect = $('#eventSource');
  const currentEventSource = sourceSelect.value;
  sourceSelect.replaceChildren(new Option('Choose source', ''));
  enabled.forEach((source) => sourceSelect.add(createOption(source)));
  if (enabled.some((source) => source.id === currentEventSource)) sourceSelect.value = currentEventSource;
  const edit = $('#sourceEdit'); const selected = edit.value;
  edit.replaceChildren(new Option('Add a source…', '__new__'), ...state.sources.map((source) => new Option(source.name, source.id)));
  if (state.sources.some((source) => source.id === selected)) edit.value = selected;
  else edit.value = '__new__';
  showSourceEditor();
  $('#sourceRows').innerHTML = state.sources.map((source) => `<article class="mc-source">
    <div class="mc-source-head"><strong>${esc(source.name)}</strong><span class="mc-source-status ${esc(source.rights_status)}">${esc(source.rights_status.replace('_',' ').toUpperCase())}</span></div>
    <a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.url)}</a>
    <p>${esc(categoryNames[source.category] || source.category)} · ${source.feed_url ? 'RSS/Atom configured' : 'No feed configured'} · ${esc(source.last_scan_status)}${source.last_scan_at ? ` · ${esc(new Date(source.last_scan_at).toLocaleString())}` : ''}</p>
    <p>${esc(source.last_scan_note || source.rights_note || 'No scan or rights note recorded.')}</p>
  </article>`).join('');
  $('#discoveryRows').innerHTML = state.discoveries?.length ? state.discoveries.map((item) => `<article class="mc-source">
    <div class="mc-source-head"><strong>${esc(item.title)}</strong><span class="mc-source-status">${esc(item.review_status.toUpperCase())}</span></div>
    <p>${esc(item.source_name)} · ${esc(categoryNames[item.category] || item.category)} · published ${esc(item.published_at ? new Date(item.published_at).toLocaleString() : 'unknown')} · observed ${esc(new Date(item.observed_at).toLocaleString())}</p>
    <a href="${esc(item.item_url)}" target="_blank" rel="noopener noreferrer">Open primary source item</a>
    <p><button class="mc-button secondary" type="button" data-draft-discovery="${esc(item.id)}">Draft event from headline</button></p>
  </article>`).join('') : '<div class="mc-empty">No headlines scanned yet. Coverage only represents approved feeds and their last reported state.</div>';
}
function showSourceEditor() {
  if ($('#sourceEdit').value === '__new__') {
    $('#sourceName').value = ''; $('#sourceType').value = '';
    $('#sourceUrl').value = ''; $('#sourceFeedUrl').value = ''; $('#sourceCategory').value = 'calendar'; $('#sourceRights').value = 'review';
    $('#sourceRightsNote').value = '';
    return;
  }
  const source = state.sources.find((item) => item.id === $('#sourceEdit').value);
  if (!source) return;
  $('#sourceName').value = source.name;
  $('#sourceType').value = source.source_type;
  $('#sourceUrl').value = source.url;
  $('#sourceFeedUrl').value = source.feed_url || '';
  $('#sourceCategory').value = source.category || 'calendar';
  $('#sourceRights').value = source.rights_status;
  $('#sourceRightsNote').value = source.rights_note || '';
}
function renderChoices(product = $('#reportProduct').value.trim()) {
  const selected = new Set([...document.querySelectorAll('[data-event-choice]:checked')].map((node) => node.value));
  const choices = state.events.filter((event) => event.freshness === 'current' &&
    event.rights_status === 'approved_internal' && event.products.includes(product));
  $('#reportEventChoices').innerHTML = choices.length ? choices.map((event) => `<label class="mc-check">
    <input data-event-choice type="checkbox" value="${esc(event.id)}" ${selected.has(event.id) ? 'checked' : ''}>
    <span><b>${esc(event.title)}</b><br><small>${esc(event.source_name)} · ${esc(categoryNames[event.category] || event.category)} · ${esc(directionNames[event.direction])}</small></span>
    <small>${esc(new Date(event.event_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}))}</small>
  </label>`).join('') : '<p class="mc-muted">No current, rights-approved events match this product. A zero-event report remains “mixed / insufficient coverage.”</p>';
}
function renderEvents() {
  if (!state.events.length) {
    $('#eventRows').innerHTML = '<tr><td colspan="4" class="mc-muted">No events recorded. No current news has been fetched.</td></tr>';
    return;
  }
  $('#eventRows').innerHTML = state.events.map((event) => `<tr>
    <td><strong>${esc(event.title)}</strong><small>${esc(event.source_name)} · event ${esc(new Date(event.event_at).toLocaleString())}</small></td>
    <td>${esc(categoryNames[event.category] || event.category)}<br><span class="mc-pill ${esc(event.direction)}">${esc(directionNames[event.direction])}</span><span class="mc-pill">Impact ${event.impact}</span></td>
    <td>${event.products.map((product) => `<span class="mc-pill">${esc(product)}</span>`).join('')}</td>
    <td><span class="mc-pill ${esc(event.evidence_kind === 'rumor' ? 'stale' : event.freshness)}">${esc(event.evidence_kind.replace('_',' '))}</span><br><span class="mc-pill ${esc(event.rights_status)}">${esc(event.rights_status.replace('_',' '))}</span><br><small>${esc(event.confidence)} confidence · ${esc(event.freshness)}</small></td>
  </tr>`).join('');
}
function renderProfile(events = state.events) {
  const rows = events.filter((event) => event.freshness !== 'stale' && event.evidence_kind !== 'rumor');
  if (!rows.length) {
    $('#eventProfile').innerHTML = '<div class="mc-empty">No active, reportable events in this snapshot. Empty coverage does not mean neutral conditions.</div>';
    return;
  }
  const byCategory = new Map();
  for (const event of rows) {
    if (!byCategory.has(event.category)) byCategory.set(event.category, []);
    byCategory.get(event.category).push(event);
  }
  const day = $('#reportDate').value || new Date().toISOString().slice(0,10);
  $('#eventProfile').innerHTML = [...byCategory.entries()].map(([category, list]) => {
    const markers = list.map((event) => {
      const time = new Date(event.event_at);
      const date = `${time.getFullYear()}-${String(time.getMonth()+1).padStart(2,'0')}-${String(time.getDate()).padStart(2,'0')}`;
      const hour = time.getHours() + time.getMinutes()/60;
      const left = date === day ? Math.max(0, Math.min(100, hour/24*100)) : 2;
      const title = `${event.title} · ${time.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} · impact ${event.impact}/3 · ${directionNames[event.direction]}`;
      return `<i class="mc-marker" style="left:${left}%;--height:${Math.max(9,event.impact*10)}px;--marker:${colors[event.direction]}" title="${esc(title)}" aria-label="${esc(title)}"></i>`;
    }).join('');
    return `<div class="mc-profile-row"><div class="mc-profile-name"><span>${esc(categoryNames[category] || category)}</span><span>${list.length} event${list.length === 1 ? '' : 's'}</span></div><div class="mc-track">${markers}</div><div class="mc-time-labels"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div></div>`;
  }).join('');
}
function reportEvents(snapshot) {
  return (snapshot.active_events || []).map((event) => ({...event, freshness:'current'}));
}
function renderReport(report) {
  state.activeReport = report;
  const snapshot = report.snapshot || report;
  const events = snapshot.active_events || [];
  const coverage = snapshot.coverage_summary || {};
  $('#reportView').hidden = false;
  $('#reportView').innerHTML = `<article class="mc-report-card">
    <div class="mc-report-actions"><button type="button" class="mc-button secondary" data-print-report>Print / Save PDF</button></div>
    <div class="mc-kicker">FROZEN REPORT · ${esc(report.snapshot_hash || report.snapshotHash || '')}</div>
    <h3>${esc(snapshot.product)} · ${esc(snapshot.session_name)} · ${esc(snapshot.session_date)}</h3>
    <div class="mc-report-meta"><span class="mc-pill">Cutoff ${esc(new Date(snapshot.cutoff).toLocaleString())} · ${esc(snapshot.timezone_name)}</span><span class="mc-pill">${events.length} active event${events.length === 1 ? '' : 's'}</span><span class="mc-pill unknown">${esc(snapshot.directional_state.replaceAll('_',' '))}</span><span class="mc-pill">DESCRIPTIVE / UNSCORED</span></div>
    <p class="mc-muted">${esc(snapshot.method_note)} Coverage at cutoff: ${coverage.source_home_count ?? 0} source homes, ${coverage.configured_feed_count ?? 0} configured feeds, ${coverage.approved_feed_count ?? 0} approved feeds, ${coverage.scanned_by_cutoff_count ?? 0} scanned by cutoff, ${coverage.failed_by_cutoff_count ?? 0} failed scans. Coverage is not exhaustive.</p>
    ${events.length ? events.map((event) => `<section class="mc-event-card"><h4>${esc(event.title)} <span class="mc-pill ${esc(event.direction)}">${esc(directionNames[event.direction])}</span></h4><p><b>${esc(categoryNames[event.category] || event.category)}</b> · event ${esc(new Date(event.event_at).toLocaleString())} · observed ${esc(new Date(event.observed_at).toLocaleString())}</p><p>${esc(event.transmission)}</p>${event.counterpath ? `<p><b>Counterpath:</b> ${esc(event.counterpath)}</p>` : ''}<p class="mc-mini">Source: <a href="${esc(event.source_url)}" target="_blank" rel="noopener noreferrer">${esc(event.source_name)}</a> · ${esc(event.evidence_kind.replaceAll('_',' '))} · ${esc(event.confidence)} confidence · human impact ${event.impact}/3</p></section>`).join('') : '<div class="mc-empty">No events qualified for this report. The state is unknown / insufficient coverage, not neutral.</div>'}
    <p class="mc-mini">Frozen ${esc(report.created_at ? new Date(report.created_at).toLocaleString() : '')} · Input snapshot hash: <code>${esc(report.snapshot_hash || report.snapshotHash || '')}</code></p>
  </article>`;
  renderProfile(reportEvents(snapshot));
}
function renderHistory() {
  if (!state.reports.length) { $('#reportHistory').innerHTML = '<p class="mc-muted">No session reports saved.</p>'; return; }
  $('#reportHistory').innerHTML = state.reports.map((report, index) => `<button type="button" data-report-index="${index}"><strong>${esc(report.product)} · ${esc(report.session_name)}</strong><small>${esc(report.session_date)} · cutoff ${esc(new Date(report.cutoff).toLocaleString())} · ${report.event_ids.length} event${report.event_ids.length === 1 ? '' : 's'} · ${esc(report.snapshot_hash.slice(0,12))}…</small></button>`).join('');
}
async function refresh() {
  const data = await api('state');
  state.sources = data.sources;
  state.events = data.events;
  state.reports = data.reports;
  state.discoveries = data.discoveries || [];
  renderSources(); renderEvents(); renderChoices(); renderHistory(); renderProfile();
  const approvedFeeds = state.sources.filter((source) => source.enabled && source.rights_status === 'approved_internal' && source.feed_url).length;
  $('#mcStorageStatus').textContent = `${state.sources.length} source homes · ${approvedFeeds} approved feeds · ${state.discoveries.length} headlines · ${state.events.length} reviewed events · local only`;
}

$('#reportDate').value = localStamp().slice(0,10);
$('#reportSession').value = 'CME pre-open';
$('#reportTimezone').value = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
$('#reportCutoff').value = localStamp();
$('#eventAt').value = localStamp();
$('#eventObserved').value = localStamp();
$('#sourceEdit').addEventListener('change', showSourceEditor);
$('#reportProduct').addEventListener('input', () => renderChoices());
$('#reportDate').addEventListener('change', () => renderProfile());

$('#sourceForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const source = state.sources.find((item) => item.id === $('#sourceEdit').value);
  const name = $('#sourceName').value.trim();
  const sourceId = source?.id || name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  if (!sourceId || sourceId === '__new__') { setMessage('#sourceMessage', 'Enter a source name.', true); return; }
  try {
    await api('sources', {method:'POST', body:JSON.stringify({id:sourceId,
      name, source_type:$('#sourceType').value.trim(), url:$('#sourceUrl').value.trim(),
      feed_url:$('#sourceFeedUrl').value.trim(), category:$('#sourceCategory').value,
      enabled:source ? Boolean(source.enabled) : true,
      rights_status:$('#sourceRights').value, rights_note:$('#sourceRightsNote').value.trim()})});
    setMessage('#sourceMessage', 'Source rights status saved. This is a local human assertion; verify its scope and terms.');
    await refresh();
  } catch (error) { setMessage('#sourceMessage', error.message, true); }
});

$('#eventForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const observedAt = isoInput('#eventObserved');
  const hours = Number($('#eventExpiryHours').value);
  const expiry = new Date(new Date(observedAt).getTime() + hours*3600000).toISOString();
  const products = $('#eventProducts').value.split(',').map((value) => value.trim().toUpperCase()).filter(Boolean);
  const body = {
    source_id:$('#eventSource').value, category:$('#eventCategory').value,
    title:$('#eventTitle').value.trim(), source_url:$('#eventSourceUrl').value.trim(), event_at:isoInput('#eventAt'),
    observed_at:observedAt, published_at:isoInput('#eventPublished') || null,
    evidence_kind:$('#eventEvidence').value, direction:$('#eventDirection').value,
    impact:Number($('#eventImpact').value), confidence:$('#eventConfidence').value,
    products, transmission:$('#eventTransmission').value.trim(),
    counterpath:$('#eventCounterpath').value.trim(), expires_at:expiry,
  };
  try {
    await api('events', {method:'POST', body:JSON.stringify(body)});
    $('#eventForm').reset();
    $('#eventAt').value = localStamp(); $('#eventObserved').value = localStamp(); $('#eventExpiryHours').value = '24';
    setMessage('#eventMessage', 'Event added to the append-only local ledger.');
    await refresh();
  } catch (error) { setMessage('#eventMessage', error.message, true); }
});

$('#reportForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const eventIds = [...document.querySelectorAll('[data-event-choice]:checked')].map((node) => node.value);
  const body = {
    session_date:$('#reportDate').value, session_name:$('#reportSession').value.trim(),
    timezone_name:$('#reportTimezone').value.trim(), product:$('#reportProduct').value.trim().toUpperCase(),
    cutoff:isoInput('#reportCutoff'), event_ids:eventIds,
  };
  try {
    const result = await api('reports', {method:'POST', body:JSON.stringify(body)});
    setMessage('#reportMessage', 'Snapshot frozen. Empty or partial coverage remains explicit.');
    await refresh(); renderReport(result.report);
  } catch (error) { setMessage('#reportMessage', error.message, true); }
});

$('#reportHistory').addEventListener('click', (event) => {
  const button = event.target.closest('[data-report-index]');
  if (!button) return;
  renderReport(state.reports[Number(button.dataset.reportIndex)]);
});
$('#scanFeeds').addEventListener('click', async () => {
  $('#scanFeeds').disabled = true;
  setMessage('#scanMessage', 'Scanning enabled feeds with approved internal-use status…');
  try {
    const result = await api('scan', {method:'POST', body:JSON.stringify({})});
    setMessage('#scanMessage', `${result.scanned} feed(s) scanned; ${result.new_discoveries} new headlines. ${result.errors.length ? `${result.errors.length} feed error(s); inspect source status.` : ''} Coverage: ${result.coverage}.`);
    await refresh();
  } catch (error) { setMessage('#scanMessage', error.message, true); }
  finally { $('#scanFeeds').disabled = false; }
});
$('#discoveryRows').addEventListener('click', (event) => {
  const button = event.target.closest('[data-draft-discovery]');
  if (!button) return;
  const item = state.discoveries.find((row) => row.id === button.dataset.draftDiscovery);
  if (!item) return;
  $('#eventSource').value = item.source_id;
  $('#eventCategory').value = item.category;
  $('#eventTitle').value = item.title.slice(0, 240);
  $('#eventSourceUrl').value = item.item_url;
  if (item.published_at) $('#eventPublished').value = localStamp(new Date(item.published_at));
  $('#eventForm').scrollIntoView({behavior:'smooth', block:'start'});
  setMessage('#eventMessage', 'Headline copied as an unclassified event draft. Verify the item and fill in product, evidence, transmission, and counterpath.');
});
$('#reportView').addEventListener('click', (event) => {
  if (event.target.closest('[data-print-report]')) window.print();
});

refresh().catch((error) => {
  $('#mcStorageStatus').textContent = `Local ledger unavailable: ${error.message}`;
  setMessage('#eventMessage', 'Could not load the local Market Research ledger.', true);
});
