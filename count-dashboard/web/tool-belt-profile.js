const workbench = document.querySelector('#volumeProfileWorkbench');
const symbolSelect = document.querySelector('#profileSymbol');
const timeframeSelect = document.querySelector('#profileTimeframe');
const runStatus = document.querySelector('#profileRunStatus');
const report = document.querySelector('#profileReport');
let storedSymbols = [];
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const number = value => value == null ? '—' : new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(value);
const date = epoch => epoch ? new Date(epoch * 1000).toLocaleString() : '—';

function populateTimeframes() {
  const symbol = storedSymbols.find(item => item.symbol === symbolSelect.value);
  const available = symbol?.timeframes.filter(item => item.available && item.bars >= 2) || [];
  timeframeSelect.replaceChildren(...available.map(item => new Option(`${item.timeframe} · ${item.bars} bars`, item.timeframe)));
  if (!available.length) timeframeSelect.add(new Option('No stored bars', ''));
}

async function loadSymbols() {
  try {
    const response = await fetch('./api/symbols');
    if (!response.ok) throw new Error(`Catalog HTTP ${response.status}`);
    storedSymbols = (await response.json()).symbols || [];
    const available = storedSymbols.filter(item => item.timeframes.some(tf => tf.available && tf.bars >= 2));
    symbolSelect.replaceChildren(...available.map(item => new Option(item.label, item.symbol)));
    if (!available.length) symbolSelect.add(new Option('No stored datasets', ''));
    populateTimeframes();
  } catch (error) {
    symbolSelect.replaceChildren(new Option('Catalog unavailable', ''));
    runStatus.textContent = `Stored data catalog unavailable: ${error.message}`;
    runStatus.classList.add('error');
  }
}

function renderProfileResult(data) {
  const profile = data.profile;
  const pocIndex = profile.bins.findIndex(bin => bin.price === profile.poc);
  const stats = [
    ['Profile state', profile.status.toUpperCase()],
    ['Point of control', number(profile.poc)],
    ['Value area', profile.val == null ? '—' : `${number(profile.val)} – ${number(profile.vah)}`],
    ['Volume coverage', `${profile.knownVolumeBars} / ${profile.lookbackBars} bars`],
  ];
  const sources = data.sources.length ? data.sources.map(source => `${esc(source.source)} · ${esc(source.dataset_id)} · ${source.derived ? 'derived timeframe' : 'native timeframe'} · retrieved ${esc(source.retrieved_at || 'unknown')} · SHA-256 ${esc(source.source_sha256)}`).join('<br>') : 'No source record found';
  report.innerHTML = `${stats.map(([label,value]) => `<div class="belt-profile-stat"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`).join('')}
    <div class="belt-profile-meta"><strong>Window:</strong> ${esc(date(profile.firstBar))} → ${esc(date(profile.lastBar))} · newest stored bar excluded: ${esc(date(data.excludedLatestStoredBar))}<br><strong>Method:</strong> ${esc(profile.method || profile.reason)}<br><strong>Sources:</strong> ${sources}<br><strong>Input hash:</strong> ${esc(profile.inputHash || '—')} · <strong>Code:</strong> ${esc(profile.calculationVersion)}<br><strong>Rights:</strong> ${esc(data.sourceRights)} · <strong>Probability:</strong> unscored</div>
    ${profile.bins.length ? `<div class="belt-profile-chart" role="img" aria-label="Approximate volume profile histogram, point of control highlighted" style="grid-template-columns:repeat(${profile.bins.length},minmax(2px,1fr))">${profile.bins.map((bin,index) => `<span class="${index === pocIndex ? 'poc' : ''}" style="height:${Math.max(2,Math.round(bin.relative * 90))}px" title="Price ${esc(number(bin.price))}; allocated volume ${esc(number(bin.volume))}"></span>`).join('')}</div>` : ''}
    ${data.replay ? `<div class="belt-profile-meta"><strong>Causal replay:</strong> ${data.replay.windows} windows · ${data.replay.readyWindows || 0} complete · ${data.replay.partialWindows || 0} partial · ${data.replay.unavailableWindows || 0} unavailable · maximum volume allocation error ${number(data.replay.maximumMassError)}. This checks operational integrity only.</div>` : ''}`;
  report.hidden = false;
  runStatus.textContent = profile.status === 'unavailable' ? `Profile unavailable: ${profile.reason}` : `Calculated from ${profile.knownVolumeBars} bars with observed volume. Directional probability remains unscored.`;
  runStatus.classList.toggle('error', profile.status === 'unavailable');
}

document.addEventListener('click', event => {
  if (!event.target.closest('[data-open-profile]')) return;
  window.setActiveToolBeltIndicator?.('volume-profile');
  workbench.hidden = false;
  workbench.scrollIntoView({behavior:'smooth',block:'start'});
});
document.querySelector('#closeProfileWorkbench')?.addEventListener('click', () => { workbench.hidden = true; });
symbolSelect?.addEventListener('change', populateTimeframes);
document.querySelector('#profileForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!symbolSelect.value || !timeframeSelect.value) return;
  runStatus.textContent = 'Calculating from stored bars…';
  runStatus.classList.remove('error');
  report.hidden = true;
  const params = new URLSearchParams({symbol:symbolSelect.value,timeframe:timeframeSelect.value,
    bins:document.querySelector('#profileBins').value,lookback:document.querySelector('#profileLookback').value,
    replay:document.querySelector('#profileReplay').checked ? '1' : '0'});
  try {
    const response = await fetch(`./api/tool-belt/volume-profile?${params}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    renderProfileResult(data);
  } catch (error) {
    runStatus.textContent = `Calculation unavailable: ${error.message}`;
    runStatus.classList.add('error');
  }
});
loadSymbols();
