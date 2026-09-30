// Chart-side paper planning. Drafts are ephemeral; only queueing reaches the simulator.
const CONTRACT_MULTIPLIERS = Object.freeze({
  'CBOT_MINI:MYM1!': .5,
  'CME_MINI:MES1!': 5,
  'CME_MINI:MNQ1!': 2,
  'NYMEX:MCL1!': 100,
  'COMEX:MGC1!': 10,
});

export function planMetrics({side, quantity, entry, stop, target, reference, multiplier}) {
  const count = Number(quantity);
  const price = Number(entry);
  const pointValue = Number(multiplier);
  const direction = side === 'short' ? -1 : 1;
  const validBase = Number.isFinite(price) && price > 0 && Number.isInteger(count) && count > 0
    && Number.isFinite(pointValue) && pointValue > 0;
  if (!validBase) return {valid:false, reason:'Enter a valid entry and whole contract quantity.'};
  const stopPrice = stop === '' || stop == null ? null : Number(stop);
  const targetPrice = target === '' || target == null ? null : Number(target);
  if (stopPrice != null && (!Number.isFinite(stopPrice) || stopPrice <= 0 || direction * (price - stopPrice) <= 0))
    return {valid:false, reason:'The stop must be beyond entry in the loss direction.'};
  if (targetPrice != null && (!Number.isFinite(targetPrice) || targetPrice <= 0 || direction * (targetPrice - price) <= 0))
    return {valid:false, reason:'The target must be beyond entry in the profit direction.'};
  const risk = stopPrice == null ? null : Math.abs(price - stopPrice) * count * pointValue;
  const reward = targetPrice == null ? null : Math.abs(targetPrice - price) * count * pointValue;
  const mark = Number(reference);
  return {
    valid:true, risk, reward, ratio:risk && reward != null ? reward / risk : null,
    scenarioPnL:Number.isFinite(mark) && mark > 0 ? direction * (mark - price) * count * pointValue : null,
  };
}

const money = value => value == null ? '—' : new Intl.NumberFormat('en-US', {style:'currency',currency:'USD',maximumFractionDigits:2}).format(value);
const priceText = value => value == null ? '—' : Number(value).toLocaleString('en-US', {maximumFractionDigits:4});
const field = (label, id, body) => `<label>${label}${body.replace('ID', id)}</label>`;

