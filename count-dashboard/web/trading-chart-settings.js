import {DEFAULT_CANDLES, loadCandles, saveCandles, normalizeCandles, applyCandles} from './chart-candle-style.mjs';

let saved;
let draft = null;
let refreshDialog = null;
function savedStyle() { return saved ||= loadCandles(localStorage); }
export function applyTradingCandles(chart) {
  const applied=applyCandles(chart, draft || savedStyle());
  const timezoneApplied=applyTradingTimezone(chart, (draft || savedStyle()).timezone);
  if (draft) refreshDialog?.();
  return applied && timezoneApplied;
}

function applyTradingTimezone(chart, timezone) {
  const renderer=chart?.renderer;
  if (!renderer?.set || !renderer?.get || !timezone) return false;
  try {
    renderer.set('timezone', timezone);
    const applied=renderer.get('timezone') === timezone;
    if(applied)window.dispatchEvent(new CustomEvent('countdesk:chart-timezone-change',{detail:{timezone}}));
    return applied;
  } catch { return false; }
}

export function mountTradingChartSettings({getCharts, mount}) {
  if (document.querySelector('#tradingChartSettings')) return;
  savedStyle();
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = new URL('./trading-chart-settings.css', import.meta.url).href;
  document.head.append(css);
  const link = document.createElement('button');
  link.type = 'button'; link.id = 'tradingChartSettingsLink';
  link.textContent = '⚙ Chart settings';
  link.setAttribute('aria-haspopup', 'dialog'); link.setAttribute('aria-controls', 'tradingChartSettings');
  mount.append(link);
  const dialog = document.createElement('dialog');
  dialog.id = 'tradingChartSettings'; dialog.className = 'trading-chart-settings';
  dialog.setAttribute('aria-labelledby', 'tradingChartSettingsTitle');
  const rows = [
    ['Body fill','bodyVisible','upFill','downFill'],
    ['Borders','bordersVisible','upBorder','downBorder'],
    ['Wicks','wicksVisible','upWick','downWick'],
  ];
  dialog.innerHTML = `<form>
    <header><h2 id="tradingChartSettingsTitle">Chart settings</h2><button type="button" data-close aria-label="Close chart settings">×</button></header>
    <div class="candle-settings-layout"><nav aria-label="Chart settings sections"><span aria-current="page">▥ &nbsp; Candles</span><small>Trading chart appearance</small></nav>
    <section><h3>CANDLES</h3><p class="candle-settings-intro">Choose your candle fills, borders and wicks.</p>
    <label class="timezone-setting">Chart timezone<select data-setting="timezone" aria-label="Chart timezone"></select><small>Times on the chart use this timezone. Default: Pacific.</small></label>
    <div class="candle-settings-columns"><span></span><span>Rising</span><span>Falling</span></div>
    ${rows.map(([label,toggle,up,down]) => `<div class="candle-settings-row"><label><input type="checkbox" data-setting="${toggle}">${label}</label>${[up,down].map((key,i)=>`<label class="candle-color"><input type="color" data-setting="${key}" aria-label="${i?'Falling':'Rising'} ${label.toLowerCase()} color"><code data-hex="${key}"></code></label>`).join('')}</div>`).join('')}
    <div class="candle-preview"><svg viewBox="0 0 340 116" role="img" aria-label="Candle style preview: rising and falling candles"></svg><small>STYLE PREVIEW</small></div>
    <p class="candle-default-note">Default: green rising fills, red falling fills, white borders and wicks.</p>
    <p id="tradingCandleStatus" role="status" aria-live="polite"></p></section></div>
    <footer><button type="button" data-reset>Reset to default</button><div><button type="button" data-close>Cancel</button><button type="submit" class="candle-save">OK</button></div></footer>
  </form>`;
  document.body.append(dialog);
  const status = dialog.querySelector('#tradingCandleStatus');
  const inputs = [...dialog.querySelectorAll('[data-setting]')];
  const timezoneSelect=dialog.querySelector('[data-setting="timezone"]');
  const timezoneValues=typeof Intl.supportedValuesOf==='function'?Intl.supportedValuesOf('timeZone'):['America/Los_Angeles','America/New_York','America/Chicago','Europe/London','Europe/Paris','Asia/Tokyo','Australia/Sydney','Etc/UTC'];
  const timezoneOptions=[...new Set(['America/Los_Angeles',...timezoneValues,'Etc/UTC'])];
  for(const zone of timezoneOptions){const option=document.createElement('option');option.value=zone;option.textContent=zone==='America/Los_Angeles'?'Pacific Time — America/Los_Angeles':zone==='Etc/UTC'?'UTC':zone.replaceAll('_',' ');timezoneSelect.append(option);}
  function applyAll() {
    const charts = getCharts().filter(Boolean);
    const settings=draft || saved;
    const applied = charts.map(chart => applyCandles(chart, settings) && applyTradingTimezone(chart, settings.timezone));
    return {count:charts.length, ok:applied.every(Boolean)};
  }
  function preview() {
    const s = draft || saved;
    dialog.querySelector('svg').innerHTML = `<path d="M0 34H340 M0 76H340" stroke="#263145" stroke-dasharray="3 5"/>${[0,1,0,1,0,1].map((down,i)=>{
      const x=35+i*54, y=down?46:30, prefix=down?'down':'up';
      return `${s.wicksVisible?`<path d="M${x} ${y-18}V${y+50}" stroke="${s[prefix+'Wick']}"/>`:''}<rect x="${x-7}" y="${y}" width="14" height="30" fill="${s.bodyVisible?s[prefix+'Fill']:'none'}" stroke="${s.bordersVisible?s[prefix+'Border']:'none'}"/>`;
    }).join('')}`;
    for (const input of inputs) {
      const key=input.dataset.setting;
      if (input.tagName==='SELECT') input.value=s[key];
      else if (input.type==='checkbox') input.checked=s[key];
      else { input.value=s[key]; dialog.querySelector(`[data-hex="${key}"]`).textContent=s[key].toUpperCase(); }
    }
    const result=applyAll();
    status.textContent=!result.ok?'The chart could not apply this style. Try again after it loads.':result.count?'Preview on chart · OK saves your style.':'Your style will apply when the chart loads.';
  }
  refreshDialog=preview;
  link.onclick = () => { draft={...saved}; preview(); dialog.showModal(); };
  for (const input of inputs) input.addEventListener('input', () => {
    draft=normalizeCandles({...draft,[input.dataset.setting]:input.type==='checkbox'?input.checked:input.value}); preview();
  });
  timezoneSelect.addEventListener('change', () => { draft=normalizeCandles({...draft,timezone:timezoneSelect.value}); preview(); });
  function cancel() { draft=null; applyAll(); dialog.close(); }
  dialog.querySelectorAll('[data-close]').forEach(button => button.onclick=cancel);
  dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
  dialog.querySelector('[data-reset]').onclick = () => { draft={...DEFAULT_CANDLES}; preview(); };
  dialog.querySelector('form').onsubmit = event => {
    event.preventDefault();
    try {
      const result=applyAll();
      if (!result.ok) throw new Error('The chart could not apply this style. Try again after it loads.');
      saved=saveCandles(localStorage,draft); draft=null; dialog.close();
    } catch (error) { status.textContent=`Settings were not saved. ${error.message}`; }
  };
  applyAll();
}
