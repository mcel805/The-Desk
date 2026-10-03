import {DESK_GRID, packLegoGrid} from './lego-grid-core.js';
import {createCodexWidget} from './codex-widget.js?v=4';

const storageKey = 'count-desk-modular-workspace-v1';
const templatesKey = 'count-desk-modular-workspace-templates-v1';
const $ = selector => document.querySelector(selector);

const widgetCatalog = {
  chart:{title:'Chart',icon:'⌁',size:'full'},
  agents:{title:'Agents',icon:'✦',size:'medium'},
  codex:{title:'Codex',icon:'›',size:'medium'},
  ladder:{title:'Ladder',icon:'⇅',size:'medium'},
  watchlist:{title:'List',icon:'☷',size:'small'},
  indicators:{title:'Indicator cubes',icon:'▦',size:'medium'},
  notes:{title:'Desk notes',icon:'✎',size:'small'},
  context:{title:'Data context',icon:'◷',size:'small'},
};
const standardOrder = ['chart','agents','watchlist','ladder','indicators','context','notes'];

const studies = [
  {id:'volume',label:'Volume',glyph:'▥'},
  {id:'rsi',label:'RSI',glyph:'◒'},
  {id:'sma',label:'SMA',glyph:'〰'},
  {id:'ema',label:'EMA',glyph:'⌁'},
  {id:'atr',label:'ATR',glyph:'△'},
  {id:'vpvr',label:'Volume profile',glyph:'▤'},
];