export function createPaperChartPlanner({stage, onQueue, onAccountSelect, onOpenAccounts}) {
  const layout = document.createElement('div');
  layout.className = 'vela-chart-trade-layout';
  stage.before(layout);
  layout.append(stage);
  const rail = document.createElement('aside');
  rail.className = 'vela-chart-trade-rail';
  rail.setAttribute('aria-label','Paper trade planner');
  rail.innerHTML = `<div class="paper-rail-head"><small>PAPER · CHART PLANNER</small><strong>Plan on chart</strong><span id="paperRailMarket">Load a stored micro-futures chart.</span></div>
    <label class="paper-rail-account">Simulation account<select id="paperRailAccount"><option value="">Create an account first</option></select></label>
    <button id="paperRailOpenAccounts" class="paper-rail-link" type="button">Manage simulation accounts</button>
    <form id="paperRailForm" class="paper-rail-form">
      <div class="paper-rail-pair">${field('Direction','paperRailSide','<select id="ID"><option value="long">Buy / Long</option><option value="short">Sell / Short</option></select>')}${field('Order type','paperRailType','<select id="ID"><option value="market">Market</option><option value="limit">Limit</option><option value="stop">Stop</option><option value="stop_limit">Stop-limit</option></select>')}</div>
      <div class="paper-rail-pair">${field('Contracts','paperRailQuantity','<input id="ID" type="number" min="1" max="100" step="1" value="1" required>')}${field('Entry / limit','paperRailEntry','<input id="ID" type="number" min="0" step="any" inputmode="decimal">')}</div>
      ${field('Stop trigger','paperRailTrigger','<input id="ID" type="number" min="0" step="any" inputmode="decimal">')}
      <div class="paper-rail-pair">${field('Protective stop','paperRailStop','<input id="ID" type="number" min="0" step="any" inputmode="decimal" placeholder="Optional">')}${field('Profit target','paperRailTarget','<input id="ID" type="number" min="0" step="any" inputmode="decimal" placeholder="Optional">')}</div>
      <div class="paper-rail-metrics"><div><span>Risk at stop</span><strong id="paperRailRisk">—</strong></div><div><span>Reward at target</span><strong id="paperRailReward">—</strong></div><div><span>Reward / risk</span><strong id="paperRailRatio">—</strong></div><div><span>Scenario P&amp;L</span><strong id="paperRailScenario">—</strong></div></div>
      <p id="paperRailReference" class="paper-rail-reference">No stored price reference.</p>
      <p id="paperRailValidation" class="paper-rail-validation" role="status">Set entry, stop, and target on the chart or here.</p>
      <div class="paper-rail-actions"><button id="paperRailQueue" type="submit">Review paper order</button><button id="paperRailDiscard" type="button">Discard plan</button></div>
    </form><p class="paper-rail-note">The reference is the latest stored chart close; fills wait for later completed bars. Dollar amounts are hypothetical gross figures before fees and slippage. Drag colored chart lines or edit prices here.</p>`;
  layout.append(rail);
  const get = id => rail.querySelector('#' + id);
  const inputs = {side:get('paperRailSide'),type:get('paperRailType'),quantity:get('paperRailQuantity'),entry:get('paperRailEntry'),trigger:get('paperRailTrigger'),stop:get('paperRailStop'),target:get('paperRailTarget')};
  let chart = null;
  let contract = null;
  let hoverPrice = null;
  let reference = null;
  let lineIds = {};
  let offCrosshair = null;
  let offDrawing = null;
  let syncingLines = false;
  let enabled = false;
  let hasDraft = false;
  let reviewOpen = false;

  const readPlan = () => ({
    side:inputs.side.value, order_type:inputs.type.value, quantity:Number(inputs.quantity.value),
    entry:inputs.type.value === 'market' ? reference :
      inputs.type.value === 'stop' ? Number(inputs.trigger.value || inputs.entry.value) : Number(inputs.entry.value),
    limit_price:['limit','stop_limit'].includes(inputs.type.value) ? Number(inputs.entry.value) : null,
    trigger_price:['stop','stop_limit'].includes(inputs.type.value) ? Number(inputs.trigger.value || inputs.entry.value) : null,
    stop_price:inputs.stop.value ? Number(inputs.stop.value) : null,
    target_price:inputs.target.value ? Number(inputs.target.value) : null,
  });
  const removeLines = () => {
    if (chart?.drawings) Object.values(lineIds).forEach(id => chart.drawings.remove(id));
    lineIds = {};
  };
  const drawLine = (kind, value, color) => {
    if (!chart?.drawings?.supported || !Number.isFinite(value) || value <= 0 || !contract?.bars?.length) return;
    const anchor = [{time:contract.bars.at(-1).time,price:value}];
    if (lineIds[kind]) chart.drawings.update(lineIds[kind], {anchors:anchor});
    else {
      const item = chart.drawings.add('hline', {paneId:'price',anchors:anchor,style:{lineColor:color,lineWidth:2,lineStyle:'solid'}});
      if (item) lineIds[kind] = item.id;
    }
  };
  const syncLines = () => {
    if (!enabled || !chart || !hasDraft) return removeLines();
    syncingLines = true;
    try {
      const plan = readPlan();
      for (const [kind,value,color] of [['entry',plan.entry,'#e5c86a'],['stop',plan.stop_price,'#ea7777'],['target',plan.target_price,'#6ed8a3']]) {
        if (Number.isFinite(value) && value > 0) drawLine(kind,value,color);
        else if (lineIds[kind]) { chart.drawings.remove(lineIds[kind]); delete lineIds[kind]; }
      }
    } finally { syncingLines = false; }
  };
  const render = () => {
    const plan = readPlan();
    const multiplier = CONTRACT_MULTIPLIERS[contract?.market?.symbol];
    const metrics = planMetrics({side:plan.side,quantity:plan.quantity,entry:plan.entry,
      stop:plan.stop_price,target:plan.target_price,reference,multiplier});
    get('paperRailRisk').textContent = hasDraft ? money(metrics.risk) : '—';
    get('paperRailReward').textContent = hasDraft ? money(metrics.reward) : '—';
    get('paperRailRatio').textContent = hasDraft && metrics.ratio != null ? `${metrics.ratio.toFixed(2)}R` : '—';
    get('paperRailScenario').textContent = hasDraft ? money(metrics.scenarioPnL) : '—';
    get('paperRailScenario').classList.toggle('is-loss', metrics.scenarioPnL < 0);
    get('paperRailReference').textContent = reference == null ? 'No stored price reference.' :
      `Stored chart close ${priceText(reference)} · ${contract?.analysis?.source || 'stored source'} · ${new Date(contract.bars.at(-1).time).toLocaleString()}`;
    const accountReady = Boolean(get('paperRailAccount').value);
    const pendingType = plan.order_type !== 'market';
    const entryReady = !pendingType || plan.order_type === 'stop' || Number.isFinite(Number(inputs.entry.value)) && Number(inputs.entry.value) > 0;
    const triggerReady = !['stop','stop_limit'].includes(plan.order_type) || Number.isFinite(plan.trigger_price) && plan.trigger_price > 0;
    const valid = enabled && hasDraft && metrics.valid && entryReady && triggerReady && accountReady && Boolean(contract);
    const message = !enabled ? 'Load a stored micro-futures chart to plan.' :
      !hasDraft ? 'Right-click the chart or edit this ticket to start a plan.' :
      !accountReady ? 'Create or select a simulation account.' :
      !entryReady ? 'Set an entry price on the chart or here.' :
      !triggerReady ? 'Set a stop trigger price.' :
      !metrics.valid ? metrics.reason : reviewOpen ?
        `Confirm ${plan.side} ${plan.quantity} ${plan.order_type.replace('_','-')} · planned entry ${priceText(plan.entry)} · stop ${priceText(plan.stop_price)} · target ${priceText(plan.target_price)}.` :
        'Draft only. Review before queueing a simulated order.';
    get('paperRailValidation').textContent = message;
    get('paperRailValidation').classList.toggle('is-invalid',!valid);
    get('paperRailQueue').disabled = !valid;
    get('paperRailQueue').textContent = reviewOpen ? 'Confirm & queue paper order' : 'Review paper order';
    inputs.entry.disabled = plan.order_type === 'market';
    inputs.entry.closest('label').hidden = plan.order_type === 'stop';
    inputs.trigger.closest('label').hidden = !['stop','stop_limit'].includes(plan.order_type);
    inputs.entry.closest('label').firstChild.textContent = plan.order_type === 'market' ? 'Reference entry' : 'Entry / limit';
    syncLines();
  };
  const discard = () => {
    hasDraft = false;
    reviewOpen = false;
    removeLines();
    for (const key of ['entry','trigger','stop','target']) inputs[key].value = '';
    render();
  };
  rail.addEventListener('input', event => { if (event.target !== get('paperRailAccount')) hasDraft = true; reviewOpen = false; render(); });
  rail.addEventListener('change', event => { if (event.target !== get('paperRailAccount')) hasDraft = true; reviewOpen = false; render(); });
  get('paperRailAccount').addEventListener('change', event => { reviewOpen = false; onAccountSelect(event.target.value); });
  get('paperRailOpenAccounts').addEventListener('click', onOpenAccounts);
  get('paperRailDiscard').addEventListener('click', discard);
  get('paperRailForm').addEventListener('submit', async event => {
    event.preventDefault();
    render();
    if (get('paperRailQueue').disabled) return;
    if (!reviewOpen) { reviewOpen = true; render(); return; }
    get('paperRailQueue').disabled = true;
    try {
      const plan = readPlan();
      await onQueue({account_id:get('paperRailAccount').value,symbol:contract.market.symbol,
        timeframe:contract.market.timeframe,bar_time:Math.floor(contract.bars.at(-1).time / 1000),
        side:plan.side,quantity:String(plan.quantity),order_type:plan.order_type,
        limit_price:plan.limit_price,trigger_price:plan.trigger_price,
        stop_price:plan.stop_price,target_price:plan.target_price});
      discard();
    } catch (error) { get('paperRailValidation').textContent = error.message; }
    finally { render(); }
  });
  return {
    setChart(nextChart, nextContract) {
      const sameMarket = contract && nextContract && contract.market.symbol === nextContract.market.symbol
        && contract.market.timeframe === nextContract.market.timeframe;
      offCrosshair?.(); offDrawing?.(); removeLines();
      chart = nextChart; contract = nextContract; hoverPrice = null;
      if (!sameMarket) {
        hasDraft = false;
        reviewOpen = false;
        for (const key of ['entry','trigger','stop','target']) inputs[key].value = '';
      }
      reference = Number(nextContract?.analysis?.lastClose);
      if (!Number.isFinite(reference) || reference <= 0) reference = null;
      enabled = Boolean(nextChart && nextContract && CONTRACT_MULTIPLIERS[nextContract.market.symbol]);
      get('paperRailMarket').textContent = enabled ? `${nextContract.market.symbol} · ${nextContract.market.timeframe}` : 'Paper simulation supports stored micro futures only.';
      if (enabled) {
        offCrosshair = chart.renderer.onCrosshairMove(event => {
          hoverPrice = event.paneKind === 'price' && Number.isFinite(event.price) ? event.price : null;
        });
        offDrawing = chart.on('drawing:edited', ({id}) => {
          if (syncingLines) return;
          const kind = Object.keys(lineIds).find(key => lineIds[key] === id);
          if (!kind) return;
          const record = chart.drawings.toJSON().drawings.find(item => item.id === id);
          const price = Number(record?.anchors?.[0]?.price);
          if (!Number.isFinite(price) || price <= 0) return;
          if (kind === 'entry' && inputs.type.value === 'stop') inputs.trigger.value = String(price);
          else if (kind === 'entry') inputs.entry.value = String(price);
          else inputs[kind].value = String(price);
          reviewOpen = false;
          render();
        });
      }
      render();
    },
    setAccounts(accounts, selectedId) {
      const select = get('paperRailAccount');
      select.replaceChildren(new Option('Select simulated account',''), ...accounts.map(account =>
        new Option(`${account.name} · virtual ${money(account.starting_balance)}`,account.account_id)));
      select.value = selectedId || '';
      render();
    },
    planFromContext(side, type) {
      if (!enabled) return;
      hasDraft = true;
      reviewOpen = false;
      inputs.side.value = side;
      inputs.type.value = type;
      const picked = hoverPrice ?? reference;
      if (picked != null) {
        inputs.entry.value = String(picked);
        if (type === 'stop') inputs.trigger.value = String(picked);
      }
      render();
      rail.scrollIntoView({block:'nearest'});
      inputs[type === 'market' ? 'quantity' : 'entry'].focus();
    },
    updateReference(nextContract) {
      if (!contract || nextContract?.market?.symbol !== contract.market.symbol) return;
      contract = nextContract;
      const next = Number(nextContract.analysis.lastClose);
      if (Number.isFinite(next) && next > 0) reference = next;
      render();
    },
  };
}
