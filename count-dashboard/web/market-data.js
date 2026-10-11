const sourceList = document.querySelector('#marketSourceList');
const stateLabels = {
  adapter_configured: 'CONFIGURED', stream_configured: 'STREAM READY · VELA',
  quote_only: 'QUOTE PROBE ONLY', access_required: 'API ACCESS REQUIRED',
  rights_confirmation_required: 'RIGHTS CONFIRMATION REQUIRED', not_connected: 'NOT CONNECTED',
  disabled: 'DISABLED', unavailable: 'UNAVAILABLE',
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

async function loadSources() {
  const summary = document.querySelector('#sourceStatusSummary');
  const ampState = document.querySelector('#ampState');
  const ampConnector = document.querySelector('#ampConnectorState');
  summary.textContent = 'Reading the local feed configuration…';
  try {
    const response = await fetch('/api/feed/sources?symbol=CBOT_MINI%3AMYM1%21', {cache:'no-store'});
    if (!response.ok) throw new Error(`Local API returned ${response.status}`);
    const data = await response.json();
    const sources = Array.isArray(data.sources) ? data.sources : [];
    sourceList.innerHTML = sources.map(source => {
      const state = stateLabels[source.status] || source.status || 'UNKNOWN';
      return `<article class="market-source" data-state="${escapeHtml(source.status)}"><div class="market-source-top"><strong>${escapeHtml(source.name)}</strong><em>${escapeHtml(state)}</em></div><p>${escapeHtml(source.useNote || source.capability || '')}</p></article>`;
    }).join('') || '<p>No data sources are listed by this Count Desk instance.</p>';
    const cqg = sources.find(source => source.id === 'amp_cqg');
    const cqgState = cqg?.status || 'not_connected';
    ampState.textContent = stateLabels[cqgState] || 'STATUS UNKNOWN';
    ampConnector.textContent = cqg?.useNote || 'AMP/CQG source not listed by this Count Desk instance.';
    summary.textContent = `Local status loaded · ${sources.length} sources · ${new Date().toLocaleString()}`;
  } catch (error) {
    sourceList.innerHTML = '<article class="market-source"><div class="market-source-top"><strong>Local Count Desk API</strong><em>UNAVAILABLE</em></div><p>Open this page through the running Count Desk server to read configured source status.</p></article>';
    ampState.textContent = 'STATUS UNAVAILABLE';
    ampConnector.textContent = 'Start Count Desk to check its AMP/CQG configuration.';
    summary.textContent = `Could not load source status: ${error.message}`;
  }
}

document.querySelector('#refreshSources').addEventListener('click', loadSources);
loadSources();