export function createModularWorkspace({chartElement, getSymbols, getIndicators, toggleIndicator, selectSymbol, loadChart, capturePlatformSettings, applyPlatformSettings, getLadderContext, stagePaperPrice, canStagePaperPrice}) {
  const workspace = $('#modularWorkspace');
  const grid = $('#modularGrid');
  const parking = $('#modularWidgetParking');
  const agentsParking = $('#modularAgentsParking');
  const blank = $('#modularBlank');
  const dialog = $('#modularWidgetDialog');
  const nameInput = $('#modularLayoutName');
  const templateDialog = $('#modularTemplateDialog');
  const templateList = $('#modularTemplateList');
  const templateName = $('#modularTemplateName');
  const templateStatus = $('#modularTemplateStatus');
  const widgets = new Map();
  let state = readState();
  let templates = readTemplates();
  let draggedWidget = null;
  let resizeTimer = null;
  let restoringLayout = false;

  parking.append(chartElement);
  chartElement.hidden = true;
  nameInput.value = state.name;

  function readState() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (saved && Array.isArray(saved.order)) {
        const order = saved.order.filter(id => Object.hasOwn(widgetCatalog,id));
        // Recover a corrupted default desk that was saved with Scratch mode but
        // retained its Standard desk name. Explicit Scratch layouts stay empty.
        const migrateBlank = order.length === 0 && (saved.layoutMode !== 'scratch' || saved.name === 'Standard desk');
        const migrateStandardAgents = !migrateBlank && (saved.layoutMode === 'standard' || saved.name === 'Standard desk') && !order.includes('agents');
        if (migrateStandardAgents) order.splice(Math.max(0,order.indexOf('chart') + 1),0,'agents');
        return {
          name:migrateBlank ? 'Standard desk' : typeof saved.name === 'string' && saved.name.trim() ? saved.name.slice(0,40) : 'Standard desk',
          order:migrateBlank ? [...standardOrder] : order,
          layoutMode:migrateBlank ? 'standard' : saved.layoutMode === 'scratch' && !order.length ? 'scratch' : 'custom',
          sizes:saved.sizes && typeof saved.sizes === 'object' ? saved.sizes : {},
          spans:saved.spans && typeof saved.spans === 'object' ? saved.spans : {},
          mobileRows:saved.mobileRows && typeof saved.mobileRows === 'object' ? saved.mobileRows : {},
          positions:saved.positions && typeof saved.positions === 'object' ? saved.positions : {},
          notes:typeof saved.notes === 'string' ? saved.notes : '',
          listSymbols:Array.isArray(saved.listSymbols) ? [...new Set(saved.listSymbols.filter(value => typeof value === 'string'))] : [],
          platformSettings:saved.platformSettings && typeof saved.platformSettings === 'object' ? saved.platformSettings : null,
        };
      }
    } catch { /* A fresh layout is the safe fallback when local preferences cannot be read. */ }
    return {name:'Standard desk',order:[...standardOrder],layoutMode:'standard',sizes:{},spans:{},mobileRows:{},positions:{},notes:'',listSymbols:[],platformSettings:null};
  }

  function readTemplates() {
    try {
      const saved = JSON.parse(localStorage.getItem(templatesKey) || '[]');
      return Array.isArray(saved) ? saved.filter(item => item && typeof item.id === 'string' && typeof item.name === 'string' && item.layout) : [];
    } catch { return []; }
  }

  function saveTemplates() {
    try { localStorage.setItem(templatesKey, JSON.stringify(templates)); return true; }
    catch { templateStatus.textContent = 'Browser storage is full or unavailable; the template was not saved.'; return false; }
  }

  function snapshotLayout(name = state.name) {
    const order = [...grid.children].map(widget => widget.dataset.kind);
    const sizes = Object.fromEntries([...grid.children].filter(widget => ['small','medium','wide','full'].includes(widget.dataset.size)).map(widget => [widget.dataset.kind, widget.dataset.size]));
    const notes = grid.querySelector('[data-notes]');
    const capturedSettings = capturePlatformSettings ? capturePlatformSettings() : null;
    const platformSettings = capturedSettings && capturedSettings.symbol ? capturedSettings : state.platformSettings || capturedSettings || null;
    return {name:name.trim().slice(0,40) || 'Standard desk',order,layoutMode:state.layoutMode || 'custom',sizes,
      spans:state.spans || {},mobileRows:state.mobileRows || {},positions:state.positions || {},notes:notes ? notes.value : state.notes,
      listSymbols:state.listSymbols || [],platformSettings};
  }

  function persist() {
    state.order = [...grid.children].map(widget => widget.dataset.kind);
    state.sizes = Object.fromEntries([...grid.children].filter(widget => ['small','medium','wide','full'].includes(widget.dataset.size)).map(widget => [widget.dataset.kind, widget.dataset.size]));
    state.name = nameInput.value.trim().slice(0,40) || 'Untitled layout';
    state = snapshotLayout(state.name);
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
      const savedAt = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
      $('#modularSaveStatus').textContent = `Saved locally · ${savedAt}`;
    } catch {
      $('#modularSaveStatus').textContent = 'Save unavailable';
      setStatus('This browser could not save the workspace layout.', true);
    }
    blank.hidden = grid.children.length > 0;
  }

  function setStatus(message, error = false) {
    const status = $('#velaStatus');
    if (!status || status.textContent === 'Loading Count Desk catalog…') return;
    status.textContent = message;
    status.classList.toggle('error', error);
  }

  const snapSoundKey = 'count-desk-lego-snap-sound-v1';
  let soundOn = false;
  try { soundOn = localStorage.getItem(snapSoundKey) === 'on'; } catch { /* Optional preference. */ }
  let audioContext = null;
  function snap(widget) {
    widget?.classList.remove('just-snapped');
    void widget?.offsetWidth;
    widget?.classList.add('just-snapped');
    if (widget) setTimeout(() => widget.classList.remove('just-snapped'),430);
    if (!soundOn) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(460,audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(220,audioContext.currentTime + .09);
      gain.gain.setValueAtTime(.0001,audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.06,audioContext.currentTime + .007);
      gain.gain.exponentialRampToValueAtTime(.0001,audioContext.currentTime + .12);
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.start(); oscillator.stop(audioContext.currentTime + .12);
    } catch { /* The visible snap remains available when audio cannot play. */ }
  }

  function changeSpan(article, direction, axis = 'both') {
    if ([...grid.children].filter(widget => !widget.hidden).length === 1) return;
    const kind = article.dataset.kind;
    if (window.matchMedia('(max-width:760px)').matches) {
      const rows = Math.max(1,Math.min(8,Number(article.dataset.layoutRows) + direction));
      if (rows === Number(article.dataset.layoutRows)) return;
      state.mobileRows[kind] = rows;
      applyAdaptiveLayout(); persist(); snap(article);
      return;
    }
    const currentColumns = Number(article.dataset.layoutCols);
    const currentRows = Number(article.dataset.layoutRows);
    const columns = axis === 'vertical' ? currentColumns : Math.max(kind === 'chart' ? 4 : 2,Math.min(12,currentColumns + direction));
    const rows = axis === 'horizontal' ? currentRows : Math.max(kind === 'chart' ? 3 : 1,Math.min(8,currentRows + direction));
    if (columns === currentColumns && rows === currentRows) return;
    state.spans[kind] = [columns,rows];
    delete state.sizes[kind];
    delete state.positions[kind];
    applyAdaptiveLayout(); persist(); snap(article);
  }

  function startEdgeResize(article, event) {
    if (event.button !== 0 || [...grid.children].filter(widget => !widget.hidden).length === 1) return;
    event.preventDefault(); event.stopPropagation();
    const kind = article.dataset.kind;
    const mobile = window.matchMedia('(max-width:760px)').matches;
    const origin = [Number(article.dataset.layoutCols),Number(article.dataset.layoutRows)];
    const start = [event.clientX,event.clientY];
    const style = getComputedStyle(grid);
    const gapX = parseFloat(style.columnGap) || 0;
    const gapY = parseFloat(style.rowGap) || 0;
    const innerWidth = grid.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
    const innerHeight = grid.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0);
    const cellX = (innerWidth - gapX * 11) / 12 + gapX;
    const cellY = (innerHeight - gapY * 7) / 8 + gapY;
    let changed = false;
    const move = next => {
      if (mobile) {
        const rows = Math.max(1,Math.min(8,origin[1] + Math.round((next.clientY - start[1]) / 188)));
        if (rows === Number(article.dataset.layoutRows)) return;
        state.mobileRows[kind] = rows;
        changed = true; applyAdaptiveLayout();
        return;
      }
      const columns = Math.max(kind === 'chart' ? 4 : 2,Math.min(12,origin[0] + Math.round((next.clientX - start[0]) / cellX)));
      const rows = Math.max(kind === 'chart' ? 3 : 1,Math.min(8,origin[1] + Math.round((next.clientY - start[1]) / cellY)));
      if (columns === Number(article.dataset.layoutCols) && rows === Number(article.dataset.layoutRows)) return;
      state.spans[kind] = [columns,rows];
      delete state.sizes[kind]; delete state.positions[kind];
      changed = true; applyAdaptiveLayout();
    };
    const end = () => {
      window.removeEventListener('pointermove',move);
      window.removeEventListener('pointerup',end);
      window.removeEventListener('pointercancel',end);
      article.classList.remove('is-resizing');
      if (changed) { persist(); snap(article); }
    };
    article.classList.add('is-resizing');
    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',end,{once:true});
    window.addEventListener('pointercancel',end,{once:true});
  }

  function applyAdaptiveLayout() {
    const children = [...grid.children].filter(widget => !widget.hidden);
    if (!children.length) return;
    const mobile = window.matchMedia('(max-width:760px)').matches;
    const placements = packLegoGrid(children.map(widget => ({id:widget.dataset.kind,kind:widget.dataset.kind,
      size:state.sizes[widget.dataset.kind],span:state.spans[widget.dataset.kind],mobileRows:state.mobileRows[widget.dataset.kind],
      position:state.positions[widget.dataset.kind]})),{mobile});
    const railColumns = workspace.classList.contains('is-left-collapsed')
      ? workspace.classList.contains('is-right-collapsed') ? '0px minmax(0,1fr) 0px' : '0px minmax(460px,2.6fr) minmax(230px,1.1fr)'
      : workspace.classList.contains('is-right-collapsed') ? 'minmax(170px,.8fr) minmax(460px,2.6fr) 0px'
        : 'minmax(170px,.8fr) minmax(460px,2.6fr) minmax(230px,1.1fr)';
    if (!mobile) grid.style.gridTemplateColumns = railColumns;
    const desktopRailRows = new Map();
    if (!mobile) {
      for (const region of ['left','right']) {
        const items = placements.filter(item => item.id !== 'chart' && (region === 'left'
          ? ['agents','codex','watchlist'].includes(item.id)
          : !['agents','codex','watchlist'].includes(item.id)));
        let cursor = 1;
        items.forEach((item,index) => {
          const span = Math.max(1,Math.floor(8 / items.length) + (index < 8 % items.length ? 1 : 0));
          desktopRailRows.set(item.id,`${cursor} / span ${span}`);
          cursor += span;
        });
      }
    }
    for (const placement of placements) {
      const widget = widgets.get(placement.id);
      const region = placement.id === 'chart' ? 'center'
        : ['agents','codex','watchlist'].includes(placement.id) ? 'left' : 'right';
      widget.dataset.region = region;
      widget.dataset.size = state.sizes[placement.id] || (state.spans[placement.id] ? 'custom' : 'auto');
      widget.dataset.layoutCols = String(placement.columns);
      widget.dataset.layoutRows = String(placement.rows);
      widget.style.setProperty('--zone-row-span',String(Math.max(2,Math.min(4,placement.rows))));
      widget.classList.remove('size-small','size-medium','size-wide','size-full','size-auto');
      if (widget.dataset.size !== 'custom') widget.classList.add(`size-${widget.dataset.size}`);
      if (!mobile) {
        widget.style.gridColumn = placement.id === 'chart' ? '2' : region === 'left' ? '1' : '3';
        widget.style.gridRow = placement.id === 'chart' ? '1 / span 8' : desktopRailRows.get(placement.id) || 'auto';
      } else {
        widget.style.gridColumn = `${placement.x} / span ${placement.columns}`;
        widget.style.gridRow = `${placement.y} / span ${placement.rows}`;
      }
      const button = widget.querySelector('[data-size]');
      button.title = mobile ? `Current height: ${placement.rows} rows. Select to cycle height.`
        : `Current size: ${widget.dataset.layoutCols} × ${widget.dataset.layoutRows} grid units. Select to cycle presets.`;
      button.setAttribute('aria-label',`${mobile ? 'Cycle height' : 'Cycle size'} for ${widgetCatalog[placement.id].title}`);
      widget.querySelectorAll('[data-edge-size], [data-edge-resize]').forEach(control => {
        control.disabled = children.length === 1;
      });
    }
    const occupiedRows = Math.max(mobile ? 1 : DESK_GRID.rows,...placements.map(item => item.y + item.rows - 1));
    grid.dispatchEvent(new CustomEvent('countdesk:workspace-layout', {bubbles:true,detail:{version:1,
      grid:{columns:mobile ? 1 : DESK_GRID.columns,rows:occupiedRows},placements}}));
    requestAnimationFrame(() => window.countDeskVelaChart?.resize?.());
  }

  function widgetFor(kind) {
    if (widgets.has(kind)) return widgets.get(kind);
    const definition = widgetCatalog[kind];
    if (!definition) return null;
    const article = document.createElement('article');
    article.className = `modular-widget size-${state.sizes[kind] || 'auto'}`;
    article.dataset.kind = kind;
    article.dataset.size = state.sizes[kind] || 'auto';
    const head = document.createElement('header');
    head.className = 'modular-widget-head';
    head.draggable = true;
    head.innerHTML = `<span class="modular-widget-drag" aria-hidden="true">⠿</span><span class="modular-widget-icon" aria-hidden="true">${definition.icon}</span><strong>${definition.title}</strong><small data-widget-state></small><div class="modular-widget-actions"><button type="button" data-move="previous" title="Move panel earlier" aria-label="Move ${definition.title} earlier">↑</button><button type="button" data-move="next" title="Move panel later" aria-label="Move ${definition.title} later">↓</button><button type="button" data-size title="Resize widget" aria-label="Resize ${definition.title}">↔</button><button type="button" data-remove title="Remove widget" aria-label="Remove ${definition.title}">×</button></div>`;
    const body = document.createElement('div');
    body.className = 'modular-widget-body';
    const edges = document.createElement('div');
    edges.className = 'modular-widget-edges';
    edges.innerHTML = `<div class="modular-edge-steps"><button type="button" data-edge-size="larger" aria-label="Increase ${definition.title} grid size" title="Grow block">+</button><button type="button" data-edge-size="smaller" aria-label="Decrease ${definition.title} grid size" title="Shrink block">−</button></div><button type="button" class="modular-edge-grip" data-edge-resize aria-label="Drag to resize ${definition.title}; use arrow keys to resize" title="Drag to resize · arrow keys on focus">◢</button>`;
    article.append(head,body,edges);
    widgets.set(kind,article);
    buildWidgetContent(kind,body,article);
    wireWidget(article);
    return article;
  }

  function mountAgents(widget = null) {
    const mount = widget?.querySelector('[data-agents-mount]') || grid.querySelector('[data-agents-mount]');
    const dock = agentsParking?.querySelector('.batty-dock') || document.querySelector('#deskChatMount .batty-dock');
    if (!dock) return;
    (mount || agentsParking || parking).append(dock);
    dock.hidden = !mount;
  }

  function mountChart(widget) {
    const body = widget?.querySelector('.modular-widget-body');
    if (!body) return;
    const footer = body.querySelector('.modular-footer');
    body.insertBefore(chartElement,footer || null);
    chartElement.hidden = false;
  }

  function buildWidgetContent(kind, body, article) {
    if (kind === 'chart') {
      const footer = document.createElement('div');
      footer.className = 'modular-footer';
      footer.innerHTML = '<span>Source, timeframe, and cutoff are shown with the chart.</span><span>Paper / research only</span>';
      body.append(chartElement,footer);
      chartElement.hidden = false;
      article.querySelector('[data-widget-state]').textContent = 'Vela';
      requestAnimationFrame(() => { if (window.countDeskVelaChart && window.countDeskVelaChart.resize) window.countDeskVelaChart.resize(); });
    } else if (kind === 'agents') {
      const mount = document.createElement('div');
      mount.className = 'modular-agents-mount';
      mount.dataset.agentsMount = '';
      body.append(mount);
      mountAgents(article);
    } else if (kind === 'codex') {
      createCodexWidget(body);
    } else if (kind === 'ladder') {
      const ladder = document.createElement('div');
      ladder.className = 'modular-ladder';
      ladder.dataset.ladder = '';
      body.append(ladder);
      renderLadder();
    } else if (kind === 'watchlist') {
      const list = document.createElement('div');
      list.className = 'modular-watchlist';
      list.dataset.watchlist = '';
      body.append(list);
      renderWatchlist();
    } else if (kind === 'indicators') {
      const cubes = document.createElement('div');
      cubes.className = 'modular-cubes';
      cubes.setAttribute('aria-label','Native Vela indicator controls');
      for (const study of studies) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'modular-cube';
        button.dataset.study = study.id;
        button.innerHTML = `<span class="modular-cube-glyph" aria-hidden="true">${study.glyph}</span><span class="modular-cube-label">${study.label}</span><span class="modular-cube-state"></span>`;
        button.addEventListener('click', async () => {
          try {
            await toggleIndicator(study.id);
            syncIndicators();
          } catch (error) {
            setStatus(`${study.label} could not be changed: ${error.message}`, true);
          }
        });
        cubes.append(button);
      }
      body.append(cubes);
      syncIndicators();
    } else if (kind === 'notes') {
      const notes = document.createElement('textarea');
      notes.className = 'modular-notes';
      notes.dataset.notes = '';
      notes.setAttribute('aria-label','Local workspace notes');
      notes.placeholder = 'Capture a research question or observation…';
      notes.value = state.notes;
      notes.addEventListener('input',persist);
      const foot = document.createElement('div');
      foot.className = 'modular-footer';
      foot.innerHTML = '<span>Saved in this browser only</span><span>Research notes</span>';
      body.append(notes,foot);
    } else if (kind === 'context') {
      const context = document.createElement('div');
      context.className = 'modular-context';
      context.dataset.context = '';
      body.append(context);
      renderContext();
    }
  }

  function renderWatchlist() {
    const target = grid.querySelector('[data-watchlist]');
    if (!target) return;
    const catalog = getSymbols();
    const known = new Set(catalog.map(item => item.symbol));
    state.listSymbols = (state.listSymbols?.length ? state.listSymbols : catalog.slice(0,8).map(item => item.symbol)).filter(symbol => known.has(symbol));
    target.replaceChildren();
    if (!catalog.length) {
      target.innerHTML = '<p class="modular-provenance-note">The Count Desk symbol catalog is unavailable. Reload after the local service is ready.</p>';
      return;
    }
    const controls = document.createElement('div');
    controls.className = 'modular-list-add';
    const select = document.createElement('select');
    select.setAttribute('aria-label','Add symbol to List');
    select.append(new Option('Add instrument…',''));
    catalog.filter(item => !state.listSymbols.includes(item.symbol)).forEach(item => select.append(new Option(item.label || item.symbol,item.symbol)));
    select.addEventListener('change',() => {
      if (!select.value) return;
      state.listSymbols.push(select.value);
      renderWatchlist(); persist();
    });
    controls.append(select); target.append(controls);
    if (!state.listSymbols.length) {
      const empty = document.createElement('p'); empty.className = 'modular-provenance-note'; empty.textContent = 'Add instruments from the Count Desk catalog.'; target.append(empty);
    }
    for (const symbol of state.listSymbols) {
      const item = catalog.find(entry => entry.symbol === symbol);
      if (!item) continue;
      const row = document.createElement('div');
      row.className = 'modular-watch-row';
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = item.label || item.symbol;
      button.title = `Load ${item.label || item.symbol} into the chart`;
      button.addEventListener('click', () => selectSymbol(item.symbol));
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'modular-list-remove'; remove.textContent = '×';
      remove.setAttribute('aria-label',`Remove ${item.symbol} from List`);
      remove.addEventListener('click',() => { state.listSymbols = state.listSymbols.filter(value => value !== item.symbol); renderWatchlist(); persist(); });
      row.append(button,remove);
      target.append(row);
    }
    const foot = document.createElement('div');
    foot.className = 'modular-footer';
    foot.textContent = 'Saved locally · select an instrument to load its chart';
    target.append(foot);
  }

  function renderLadder() {
    const target = grid.querySelector('[data-ladder]');
    if (!target) return;
    const context = getLadderContext?.();
    target.replaceChildren();
    if (!context?.bar || !Number.isFinite(Number(context.bar.close))) {
      const empty = document.createElement('p'); empty.className = 'modular-provenance-note';
      empty.textContent = 'Load a chart to view its latest stored bar reference levels.'; target.append(empty); return;
    }
    const {bar, symbol, timeframe, source, cutoff} = context;
    const meta = document.createElement('div'); meta.className = 'modular-ladder-meta';
    meta.textContent = `${symbol} · ${timeframe} · ${source || 'chart source'} · cutoff ${cutoff || new Date(Number(bar.time)).toLocaleString()}`;
    target.append(meta);
    const levels = [
      ['HIGH',Number(bar.high),'high'],['OPEN',Number(bar.open),'open'],['CLOSE',Number(bar.close),'close'],['LOW',Number(bar.low),'low'],
    ].filter(([,price]) => Number.isFinite(price) && price > 0).sort((a,b) => b[1] - a[1]);
    const rangeLow = Math.min(...levels.map(([,price]) => price));
    const rangeHigh = Math.max(...levels.map(([,price]) => price));
    for (const [label,price,kind] of levels) {
      const row = document.createElement('div'); row.className = `modular-ladder-row is-${kind}`;
      const priceText = document.createElement('strong'); priceText.className = 'modular-ladder-price';
      priceText.textContent = price.toLocaleString('en-US',{maximumFractionDigits:8});
      const barLabel = document.createElement('span'); barLabel.textContent = label;
      const marker = document.createElement('span'); marker.className = 'modular-ladder-bar'; marker.setAttribute('aria-hidden','true');
      const withinRange = rangeHigh === rangeLow ? 50 : (price - rangeLow) / (rangeHigh - rangeLow) * 100;
      marker.style.setProperty('--level-position',`${Math.max(2,Math.min(98,withinRange))}%`);
      const actions = document.createElement('div'); actions.className = 'modular-ladder-actions';
      for (const [side,text] of [['long','Buy'],['short','Sell']]) {
        const action = document.createElement('button'); action.type = 'button'; action.textContent = text; action.dataset.side = side;
        action.setAttribute('aria-label',`Stage paper ${text.toLowerCase()} limit at ${price}`);
        action.disabled = !canStagePaperPrice?.();
        action.title = action.disabled ? 'Paper planning is available for supported stored micro-futures charts.' : 'Stage a paper limit plan for review';
        action.addEventListener('click',() => {
          if (!stagePaperPrice?.(price,side)) { setStatus('Paper staging is available only for a supported stored micro-futures chart.',true); return; }
          setStatus(`Paper ${text.toLowerCase()} limit staged at ${price}. Review it in the chart’s Paper planner; nothing was sent.`);
        });
        actions.append(action);
      }
      row.append(priceText,marker,barLabel,actions); target.append(row);
    }
    const foot = document.createElement('div'); foot.className = 'modular-footer';
    foot.textContent = `Stored bar OHLC levels · ${context.confirmed ? 'confirmed stored context' : 'provisional context'} · no bid/ask depth`;
    target.append(foot);
  }

  function renderContext() {
    const target = grid.querySelector('[data-context]');
    if (!target) return;
    const context = getLadderContext?.();
    target.replaceChildren();
    const title = document.createElement('div'); title.className = 'modular-context-heading';
    title.textContent = 'CHART DATA CONTEXT'; target.append(title);
    if (!context?.bar || !Number.isFinite(Number(context.bar.close))) {
      const empty = document.createElement('p'); empty.className = 'modular-provenance-note';
      empty.textContent = 'Load a chart to see its symbol, source, timeframe, and data cutoff.'; target.append(empty); return;
    }
    const {bar,symbol,timeframe,source,cutoff} = context;
    const fields = [['Instrument',symbol],['Timeframe',timeframe],['Source',source || 'Not provided'],['Cutoff',cutoff || new Date(Number(bar.time)).toLocaleString()],['Bar close',Number(bar.close).toLocaleString('en-US',{maximumFractionDigits:8})],['Evidence',context.confirmed ? 'Stored chart context' : 'Provisional context']];
    for (const [label,value] of fields) {
      const row = document.createElement('div'); row.className = 'modular-context-row';
      const key = document.createElement('span'); key.textContent = label;
      const detail = document.createElement('strong'); detail.textContent = String(value);
      row.append(key,detail); target.append(row);
    }
    const foot = document.createElement('div'); foot.className = 'modular-footer';
    foot.textContent = 'Historical context only · freshness follows the source shown above'; target.append(foot);
  }

  function syncIndicators() {
    const selection = getIndicators();
    for (const button of grid.querySelectorAll('[data-study]')) {
      const selected = selection.selected.has(button.dataset.study);
      const rendered = selection.rendered.has(button.dataset.study);
      button.setAttribute('aria-pressed',String(selected));
      const status = button.querySelector('.modular-cube-state');
      status.textContent = selected ? rendered ? 'ON · CHART' : 'SELECTED' : 'OFF';
      button.title = rendered ? `${button.querySelector('.modular-cube-label').textContent} is rendered on the active chart` : selected ? 'Selected for the next loaded chart; not currently rendered' : 'Select this study for the active chart';
    }
  }

  function wireWidget(article) {
    article.querySelectorAll('[data-edge-size]').forEach(button => button.addEventListener('click',() =>
      changeSpan(article,button.dataset.edgeSize === 'larger' ? 1 : -1)));
    const grip = article.querySelector('[data-edge-resize]');
    grip.addEventListener('pointerdown',event => startEdgeResize(article,event));
    grip.addEventListener('keydown',event => {
      if (!['ArrowRight','ArrowLeft','ArrowUp','ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      changeSpan(article,(event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) * (event.shiftKey ? 2 : 1),
        event.key === 'ArrowRight' || event.key === 'ArrowLeft' ? 'horizontal' : 'vertical');
    });
    article.addEventListener('pointerdown',event => {
      if (event.target.closest('.modular-widget-edges')) return;
      grid.querySelectorAll('.is-selected').forEach(item => item.classList.remove('is-selected'));
      article.classList.add('is-selected');
    });
    article.querySelectorAll('[data-move]').forEach(button => button.addEventListener('click',() => {
      const neighbor = button.dataset.move === 'previous' ? article.previousElementSibling : article.nextElementSibling;
      if (!neighbor) return;
      if (button.dataset.move === 'previous') grid.insertBefore(article,neighbor);
      else grid.insertBefore(neighbor,article);
      delete state.positions[article.dataset.kind];
      applyAdaptiveLayout();
      persist();
      snap(article);
    }));
    article.querySelector('[data-size]').addEventListener('click', () => {
      if (window.matchMedia('(max-width:760px)').matches) {
        const rows = Number(article.dataset.layoutRows);
        changeSpan(article,rows >= 4 ? 1 - rows : 1);
        return;
      }
      const order = ['auto','small','medium','wide','full'];
      const next = order[(order.indexOf(article.dataset.size) + 1) % order.length];
      if (next === 'auto') delete state.sizes[article.dataset.kind];
      else state.sizes[article.dataset.kind] = next;
      delete state.spans[article.dataset.kind];
      delete state.positions[article.dataset.kind];
      applyAdaptiveLayout();
      persist();
      snap(article);
    });
    article.querySelector('[data-remove]').addEventListener('click', () => removeWidget(article.dataset.kind));
    article.addEventListener('dragstart',event => {
      if (!event.target.closest('.modular-widget-head') || event.target.closest('button')) { event.preventDefault(); return; }
      draggedWidget = article;
      article.classList.add('is-dragging');
      event.dataTransfer.effectAllowed = 'move';
    });
    article.addEventListener('dragend',() => {
      article.classList.remove('is-dragging');
      grid.querySelectorAll('.is-drop-target').forEach(item => item.classList.remove('is-drop-target'));
      draggedWidget = null;
      persist();
    });
    article.addEventListener('dragover',event => {
      event.preventDefault();
      if (draggedWidget && draggedWidget !== article) article.classList.add('is-drop-target');
    });
    article.addEventListener('dragleave',() => article.classList.remove('is-drop-target'));
    article.addEventListener('drop',event => {
      event.preventDefault();
      article.classList.remove('is-drop-target');
      if (!draggedWidget || draggedWidget === article) return;
      const before = event.clientY < article.getBoundingClientRect().top + article.offsetHeight / 2;
      grid.insertBefore(draggedWidget,before ? article : article.nextSibling);
      delete state.positions[draggedWidget.dataset.kind];
      applyAdaptiveLayout();
      persist();
      snap(draggedWidget);
    });
  }

  function addWidget(kind, {load = true} = {}) {
    const widget = widgetFor(kind);
    if (!widget) return;
    if (widget.parentElement === grid) {
      setStatus(`${widgetCatalog[kind].title} is already on this layout.`);
      return;
    }
    if (kind === 'chart' && load && grid.firstElementChild) grid.insertBefore(widget,grid.firstElementChild);
    else grid.append(widget);
    const region = kind === 'chart' ? 'center' : ['agents','codex','watchlist'].includes(kind) ? 'left' : 'right';
    widget.dataset.region = region;
    widget.hidden = workspace.classList.contains(`is-${region}-collapsed`);
    if (!state.sizes[kind]) widget.dataset.size = 'auto';
    applyAdaptiveLayout();
    blank.hidden = true;
    if (!restoringLayout) persist();
    if (load) snap(widget);
    if (kind === 'watchlist') renderWatchlist();
    if (kind === 'agents') mountAgents(widget);
    if (kind === 'ladder') renderLadder();
    if (kind === 'context') renderContext();
    if (kind === 'indicators') syncIndicators();
    if (kind === 'chart') mountChart(widget);
    if (kind === 'chart' && load) void loadChart();
    if (kind === 'chart') requestAnimationFrame(() => { if (window.countDeskVelaChart && window.countDeskVelaChart.resize) window.countDeskVelaChart.resize(); });
    dialog.close();
  }

  function removeWidget(kind) {
    const widget = widgets.get(kind);
    if (!widget) return;
    if (kind === 'chart') {
      chartElement.hidden = true;
      parking.append(chartElement);
    }
    if (kind === 'agents') {
      const dock = widget.querySelector('.batty-dock');
      if (dock) { agentsParking?.append(dock); dock.hidden = true; }
    }
    widget.remove();
    delete state.sizes[kind];
    delete state.spans[kind];
    delete state.mobileRows[kind];
    delete state.positions[kind];
    if (!grid.children.length) state.layoutMode = 'scratch';
    applyAdaptiveLayout();
    persist();
  }

  function loadLayout(name, order, layoutMode = 'custom') {
    for (const kind of [...grid.children].map(widget => widget.dataset.kind)) removeWidget(kind);
    state.name = name;
    state.layoutMode = layoutMode;
    state.sizes = {};
    state.spans = {};
    state.mobileRows = {};
    state.positions = {};
    nameInput.value = name;
    restoringLayout = true;
    for (const kind of order) addWidget(kind,{load:false});
    restoringLayout = false;
    persist();
    if (order.includes('chart')) void loadChart();
  }

  function renderTemplates() {
    templateList.replaceChildren();
    if (!templates.length) {
      const empty = document.createElement('p');
      empty.className = 'modular-template-empty';
      empty.textContent = 'No saved workspace templates yet. Save your current setup to keep a reusable copy.';
      templateList.append(empty);
      return;
    }
    for (const item of templates) {
      const card = document.createElement('article');
      card.className = 'modular-template-card';
      const info = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = item.name;
      const detail = document.createElement('small');
      const savedAt = item.savedAt ? new Date(item.savedAt).toLocaleString() : 'Saved locally';
      detail.textContent = `${item.layout.order.length} panels · ${savedAt}`;
      info.append(title,detail);
      const actions = document.createElement('div'); actions.className = 'modular-template-card-actions';
      for (const [label,action] of [['Load','load'],['Update','update'],['Duplicate','duplicate'],['Rename','rename'],['Delete','delete']]) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.dataset.action = action;
        if (action === 'delete') button.className = 'is-delete';
        button.addEventListener('click',() => templateAction(item.id,action));
        actions.append(button);
      }
      card.append(info,actions); templateList.append(card);
    }
  }

  function saveCurrentTemplate(name, replaceId = null) {
    const cleanName = name.trim().slice(0,40);
    if (!cleanName) { templateStatus.textContent = 'Enter a template name first.'; templateName.focus(); return; }
    const randomId = window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : `layout-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const template = {id:replaceId || randomId,name:cleanName,layout:snapshotLayout(cleanName),savedAt:new Date().toISOString()};
    const index = templates.findIndex(item => item.id === template.id);
    if (index >= 0) templates[index] = template; else templates.unshift(template);
    if (!saveTemplates()) return;
    templateStatus.textContent = `Saved “${cleanName}” on this browser.`;
    renderTemplates();
  }

  function templateAction(id, action) {
    const item = templates.find(template => template.id === id);
    if (!item) return;
    if (action === 'load') {
      const saved = item.layout;
      for (const kind of [...grid.children].map(widget => widget.dataset.kind)) removeWidget(kind);
      state = {name:item.name,order:[],layoutMode:saved.layoutMode === 'scratch' && !saved.order?.length ? 'scratch' : 'custom',
        sizes:saved.sizes || {},spans:saved.spans || {},mobileRows:saved.mobileRows || {},positions:saved.positions || {},notes:saved.notes || '',
        listSymbols:saved.listSymbols || [],platformSettings:saved.platformSettings || null};
      nameInput.value = item.name;
      restoringLayout = true;
      for (const kind of (saved.order || []).filter(kind => Object.hasOwn(widgetCatalog,kind))) addWidget(kind,{load:false});
      restoringLayout = false;
      applyAdaptiveLayout();
      persist();
      Promise.resolve(applyPlatformSettings ? applyPlatformSettings(saved.platformSettings || null) : null).then(() => {
        persist();
        if (saved.order && saved.order.includes('chart')) return loadChart();
      }).then(() => { templateStatus.textContent = `Loaded “${item.name}”. Active workspace autosaves locally.`; })
        .catch(error => { templateStatus.textContent = `Template loaded, but chart restore needs attention: ${error.message}`; });
      return;
    }
    if (action === 'update') { saveCurrentTemplate(item.name,item.id); return; }
    if (action === 'duplicate') { templateName.value = `${item.name} copy`.slice(0,40); saveCurrentTemplate(templateName.value); return; }
    if (action === 'rename') {
      const next = window.prompt('Rename workspace template',item.name);
      if (next == null) return;
      const clean = next.trim().slice(0,40);
      if (!clean) { templateStatus.textContent = 'Template names cannot be blank.'; return; }
      item.name = clean; item.layout.name = clean; item.savedAt = new Date().toISOString();
      if (saveTemplates()) { templateStatus.textContent = `Renamed template to “${clean}”.`; renderTemplates(); }
      return;
    }
    if (action === 'delete' && window.confirm(`Delete the saved template “${item.name}”? The active workspace will remain available.`)) {
      templates = templates.filter(template => template.id !== id);
      if (saveTemplates()) { templateStatus.textContent = `Deleted “${item.name}”.`; renderTemplates(); }
    }
  }

  const restoredOrder = [...state.order];
  const soundButton = document.createElement('button');
  soundButton.type = 'button';
  soundButton.id = 'modularSnapSound';
  soundButton.setAttribute('aria-pressed',String(soundOn));
  soundButton.textContent = soundOn ? 'Snap sound on' : 'Snap sound off';
  soundButton.title = 'Toggle the block placement sound';
  $('#modularAddWidget').before(soundButton);
  soundButton.addEventListener('click',() => {
    soundOn = !soundOn;
    soundButton.setAttribute('aria-pressed',String(soundOn));
    soundButton.textContent = soundOn ? 'Snap sound on' : 'Snap sound off';
    try { localStorage.setItem(snapSoundKey,soundOn ? 'on' : 'off'); } catch { /* Optional preference. */ }
    if (soundOn) snap(null);
  });
  restoringLayout = true;
  for (const kind of restoredOrder) addWidget(kind,{load:false});
  restoringLayout = false;
  restoredOrder.forEach(kind => { const widget = widgets.get(kind); if (widget?.parentElement === grid) grid.append(widget); });
  applyAdaptiveLayout();
  persist();
  grid.addEventListener('dragover',event => {
    if (draggedWidget && event.target === grid) event.preventDefault();
  });
  grid.addEventListener('drop',event => {
    if (!draggedWidget || event.target !== grid) return;
    event.preventDefault();
    if (window.matchMedia('(max-width:760px)').matches) {
      grid.append(draggedWidget);
      applyAdaptiveLayout(); persist(); snap(draggedWidget);
      return;
    }
    const bounds = grid.getBoundingClientRect();
    const x = Math.max(1,Math.min(12,Math.ceil((event.clientX - bounds.left) / (bounds.width / 12))));
    const y = Math.max(1,Math.min(8,Math.ceil((event.clientY - bounds.top + grid.scrollTop) / (bounds.height / 8))));
    state.positions[draggedWidget.dataset.kind] = {x,y};
    applyAdaptiveLayout(); persist(); snap(draggedWidget);
  });
  window.addEventListener('resize',() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applyAdaptiveLayout,90);
  });
  nameInput.addEventListener('change',persist);
  $('#modularAddWidget').addEventListener('click',() => dialog.showModal());
  const toggleWorkspaceRail = (side,button) => {
    const collapsed = workspace.classList.toggle(`is-${side}-collapsed`);
    button.setAttribute('aria-expanded',String(!collapsed));
    button.setAttribute('aria-label',`${collapsed ? 'Expand' : 'Collapse'} ${side} container`);
    button.title = `${collapsed ? 'Expand' : 'Collapse'} ${side} container`;
    for (const widget of grid.children) if (widget.dataset.region === side) widget.hidden = collapsed;
    applyAdaptiveLayout();
    requestAnimationFrame(() => window.countDeskVelaChart?.resize?.());
  };
  $('#modularToggleLeft').addEventListener('click',event => toggleWorkspaceRail('left',event.currentTarget));
  $('#modularToggleRight').addEventListener('click',event => toggleWorkspaceRail('right',event.currentTarget));
  $('#modularAddWidget').addEventListener('click',() => dialog.showModal());
  $('#modularSelectCodex').addEventListener('click',() => {
    const widget = widgets.get('codex');
    if (widget?.parentElement !== grid) addWidget('codex');
    if (workspace.classList.contains('is-left-collapsed')) $('#modularToggleLeft').click();
    const selected = widgets.get('codex');
    selected?.scrollIntoView({behavior:'smooth',block:'nearest'});
    selected?.querySelector('.codex-widget-composer textarea')?.focus({preventScroll:true});
  });
  document.querySelector('[data-open-widget-gallery]').addEventListener('click',() => dialog.showModal());
  dialog.addEventListener('click',event => { if (event.target === dialog) dialog.close(); });
  dialog.querySelectorAll('[data-modular-add]').forEach(button => button.addEventListener('click',() => addWidget(button.dataset.modularAdd)));
  dialog.querySelectorAll('[data-modular-preset]').forEach(button => button.addEventListener('click',() => {
    const preset = button.dataset.modularPreset;
    if (preset === 'scratch') loadLayout('Scratch',[],'scratch');
    else if (preset === 'standard') loadLayout('Standard desk',standardOrder,'standard');
    else if (preset === 'research') loadLayout('Research desk',['chart','ladder','watchlist','indicators','context','notes']);
    else loadLayout('Chart focus',['chart','ladder','watchlist']);
    dialog.close();
  }));
  $('#modularNewLayout').addEventListener('click',() => loadLayout('Scratch',[],'scratch'));
  $('#modularManageTemplates').addEventListener('click',() => { templateStatus.textContent = ''; templateName.value = ''; renderTemplates(); templateDialog.showModal(); });
  $('#modularSaveTemplate').addEventListener('click',() => { templateStatus.textContent = ''; templateName.value = state.name === 'Untitled layout' ? '' : state.name; renderTemplates(); templateDialog.showModal(); templateName.focus(); });
  $('#modularTemplateSaveCurrent').addEventListener('click',() => saveCurrentTemplate(templateName.value));
  templateDialog.addEventListener('click',event => { if (event.target === templateDialog) templateDialog.close(); });
  document.addEventListener('countdesk:agents-ready',event => {
    const dock = event.detail?.dock;
    if (dock) {
      const mount = grid.querySelector('[data-agents-mount]');
      (mount || agentsParking || parking).append(dock);
      dock.hidden = !mount;
    }
  });
  window.addEventListener('countdesk:chart-context',() => { syncIndicators(); renderLadder(); renderContext(); persist(); });
  return {
    addWidget,renderWatchlist,renderLadder,syncIndicators,
    addToWatchlist(symbol) {
      if (!getSymbols().some(item => item.symbol === symbol)) return;
      if (!state.listSymbols.includes(symbol)) state.listSymbols.push(symbol);
      renderWatchlist(); persist();
    },
    mountAgents(dock) {
      const mount = grid.querySelector('[data-agents-mount]');
      (mount || agentsParking || parking).append(dock);
      dock.hidden = !mount;
    },
    hasChart:() => widgets.has('chart') && widgets.get('chart').parentElement === grid,
    loadSavedChart:() => { if (widgets.has('chart') && widgets.get('chart').parentElement === grid) return loadChart(); },
    ensureChart:() => { if (!widgets.has('chart') || widgets.get('chart').parentElement !== grid) addWidget('chart',{load:false}); },
    savedPlatformSettings:() => state.platformSettings,
    saveCurrentState:persist,
  };
}
