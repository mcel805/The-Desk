const api = '/api/codex-widget';

async function request(path, options = {}) {
  const response = await fetch(`${api}${path}`, {cache:'no-store', ...options});
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Codex request failed (${response.status}).`);
  return body;
}

function chartSnapshot() {
  const view = window.countDeskVelaContext || {};
  const sourceLabel = document.querySelector('#velaProvenance')?.textContent?.trim()?.slice(0,500) || 'Source unavailable';
  return {
    tab:view.tab || 'Count Desk',
    symbol:view.symbol || document.querySelector('#velaSymbol')?.value || '',
    timeframe:view.timeframe || document.querySelector('#velaTimeframe')?.value || '',
    cutoff:view.cutoff || sourceLabel.match(/\bcutoff\s+([^·]+)/i)?.[1]?.trim() || null,
    sourceLabel,
    studies:document.querySelector('#cleoIndicators')?.textContent?.trim()?.slice(0,250) || 'Unverified',
    capturedAt:new Date().toISOString(),
  };
}

export function createCodexWidget(host, {contextProvider = chartSnapshot, surface = 'vela', applyChartMarkup = null, applyElliottMarkup = null, applyMarketReadMarkup = null, captureChartImage = null, collectReadMarket = null} = {}) {
  const root = document.createElement('section');
  root.className = 'codex-widget';
  root.dataset.surface = surface;
  root.innerHTML = `<header class="codex-widget-welcome"><button type="button" class="codex-widget-avatar" aria-label="Edit Cleo avatar" title="Edit Cleo avatar">C</button><div><small>YOUR TRADING PARTNER</small><strong class="codex-widget-persona">Cleo</strong><span>Chart reads · quant research · paper strategies</span></div><button type="button" class="codex-widget-setup-open">Set up</button></header>
    <div class="codex-widget-toolbar"><span class="codex-widget-auth" role="status">Checking sign-in…</span><label class="codex-widget-thread-label">Conversation<select class="codex-widget-threads" aria-label="Recent conversations"></select></label><button type="button" class="codex-widget-new">＋ New chat</button></div>
    <details class="codex-widget-options"><summary>Work settings <span>Research is read-only · Build can edit this workspace</span></summary><div class="codex-widget-controls"><label>Mode<select class="codex-widget-mode" aria-label="Codex permission mode"><option value="research">Research · read only</option><option value="build">Build · edit and test</option></select></label><label>Skill<select class="codex-widget-skill" aria-label="Use a Codex skill"><option value="">Auto · choose as needed</option></select></label><label>Specialist<select class="codex-widget-agent" aria-label="Ask a named Codex agent"><option value="">No separate specialist</option></select></label></div></details>
    <div class="codex-widget-context" role="status">Chart context is shared with your next message. Source and cutoff are shown here.</div>
    <div class="codex-widget-stream" aria-live="polite"><section class="codex-widget-welcome-card"><span class="codex-widget-welcome-spark" aria-hidden="true">✦</span><h2>What are we looking at?</h2><p>I can read the chart with you, shape an indicator idea, or map out a paper strategy. I’ll show the work stages as they happen and call out what I could actually verify.</p><div class="codex-widget-starters"><button type="button" data-starter="Read the active chart. Tell me what stands out, what argues against the setup, and what would change your view.">Read this chart</button><button type="button" data-starter="Help me turn this indicator idea into one clear purpose, exact rules, and a build plan.">Build an indicator</button><button type="button" data-starter="Help me formalize this strategy as a paper study, including entries, exits, costs, and what would disprove it.">Study a strategy</button><button type="button" data-starter="Review the current market context and sentiment using available sourced data. Tell me what was actually checked.">Check market context</button>${surface === 'quant-lab' ? '<button type="button" class="codex-widget-read-market" data-action="read-market">✦ Read the Market · 10 chart intervals</button>' : ''}</div></section></div>
    <details class="codex-widget-help"><summary>How Cleo’s work stages are shown</summary><p>The live work card reports visible events such as chart/data reads, source searches, specialist starts, and local build steps. It gives concise activity summaries, not private chain-of-thought. A stage appears only when the connected runtime reports that work.</p><p>Research is read-only. Build can edit this repository and run local checks. Codex pauses for command or file approvals. Indicator measurements, strategy outcomes, and paper fills are reported only when their actual tools return evidence.</p></details>
    <div class="codex-widget-activity" role="status" aria-live="polite"><span class="codex-widget-activity-dot" aria-hidden="true"></span><span class="codex-widget-activity-text">Ready when you are · research and paper only</span></div>
    <form class="codex-widget-composer"><textarea rows="3" maxlength="12000" aria-label="Message Cleo" placeholder="Ask Cleo about the chart, a market, or an indicator…"></textarea><div class="codex-widget-compose-row"><label class="codex-widget-chart-toggle"><input type="checkbox" class="codex-widget-chart" checked> Share chart</label><label class="codex-widget-attach">＋ Screenshot<input class="codex-widget-image" type="file" accept="image/png,image/jpeg,image/webp" hidden></label><button type="button" class="codex-widget-stop" hidden>Stop</button><button type="submit" class="codex-widget-send">Send <span aria-hidden="true">↑</span></button></div><div class="codex-widget-image-name" hidden></div><small class="codex-widget-paper-note">Research and paper workflows · no live order routing</small></form>
    <div class="cleo-setup-backdrop" hidden><section class="cleo-setup-dialog" role="dialog" aria-modal="true" aria-labelledby="cleoSetupTitle"><header><div><small>TRADING AGENT SETUP</small><button type="button" class="cleo-setup-close" aria-label="Close setup">×</button></div><h2 id="cleoSetupTitle">Build your Cleo workspace</h2><p>Choose what Cleo should focus on. You can change this any time.</p></header><div class="cleo-setup-progress" aria-label="Setup progress"><span></span><span></span><span></span></div><main class="cleo-setup-page" data-page="0"><h3>What will you use Cleo for?</h3><p>Choose all that apply.</p><div class="cleo-setup-options" data-group="workflows"><button type="button" data-value="charting"><b>Chart reads</b><small>Structure, levels, context and annotated chart reviews</small></button><button type="button" data-value="indicators"><b>Indicators</b><small>Define, build and review indicator ideas</small></button><button type="button" data-value="strategies"><b>Strategies & research</b><small>Formalize rules and design paper studies</small></button><button type="button" data-value="agentic"><b>Trading agents</b><small>Design guarded, human-controlled paper or shadow systems</small></button></div></main><main class="cleo-setup-page" data-page="1" hidden><h3>Which markets matter to you?</h3><p>Choose the markets you want Cleo to prioritize. Data availability still depends on the selected source.</p><div class="cleo-setup-options cleo-setup-markets" data-group="markets"><button type="button" data-value="stocks">Stocks</button><button type="button" data-value="etfs">ETFs</button><button type="button" data-value="crypto">Crypto</button><button type="button" data-value="futures">Futures</button><button type="button" data-value="forex">Forex & CFDs</button></div></main><main class="cleo-setup-page" data-page="2" hidden><h3>Choose your working team</h3><p>Cleo stays your primary mentor. Pick one available specialist as the default for a request.</p><div class="cleo-team-primary"><b>Cleo · Primary mentor</b><span>Chart analysis, indicator and strategy research, agent policy design</span></div><div class="cleo-setup-roster" aria-label="Available specialists"></div><label class="cleo-setup-specialist">Default specialist<select class="cleo-setup-agent"><option value="">Cleo handles requests by default</option></select></label><p class="cleo-setup-disclosure">A specialist runs only when a request is sent with that agent selected. Setup does not start background monitoring, dispatch workers, or enable trading.</p></main><footer><button type="button" class="cleo-setup-back">Back</button><span class="cleo-setup-step">1 of 3</span><button type="button" class="cleo-setup-next">Continue</button></footer></section></div>
    <div class="cleo-avatar-backdrop" hidden><section class="cleo-avatar-dialog" role="dialog" aria-modal="true" aria-labelledby="cleoAvatarTitle" aria-describedby="cleoAvatarHelp"><header><div><small>CLEO PROFILE</small><button type="button" class="cleo-avatar-close" aria-label="Close avatar picker">×</button></div><h2 id="cleoAvatarTitle">Choose Cleo’s avatar</h2><p id="cleoAvatarHelp">Pick one cat portrait. Your choice becomes Cleo’s default avatar in this browser.</p></header><div class="cleo-avatar-grid" role="group" aria-label="25 cat avatars"></div><p class="cleo-avatar-error" role="alert" hidden></p><footer><button type="button" class="cleo-avatar-cancel">Cancel</button><button type="button" class="cleo-avatar-save" disabled>Save avatar</button></footer></section></div>`;
  host.append(root);
  const $ = selector => root.querySelector(selector);
  const auth = $('.codex-widget-auth');
  const selector = $('.codex-widget-threads');
  const stream = $('.codex-widget-stream');
  const activity = $('.codex-widget-activity');
  const form = $('.codex-widget-composer');
  const textarea = form.querySelector('textarea');
  const sendButton = $('.codex-widget-send');
  const stopButton = $('.codex-widget-stop');
  const modeSelect = $('.codex-widget-mode');
  const skillSelect = $('.codex-widget-skill');
  const agentSelect = $('.codex-widget-agent');
  const imageInput = $('.codex-widget-image');
  const contextLine = $('.codex-widget-context');
  const activityText = $('.codex-widget-activity-text');
  const persona = $('.codex-widget-persona');
  const setupBackdrop = $('.cleo-setup-backdrop');
  const setupAgent = $('.cleo-setup-agent');
  const avatarButton = $('.codex-widget-avatar');
  const avatarBackdrop = $('.cleo-avatar-backdrop');
  const avatarGrid = $('.cleo-avatar-grid');
  const avatarSave = $('.cleo-avatar-save');
  const avatarStorageKey = 'countdesk.cleo.avatar.v1';
  const avatarUrl = index => new URL(`./cleo-avatar-assets/icons/cat-${String(index + 1).padStart(2, '0')}.png`, import.meta.url).href;
  const avatarFaces = ['🐈','🐈‍⬛','😺','😸','😹','😻','😼','😽','🙀','😿','😾','🐈','🐈‍⬛','😺','😸','😹','😻','😼','😽','🙀','😿','😾','🐈','🐈‍⬛','😺'];
  let pendingAvatar = null;
  const profileKey = `countdesk.cleo.profile.v1.${surface}`;
  const choices = {
    workflows: ['charting', 'indicators', 'strategies', 'agentic'],
    markets: ['stocks', 'etfs', 'crypto', 'futures', 'forex'],
  };
  let profile = loadProfile();
  function readAvatar() {
    try {
      const saved = localStorage.getItem(avatarStorageKey);
      if (saved == null || !/^\d+$/.test(saved)) return null;
      const value = Number(saved);
      return Number.isInteger(value) && value >= 0 && value < 25 ? value : null;
    } catch { return null; }
  }
  function applyAvatar(index) {
    if (!Number.isInteger(index) || index < 0 || index >= 25) {
      avatarButton.textContent = 'C';
      avatarButton.classList.remove('has-avatar');
      avatarButton.removeAttribute('style');
      return;
    }
    avatarButton.replaceChildren();
    avatarButton.classList.add('has-avatar');
    const image = document.createElement('img');
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    image.addEventListener('error', () => { avatarButton.textContent = avatarFaces[index]; }, {once:true});
    image.src = avatarUrl(index);
    avatarButton.append(image);
  }
  function renderAvatarPicker(selected) {
    avatarGrid.replaceChildren();
    for (let index = 0; index < 25; index += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cleo-avatar-choice';
      button.dataset.avatarIndex = String(index);
      button.setAttribute('aria-label', `Cat avatar ${index + 1}`);
      button.setAttribute('aria-pressed', String(index === selected));
      button.classList.toggle('is-selected', index === selected);
      const image = document.createElement('img');
      image.alt = '';
      image.setAttribute('aria-hidden', 'true');
      image.addEventListener('error', () => {
        button.classList.add('is-unavailable');
        button.textContent = avatarFaces[index];
      }, {once:true});
      image.src = avatarUrl(index);
      button.append(image);
      button.addEventListener('click', () => {
        pendingAvatar = index;
        renderAvatarPicker(pendingAvatar);
        avatarGrid.querySelector(`[data-avatar-index="${pendingAvatar}"]`)?.focus();
      });
      avatarGrid.append(button);
    }
    avatarSave.disabled = selected == null;
  }
  function openAvatarPicker() {
    pendingAvatar = readAvatar();
    $('.cleo-avatar-error').hidden = true;
    renderAvatarPicker(pendingAvatar);
    avatarBackdrop.hidden = false;
    $('.cleo-avatar-dialog').scrollTop = 0;
    $('.cleo-avatar-close').focus();
  }
  function closeAvatarPicker() {
    avatarBackdrop.hidden = true;
    avatarButton.focus();
  }
  function saveAvatar() {
    if (pendingAvatar == null) return;
    try {
      localStorage.setItem(avatarStorageKey, String(pendingAvatar));
      applyAvatar(pendingAvatar);
      closeAvatarPicker();
    } catch {
      const error = $('.cleo-avatar-error');
      error.textContent = 'Could not save the avatar in this browser. Please try again.';
      error.hidden = false;
    }
  }
  applyAvatar(readAvatar());
  let setupPage = 0;
  let threadId = '';
  let turnId = '';
  let sequence = 0;
  let busy = false;
  let collectingReadMarket = false;
  let polling = false;
  let connecting = false;
  let reconnectTimer = 0;
  let planType = '';
  let requiresSignIn = false;
  let requestedAgent = '';
  let activeMode = 'research';
  let activeChartRead = false;
  let activeReadMarket = false;
  let activeReadMarketContext = null;
  let activeReadMarketMarksTried = false;
  let pendingReadMarket = null;
  let chartReadFinalReturned = false;
  const messages = new Map();
  const appliedMarkupResults = new WeakMap();
  const approvalCards = new Map();
  let currentWorkCard = null;
  let workSteps = new Map();
  const primaryChart = chart => chart?.charts?.find(item => item.chart === chart.activeChart) || chart;
  const isChartWorkflowNote = value => /^i(?:['’]m| am) (?:applying|using|following|handing|sending|reviewing)\b/i.test(String(value||'').trim())
    && /\b(?:workflow|snapshot|for review|to cleo)\b/i.test(String(value||''));

  function assistantName() {
    if (agentSelect.value === 'tradingagents') return 'TradingAgents';
    if (skillSelect.value === 'cleo' || agentSelect.value === 'cleo') return 'Cleo';
    return surface === 'quant-lab' ? 'Quant Lab' : 'Codex';
  }
  function updatePersona() {
    const name = assistantName();
    persona.textContent = name;
    textarea.setAttribute('aria-label', `Message ${name}`);
    textarea.placeholder = `Ask ${name} about the chart, a market, or an indicator…`;
  }
  function loadProfile() {
    try {
      const value = JSON.parse(localStorage.getItem(profileKey) || '{}');
      return {
        workflows: choices.workflows.filter(item => value.workflows?.includes(item)),
        markets: choices.markets.filter(item => value.markets?.includes(item)),
        defaultAgent: typeof value.defaultAgent === 'string' ? value.defaultAgent : '',
      };
    } catch { return {workflows:[], markets:[], defaultAgent:''}; }
  }
  function syncProfileToControls() {
    if (profile.defaultAgent && [...agentSelect.options].some(option => option.value === profile.defaultAgent))
      agentSelect.value = profile.defaultAgent;
    else if (!agentSelect.value) agentSelect.value = '';
    if (profile.workflows.includes('indicators')) {
      const indicatorSkill = [...skillSelect.options].find(option => /indicator/i.test(`${option.value} ${option.text}`));
      if (indicatorSkill) skillSelect.value = indicatorSkill.value;
    }
    if (!skillSelect.value && [...skillSelect.options].some(option => option.value === 'cleo')) skillSelect.value = 'cleo';
    if (agentSelect.value === 'tradingagents' && skillSelect.value === 'cleo') skillSelect.value = '';
    updatePersona();
  }
  function openSetup() {
    setupPage = 0;
    renderSetupPage();
    for (const group of Object.keys(choices)) {
      for (const button of root.querySelectorAll(`[data-group="${group}"] [data-value]`))
        button.classList.toggle('is-selected', profile[group].includes(button.dataset.value));
    }
    setupAgent.value = profile.defaultAgent;
    syncRosterSelection();
    setupBackdrop.hidden = false;
    $('.cleo-setup-next').focus();
  }
  function syncRosterSelection() {
    for (const card of root.querySelectorAll('.cleo-agent-choice')) {
      const selected = card.dataset.agentName === setupAgent.value;
      card.classList.toggle('is-selected', selected);
      card.setAttribute('aria-pressed', String(selected));
    }
  }
  function closeSetup() { setupBackdrop.hidden = true; $('.codex-widget-setup-open').focus(); }
  function renderSetupPage() {
    for (const page of root.querySelectorAll('.cleo-setup-page')) page.hidden = Number(page.dataset.page) !== setupPage;
    for (const dot of root.querySelectorAll('.cleo-setup-progress span')) dot.classList.toggle('is-active', Number([...root.querySelectorAll('.cleo-setup-progress span')].indexOf(dot)) <= setupPage);
    $('.cleo-setup-back').disabled = setupPage === 0;
    $('.cleo-setup-next').textContent = setupPage === 2 ? 'Save setup' : 'Continue';
    $('.cleo-setup-step').textContent = `${setupPage + 1} of 3`;
  }
  function saveSetup() {
    profile = {
      workflows: [...root.querySelectorAll('[data-group="workflows"] [data-value].is-selected')].map(button => button.dataset.value),
      markets: [...root.querySelectorAll('[data-group="markets"] [data-value].is-selected')].map(button => button.dataset.value),
      defaultAgent: setupAgent.value,
    };
    try { localStorage.setItem(profileKey, JSON.stringify(profile)); } catch {}
    syncProfileToControls();
    closeSetup();
    setStatus(`Setup saved · ${profile.markets.length ? profile.markets.join(', ') : 'choose markets any time'} · research and paper only`);
  }

  function setBusy(value) {
    busy = value;
    sendButton.disabled = value;
    stopButton.hidden = !value;
    selector.disabled = value;
    $('.codex-widget-new').disabled = value;
    modeSelect.disabled = value;
    skillSelect.disabled = value;
    agentSelect.disabled = value;
  }
  function bubble(type, content, key = '', metadata = null, existingBody = null, autoApplyMarkup = false) {
    const element = document.createElement('article');
    element.className = `codex-widget-message is-${type}`;
    if (type === 'agent' && !activeChartRead && isChartWorkflowNote(content)) element.classList.add('is-chart-workflow-note');
    const label = document.createElement('strong');
    label.textContent = type === 'user' ? 'You' : type === 'activity' ? 'Work update' : assistantName();
    const body = existingBody || document.createElement(type === 'agent' ? 'div' : 'p');
    if (type === 'agent') body.className='codex-widget-message-body codex-widget-markdown';
    body.textContent = content;
    element.append(label, body);
    if (metadata) {
      if (typeof metadata.imagePreview === 'string' && /^data:image\/(?:png|jpeg|webp);base64,/i.test(metadata.imagePreview)
          && metadata.imagePreview.length <= 11_000_000) {
        const preview = document.createElement('img');
        preview.className = 'codex-widget-image-preview';
        preview.src = metadata.imagePreview;
        preview.alt = 'Chart image shared with Cleo';
        element.append(preview);
      }
      const note = document.createElement('small');
      note.className = 'codex-widget-receipt';
      note.textContent = [metadata.mode, metadata.skill && `$${metadata.skill}`,
        metadata.agentRequested && `requested agent: ${metadata.agentRequested}`,
        metadata.chart && (() => { const current=primaryChart(metadata.chart); return [current?.sourceLabel || current?.provider || 'chart',
          current?.symbol || current?.market || 'symbol unknown', current?.timeframe || 'timeframe unknown',
          current?.cutoff ? new Date(current.cutoff).toISOString() : 'cutoff unknown',
          current?.contextBarCount != null ? `${current.contextBarCount} visible bars shared · ${current.barCount} loaded` : current?.barCount != null && `${current.barCount} loaded bars`].filter(Boolean).join(' · '); })(),
        metadata.imageAttached && 'screenshot attached'].filter(Boolean).join(' · ');
      element.append(note);
    }
    stream.querySelector('.codex-widget-empty')?.remove();
    if (type !== 'activity') stream.querySelector('.codex-widget-message.is-activity')?.remove();
    if (type === 'agent' && content) renderAgentAnswer(body, content, autoApplyMarkup);
    stream.append(element);
    stream.scrollTop = stream.scrollHeight;
    if (key) messages.set(key, body);
    return body;
  }
  function setStatus(value, error = false) {
    activityText.textContent = value;
    activity.classList.toggle('is-error', error);
  }
  function inlineMarkdown(text, parent) {
    const pattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
    let cursor = 0;
    for (const match of text.matchAll(pattern)) {
      if (match.index > cursor) parent.append(document.createTextNode(text.slice(cursor, match.index)));
      if (match[1]) {
        try {
          const url = new URL(match[2]);
          if (url.protocol === 'http:' || url.protocol === 'https:') {
            const link = document.createElement('a');
            link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
            link.textContent = match[1]; parent.append(link);
          } else parent.append(document.createTextNode(match[0]));
        } catch { parent.append(document.createTextNode(match[0])); }
      } else if (match[3].startsWith('**')) {
        const strong = document.createElement('strong'); strong.textContent = match[3].slice(2,-2); parent.append(strong);
      } else if (match[3].startsWith('`')) {
        const code = document.createElement('code'); code.textContent = match[3].slice(1,-1); parent.append(code);
      } else {
        const emphasis = document.createElement('em'); emphasis.textContent = match[3].slice(1,-1); parent.append(emphasis);
      }
      cursor = match.index + match[0].length;
    }
    if (cursor < text.length) parent.append(document.createTextNode(text.slice(cursor)));
  }
  function renderMarkdown(body, markdown) {
    body.replaceChildren();
    let list = null;
    let paragraph = [];
    let code = null;
    const flushParagraph = () => {
      if (!paragraph.length) return;
      const p = document.createElement('p'); inlineMarkdown(paragraph.join(' '), p); body.append(p); paragraph = [];
    };
    const flushList = () => { list = null; };
    for (const line of String(markdown || '').split('\n')) {
      if (line.trim().startsWith('```')) {
        flushParagraph(); flushList();
        if (code) { body.append(code); code = null; }
        else { code = document.createElement('pre'); code.className = 'codex-widget-code'; }
        continue;
      }
      if (code) { code.textContent += `${code.textContent ? '\n' : ''}${line}`; continue; }
      if (!line.trim()) { flushParagraph(); flushList(); continue; }
      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading) { flushParagraph(); flushList(); const h = document.createElement(`h${heading[1].length + 1}`); inlineMarkdown(heading[2], h); body.append(h); continue; }
      const bullet = line.match(/^\s*[-*]\s+(.+)$/);
      const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
      if (bullet || ordered) {
        flushParagraph();
        const kind = bullet ? 'ul' : 'ol';
        if (!list || list.tagName.toLowerCase() !== kind) { flushList(); list = document.createElement(kind); body.append(list); }
        const li = document.createElement('li'); inlineMarkdown((bullet || ordered)[1], li); list.append(li); continue;
      }
      const quote = line.match(/^>\s?(.*)$/);
      if (quote) { flushParagraph(); flushList(); const blockquote = document.createElement('blockquote'); inlineMarkdown(quote[1], blockquote); body.append(blockquote); continue; }
      flushList(); paragraph.push(line.trim());
    }
    if (code) body.append(code);
    flushParagraph();
  }
  function parseChartMarkup(content) {
    const match = String(content || '').match(/```chart-markup\s*\n([\s\S]*?)```/i);
    if (!match) return {match:null,markup:null};
    try {
      const parsed = JSON.parse(match[1]);
      if ((parsed?.schema === 'cleo.chart-markup.v1' && Array.isArray(parsed.marks))
          || (parsed?.schema === 'cleo.elliott-markup.v1' && Array.isArray(parsed.primary?.pivots))) return {match,markup:parsed};
    } catch {}
    return {match,markup:null};
  }
  function parseMarketReadPayload(content) {
    const match = String(content || '').match(/<!--CLEO_MARKET_READ_START-->\s*([\s\S]*?)\s*<!--CLEO_MARKET_READ_END-->/i);
    if (!match) return {text:String(content || ''),payload:null};
    try {
      const payload = JSON.parse(match[1]);
      if (payload?.schema === 'cleo.market-read.v1')
        return {text:String(content || '').replace(match[0], '').trim(),payload};
    } catch {}
    return {text:String(content || ''),payload:null};
  }
  function renderMarketRead(body, payload, fallbackText = '') {
    const sections = [
      ['sentiment_bias', 'Market Sentiment & Market Bias'],
      ['liquidity', 'Reading the Liquidity Levels'],
      ['elliott_fib', 'Elliott Wave, Trend Change & Fibonacci'],
      ['volume_divergence', 'Relative Volume & Divergence'],
    ];
    body.replaceChildren();
    if (!payload) {
      renderMarkdown(body, fallbackText || 'Cleo returned no written market read.');
      return;
    }
    for (const [key, heading] of sections) {
      const section = payload.sections?.[key];
      if (!section) continue;
      const article = document.createElement('section');
      article.className = 'codex-widget-market-read-section';
      const title = document.createElement('h3');
      title.textContent = heading;
      article.append(title);
      if (section.summary) {
        const summary = document.createElement('div');
        renderMarkdown(summary, section.summary);
        article.append(summary);
      }
      if (section.recommendation) {
        const recommendation = document.createElement('p');
        recommendation.className = 'codex-widget-market-read-recommendation';
        recommendation.textContent = `Recommendation: ${section.recommendation}`;
        article.append(recommendation);
      }
      body.append(article);
    }
    if (payload.finalRecommendation) {
      const final = document.createElement('section');
      final.className = 'codex-widget-market-read-final';
      const title = document.createElement('h3');
      title.textContent = 'Final Recommendation';
      const recommendation = document.createElement('p');
      recommendation.textContent = payload.finalRecommendation;
      final.append(title, recommendation);
      body.append(final);
    }
    if (payload.sections && !activeReadMarketMarksTried) {
      const marks = Object.values(payload.sections).flatMap(section => Array.isArray(section?.marks) ? section.marks : []);
      activeReadMarketMarksTried = true;
      let message = 'No source-validated active-chart marks were returned.';
      if (marks.length && typeof applyMarketReadMarkup === 'function') {
        try { message = applyMarketReadMarkup(payload, activeReadMarketContext)?.message || `${marks.length} chart marks added.`; }
        catch (error) { message = `Chart marks were not drawn · ${error.message}`; }
      }
      const status = document.createElement('section');
      status.className = 'codex-widget-market-read-marks';
      const title = document.createElement('h3');
      title.textContent = 'Chart marks';
      const detail = document.createElement('p');
      detail.textContent = message;
      status.append(title, detail);
      body.append(status);
    }
    if (!body.childElementCount) renderMarkdown(body, fallbackText || 'Cleo returned no written market read.');
  }
  function chartMarkCount(markup) {
    return markup?.schema === 'cleo.elliott-markup.v1'
      ? (markup.primary?.pivots?.length || 0) + (markup.alternate?.pivots?.length || 0) + (markup.projections?.length || 0) + (markup.invalidations?.length || 0)
      : (markup?.marks?.length || 0);
  }
  function applyStreamingMarkup(body, content) {
    if (!activeChartRead || (!applyChartMarkup && !applyElliottMarkup) || appliedMarkupResults.has(body)) return;
    const {markup} = parseChartMarkup(content);
    if (!markup) return;
    try {
      const result = markup.schema === 'cleo.elliott-markup.v1' ? applyElliottMarkup?.(markup) : applyChartMarkup?.(markup);
      if (!result) throw new Error('This chart cannot apply the returned markup format.');
      appliedMarkupResults.set(body,{result});
      setStatus(`${assistantName()} mapped ${chartMarkCount(markup)} sourced chart marks`);
    } catch (error) {
      appliedMarkupResults.set(body,{error});
      setStatus(`Chart marks unavailable · ${error.message}`,true);
    }
  }
  function renderAgentAnswer(body, content, autoApplyMarkup = false) {
    const marketRead = activeReadMarket ? parseMarketReadPayload(content) : null;
    const {match,markup} = parseChartMarkup(content);
    const visibleText = marketRead?.text ?? (match ? String(content).replace(match[0], '').trim() : String(content || ''));
    const compactText = visibleText.replace(/^\s*#{1,3}\s*/gm, '').replace(/\*\*/g, '').trim();
    const shortRead = markup?.readout || {};
    const markCount = chartMarkCount(markup);
    if (activeReadMarket) {
      renderMarketRead(body, marketRead?.payload, visibleText);
    } else if (activeChartRead || (surface === 'quant-lab' && markup)) {
      body.replaceChildren();
      const readCard = document.createElement('section');
      readCard.className = 'codex-widget-chart-read';
      const state = document.createElement('strong');
      state.className = 'codex-widget-chart-decision';
      state.textContent = String(shortRead.decision || 'CHART READ').toUpperCase().slice(0, 24);
      const processOnly = !markup && isChartWorkflowNote(compactText);
      const headline = document.createElement('h3');
      headline.textContent = processOnly ? `${assistantName()} hasn’t completed the read yet.`
        : String(shortRead.headline || compactText.split(/(?<=[.!?])\s+/)[0] || `${assistantName()} completed a chart read.`).slice(0, 110);
      const takeaway = document.createElement('p');
      takeaway.textContent = processOnly ? 'The chart was shared, but this reply contains no market findings.'
        : String(shortRead.takeaway || compactText.split(/(?<=[.!?])\s+/).slice(1, 3).join(' ') || '').slice(0, 210);
      readCard.append(state, headline, takeaway);
      for (const [label, value] of [['Against', shortRead.countercase], ['Watch', shortRead.next]]) {
        if (!value) continue;
        const row = document.createElement('p');
        row.className = 'codex-widget-chart-read-row';
        const tag = document.createElement('b'); tag.textContent = `${label} · `;
        row.append(tag, document.createTextNode(String(value).slice(0, 140)));
        readCard.append(row);
      }
      const markStatus = document.createElement('small');
      markStatus.className = 'codex-widget-chart-mark-status';
      if (markup && autoApplyMarkup && (applyChartMarkup || applyElliottMarkup)) {
        const prior = appliedMarkupResults.get(body);
        if (prior?.result) markStatus.textContent = prior.result.message || `Cleo marked ${markCount} chart locations.`;
        else if (prior?.error) markStatus.textContent = `Chart marks unavailable · ${prior.error.message}`;
        else {
          try {
            const result = markup.schema === 'cleo.elliott-markup.v1' ? applyElliottMarkup?.(markup) : applyChartMarkup?.(markup);
            if (!result) throw new Error('This chart cannot apply the returned markup format.');
            appliedMarkupResults.set(body,{result});
            markStatus.textContent = result?.message || `Cleo marked ${markCount} chart locations.`;
          } catch (error) { appliedMarkupResults.set(body,{error}); markStatus.textContent = `Chart marks unavailable · ${error.message}`; }
        }
      } else if (markup) markStatus.textContent = `${markCount} chart locations are available for this saved read.`;
      else if (activeChartRead) markStatus.textContent = processOnly
        ? 'No chart findings or validated marks were returned. The shared chart context is shown with your message.'
        : 'No source-validated chart marks were returned for this read.';
      if (markStatus.textContent) readCard.append(markStatus);
      const details = document.createElement('details');
      details.className = 'codex-widget-chart-read-details';
      const summary = document.createElement('summary'); summary.textContent = 'Full read & evidence';
      const fullText = document.createElement('div'); fullText.className = 'codex-widget-markdown';
      renderMarkdown(fullText, visibleText || 'No additional written analysis was returned.');
      details.append(summary, fullText);
      body.append(readCard, details);
    } else renderMarkdown(body, visibleText);
    body.parentElement?.querySelector('.codex-widget-markup-action')?.remove();
    if (!markup || (!applyChartMarkup && !applyElliottMarkup)) return;
    if (autoApplyMarkup && surface === 'quant-lab') return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'codex-widget-markup-action';
    button.textContent = `Add ${markCount} chart mark${markCount === 1 ? '' : 's'}`;
    button.addEventListener('click', () => {
      button.disabled = true;
      try {
        const result = markup.schema === 'cleo.elliott-markup.v1' ? applyElliottMarkup?.(markup) : applyChartMarkup?.(markup);
        if (!result) throw new Error('This chart cannot apply the returned markup format.');
        button.textContent = result?.message || 'Marks added · select them on the chart to edit or erase';
      } catch (error) {
        button.disabled = false;
        button.textContent = `Could not apply marks · ${error.message}`;
      }
    });
    body.parentElement?.append(button);
  }
  function showWelcome() {
    const card = document.createElement('section'); card.className = 'codex-widget-welcome-card';
    const spark = document.createElement('span'); spark.className = 'codex-widget-welcome-spark'; spark.setAttribute('aria-hidden','true'); spark.textContent = '✦';
    const title = document.createElement('h2'); title.textContent = 'What are we looking at?';
    const intro = document.createElement('p'); intro.textContent = 'I can read the chart with you, shape an indicator idea, or map out a paper strategy. I’ll show the work stages as they happen and call out what I could actually verify.';
    const starters = document.createElement('div'); starters.className = 'codex-widget-starters';
    for (const [label, prompt] of [
      ['Read this chart','Read the active chart. Tell me what stands out, what argues against the setup, and what would change your view.'],
      ['Build an indicator','Help me turn this indicator idea into one clear purpose, exact rules, and a build plan.'],
      ['Study a strategy','Help me formalize this strategy as a paper study, including entries, exits, costs, and what would disprove it.'],
      ['Check market context','Review the current market context and sentiment using available sourced data. Tell me what was actually checked.'],
    ]) { const button = document.createElement('button'); button.type='button'; button.dataset.starter=prompt; button.textContent=label; starters.append(button); }
    if (surface === 'quant-lab') { const button=document.createElement('button'); button.type='button'; button.className='codex-widget-read-market'; button.dataset.action='read-market'; button.textContent='✦ Read the Market · 10 chart intervals'; starters.append(button); }
    card.append(spark,title,intro,starters); stream.replaceChildren(card);
  }
  function beginWorkCard(message, chart, imageAttached) {
    workSteps = new Map();
    const card = document.createElement('article'); card.className = 'codex-widget-work-card is-running';
    const head = document.createElement('div'); head.className = 'codex-widget-work-head';
    const mark = document.createElement('span'); mark.className='codex-widget-work-mark'; mark.textContent='✦';
    const title = document.createElement('strong'); title.textContent=`${assistantName()} is on it`;
    const live = document.createElement('span'); live.className='codex-widget-live-label'; live.textContent='LIVE';
    head.append(mark,title,live);
    const summary = document.createElement('p'); summary.className='codex-widget-work-summary'; summary.textContent='Request received · waiting for the workspace to start.';
    const steps = document.createElement('ol'); steps.className='codex-widget-work-steps';
    const source = document.createElement('small'); source.className='codex-widget-work-source';
    const current=primaryChart(chart);
    source.textContent=chart ? `${chart.chartCount||1} chart${chart.chartCount===1?'':'s'} shared · ${[current?.sourceLabel||current?.provider,current?.symbol||current?.market,current?.timeframe,current?.cutoff&&new Date(current.cutoff).toISOString(),current?.contextBarCount!=null?`${current.contextBarCount} visible bars / ${current.barCount} loaded`:current?.barCount!=null&&`${current.barCount} bars`].filter(Boolean).join(' · ')}${imageAttached?' · chart image attached':''}` : `No chart context shared${imageAttached?' · screenshot attached':''}`;
    card.append(head,summary,steps,source); stream.append(card); stream.scrollTop=stream.scrollHeight;
    currentWorkCard={card,summary,steps,title,live};
    addWorkStep('Request sent to the workspace','request','done');
    setStatus('Waiting for Cleo to start · research and paper only');
    return currentWorkCard;
  }
  function addWorkStep(label, key, state='active') {
    if (!currentWorkCard) return;
    const stepKey = String(key || `${label}-${workSteps.size}`);
    let item = workSteps.get(stepKey);
    if (!item) {
      item=document.createElement('li'); item.className='codex-widget-work-step';
      const dot=document.createElement('i'); dot.setAttribute('aria-hidden','true');
      const text=document.createElement('span'); text.textContent=label; item.append(dot,text);
      currentWorkCard.steps.append(item); workSteps.set(stepKey,item);
    }
    item.classList.toggle('is-active',state==='active');
    item.classList.toggle('is-done',state==='done');
    item.classList.toggle('is-failed',state==='failed');
    if (item.children[1]) item.children[1].textContent=label;
    if (state==='active') currentWorkCard.summary.textContent=label;
    stream.scrollTop=stream.scrollHeight;
  }
  function finishWork(status, detail = '') {
    if (!currentWorkCard) return;
    const completed=status==='completed';
    currentWorkCard.card.classList.remove('is-running');
    currentWorkCard.card.classList.add(completed?'is-complete':'is-failed');
    currentWorkCard.live.textContent=completed?'DONE':'PAUSED';
    currentWorkCard.title.textContent=completed?'Review ready':'Needs attention';
    currentWorkCard.summary.textContent=completed?`The response is ready. Check the source and limits noted in ${assistantName()}’s reply.`:detail || 'The turn stopped before the review was complete.';
    for (const item of workSteps.values()) if (item.classList.contains('is-active')) item.classList.replace('is-active', completed?'is-done':'is-failed');
    currentWorkCard=null;
  }
  function readableToolName(tool, server='') {
    const known={read_chart:'Reading the selected chart',dashboard_overview:'Checking Count Desk context',read_trading_journal:'Checking available journal records',read_liquidity_lab:'Checking Quant Lab study records',read_market_research:'Checking approved market context'};
    if (known[tool]) return known[tool];
    if (/^cua_repl$/i.test(server)) return 'Checking the visible workspace context';
    if (/web|search/i.test(`${server} ${tool}`)) return 'Checking current public sources';
    const human=String(tool||'workspace source').replaceAll('_',' ').replace(/\b\w/g,letter=>letter.toUpperCase());
    return server && !/codex|mcp|workspace/i.test(server) ? `Checking ${server} · ${human}` : `Checking ${human}`;
  }
  function refreshList(threads) {
    const selected = threadId;
    selector.replaceChildren();
    const blank = new Option('Choose a chat', '');
    selector.append(blank);
    for (const thread of threads) selector.append(new Option(thread.title || 'Codex chat', thread.id));
    selector.value = selected && threads.some(thread => thread.id === selected) ? selected : '';
  }
  function refreshCatalog(catalog) {
    const priorSkill = skillSelect.value;
    const priorAgent = agentSelect.value;
    skillSelect.replaceChildren(new Option('Auto · choose as needed', ''));
    agentSelect.replaceChildren(new Option('Codex · no named agent', ''));
    setupAgent.replaceChildren(new Option('Cleo handles requests by default', ''));
    const roster = $('.cleo-setup-roster');
    roster.replaceChildren();
    const skills = (catalog.skills || []).filter(item => item.enabled !== false && item.scope === 'repo');
    skills.sort((a, b) => {
      const rank = name => ['cleo', 'quant-lab'].includes(name) ? ['cleo', 'quant-lab'].indexOf(name) : 2;
      return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name);
    });
    for (const item of skills) {
      const option = new Option(`$${item.name}`, item.name);
      option.title = item.description || '';
      skillSelect.append(option);
    }
    for (const item of catalog.agents || []) {
      const label = item.label || item.name.replaceAll('_', ' ');
      const option = new Option(label, item.name);
      option.title = item.description || '';
      agentSelect.append(option);
      setupAgent.append(new Option(label, item.name));
      const choice = document.createElement('button');
      choice.type = 'button';
      choice.className = 'cleo-agent-choice';
      choice.dataset.agentName = item.name;
      choice.setAttribute('aria-pressed', 'false');
      const name = document.createElement('b');
      name.textContent = label;
      const description = document.createElement('small');
      description.textContent = item.description || 'Project-scoped specialist';
      const authority = document.createElement('small');
      authority.className = 'cleo-agent-authority';
      authority.textContent = item.sandbox === 'workspace-write' ? 'Workspace build access in Build mode' : 'Read-only research';
      choice.append(name, description, authority);
      roster.append(choice);
    }
    skillSelect.value = skills.some(item => item.name === priorSkill) ? priorSkill
      : skills.some(item => item.name === 'cleo') ? 'cleo'
        : surface === 'quant-lab' && skills.some(item => item.name === 'quant-lab') ? 'quant-lab' : '';
    agentSelect.value = (catalog.agents || []).some(item => item.name === priorAgent) ? priorAgent : '';
    setupAgent.value = (catalog.agents || []).some(item => item.name === profile.defaultAgent) ? profile.defaultAgent : '';
    profile.defaultAgent = setupAgent.value;
    syncRosterSelection();
    syncProfileToControls();
    updatePersona();
  }
  function renderApproval(approval) {
    if (!approval?.id || approvalCards.has(approval.id)) return;
    const card = document.createElement('article');
    card.className = 'codex-widget-approval';
    const title = document.createElement('strong');
    title.textContent = approval.kind === 'command' ? 'Codex requests command approval' : 'Codex requests file approval';
    const detail = document.createElement('pre');
    detail.textContent = [approval.reason, approval.command, approval.cwd && `Working directory: ${approval.cwd}`,
      approval.grantRoot && `Requested root: ${approval.grantRoot}`,
      approval.network && `Network: ${JSON.stringify(approval.network)}`].filter(Boolean).join('\n') || 'Review this Codex action.';
    const actions = document.createElement('div');
    for (const decision of ['accept', 'decline']) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = decision === 'accept' ? 'Approve once' : 'Decline';
      button.addEventListener('click', async () => {
        for (const child of actions.querySelectorAll('button')) child.disabled = true;
        try {
          const result = await request(`/threads/${encodeURIComponent(approval.threadId)}/approvals`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body:JSON.stringify({turnId:approval.turnId, approvalId:approval.id, decision}),
          });
          card.classList.add('is-resolved');
          actions.textContent = result.decision === 'accept' ? 'Approved once' : 'Declined';
          approvalCards.delete(approval.id);
        } catch (error) {
          actions.append(document.createTextNode(error.message));
          for (const child of actions.querySelectorAll('button')) child.disabled = false;
        }
      });
      actions.append(button);
    }
    card.append(title, detail, actions);
    stream.append(card);
    stream.scrollTop = stream.scrollHeight;
    approvalCards.set(approval.id, card);
  }
  function chartContext() {
    if (!$('.codex-widget-chart').checked) {
      contextLine.textContent = 'Chart sharing is off for the next turn.';
      return null;
    }
    const chart = contextProvider();
    const current=primaryChart(chart);
    contextLine.textContent = chart ? `${chart.chartCount||1} chart${chart.chartCount===1?'':'s'} · ${[current?.sourceLabel||current?.provider||'Chart source unknown',
      current?.symbol||current?.market||'symbol unknown',current?.timeframe||'timeframe unknown',
      current?.cutoff?new Date(current.cutoff).toISOString():'last bar unknown',current?.contextBarCount!=null?`${current.contextBarCount} visible bars shared`:current?.barCount!=null&&`${current.barCount} bars`].filter(Boolean).join(' · ')}` : 'No loaded chart context is available.';
    return chart;
  }
  function readImage(file) {
    return new Promise((resolve, reject) => {
      if (!file) return resolve('');
      if (file.size > 8 * 1024 * 1024 || !['image/png','image/jpeg','image/webp'].includes(file.type))
        return reject(new Error('Attach a PNG, JPEG, or WebP screenshot of 8 MB or less.'));
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Screenshot could not be read.'));
      reader.readAsDataURL(file);
    });
  }
  async function loadThread(id) {
    threadId = id;
    selector.value = id;
    sequence = 0;
    turnId = '';
    messages.clear();
    approvalCards.clear();
    currentWorkCard = null;
    workSteps = new Map();
    stream.replaceChildren();
    if (!id) {
      showWelcome();
      setStatus('Ready · research and paper only');
      return;
    }
    const state = await request(`/threads/${encodeURIComponent(id)}`);
    sequence = state.sequence || 0;
    for (const turn of state.turns || []) {
      for (const item of turn.items || []) {
        if (!item.text) continue;
        let content = item.text;
        if (item.type === 'user' && content.includes('\n\nUser: ')) content = content.split('\n\nUser: ').at(-1);
        bubble(item.type === 'user' ? 'user' : 'agent', content, '', item.metadata);
        if (item.type === 'user') requestedAgent = item.metadata?.agentRequested || '';
      }
      if (turn.status === 'inProgress') turnId = turn.id;
    }
    if (!stream.children.length) showWelcome();
    setBusy(Boolean(turnId));
    activeMode = state.activeMode || 'research';
    setStatus(turnId ? 'Codex is working…' : 'Ready · research and paper only');
    for (const approval of state.pendingApprovals || []) renderApproval(approval);
    if (state.lastCompletedTurn?.status === 'failed'
        && (state.lastCompletedTurn.error?.code !== 'unauthorized' || requiresSignIn)) {
      showTurnFailure(state.lastCompletedTurn);
    }
  }
  function showTurnFailure(turn) {
    const code = turn.error?.code || '';
    const message = turn.error?.message || `Codex turn ${turn.status || 'failed'}.`;
    if (code === 'unauthorized') {
      requiresSignIn = true;
      auth.textContent = 'ChatGPT sign-in expired';
      auth.classList.remove('is-connected');
      textarea.disabled = true;
      sendButton.disabled = true;
      $('.codex-widget-new').disabled = true;
      setStatus(`${message} Run codex login on this Mac, then refresh Count Desk.`, true);
      return;
    }
    setStatus(message, true);
  }
  async function connect() {
    if (connecting || !root.isConnected) return;
    connecting = true;
    clearTimeout(reconnectTimer);
    try {
      const state = await request('/account');
      planType = state.planType || '';
      requiresSignIn = Boolean(state.authError);
      auth.textContent = state.authError ? 'ChatGPT sign-in expired' : state.authenticated
        ? `${state.verified ? 'ChatGPT connected' : 'ChatGPT sign-in found'}${planType ? ` · ${planType}` : ''}`
        : 'ChatGPT sign-in required';
      auth.classList.toggle('is-connected', state.authenticated && state.verified);
      refreshList(state.threads || []);
      textarea.disabled = !state.authenticated;
      sendButton.disabled = !state.authenticated;
      $('.codex-widget-new').disabled = !state.authenticated;
      if (!state.authenticated) {
        setStatus(state.authError ? `${state.authError} Run codex login on this Mac, then refresh Count Desk.`
          : 'Sign in with ChatGPT using Codex CLI on this Mac.', true);
        reconnectTimer = setTimeout(() => { void connect(); }, 5000);
        return;
      }
      try { refreshCatalog(await request('/catalog')); }
      catch (error) { setStatus(`Skill and agent list unavailable: ${error.message}`, true); }
      const activeId = state.threads?.find(thread => thread.id === threadId)?.id || state.threads?.[0]?.id;
      if (activeId) await loadThread(activeId);
      else await newThread();
      if (!state.verified) {
        auth.textContent = `Codex ready · ChatGPT sign-in found${planType ? ` · ${planType}` : ''}`;
        auth.classList.add('is-connected');
      }
    } catch (error) {
      auth.textContent = 'Codex unavailable';
      auth.classList.remove('is-connected');
      textarea.disabled = true;
      sendButton.disabled = true;
      $('.codex-widget-new').disabled = true;
      setStatus(error.message, true);
      if (root.isConnected) reconnectTimer = setTimeout(() => { void connect(); }, 5000);
    } finally {
      connecting = false;
    }
  }
  async function newThread() {
    const created = await request('/threads', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'});
    const state = await request('/account');
    refreshList([{id:created.threadId, title:'New Codex chat'}, ...(state.threads || []).filter(thread => thread.id !== created.threadId)]);
    await loadThread(created.threadId);
    textarea.focus();
  }
  function onEvent(event) {
    const {method, params = {}} = event;
    const item = params.item || {};
    if (method === 'turn/started') {
      turnId = params.turn?.id || turnId;
      setBusy(true);
      addWorkStep(`${assistantName()} is reviewing your request`,'turn-start','active');
      setStatus(`${assistantName()} is reviewing your request`);
    } else if (method === 'item/agentMessage/delta') {
      const key = params.itemId || `stream-${turnId}`;
      if (activeChartRead) {
        let body = messages.get(key);
        if (!body) {
          body = document.createElement('div');
          messages.set(key, body);
          addWorkStep('Reading the shared chart','chart-context','active');
        }
        body.textContent += params.delta || '';
        applyStreamingMarkup(body, body.textContent);
        const markupResult=appliedMarkupResults.get(body);
        if (markupResult?.result) addWorkStep('Chart marks drawn from loaded-bar evidence','chart-marks','done');
        else if (markupResult?.error) addWorkStep('Chart marks need attention','chart-marks','failed');
        else setStatus(`${assistantName()} is reading the shared chart`);
        return;
      }
      const body = messages.get(key) || bubble('agent', '', key);
      body.textContent += params.delta || '';
      applyStreamingMarkup(body, body.textContent);
      if (body.textContent.length && !workSteps.has('final-answer'))
        addWorkStep('Writing the response for you','final-answer','active');
      stream.scrollTop = stream.scrollHeight;
    } else if (method === 'item/completed' && item.type === 'agentMessage') {
      let body = messages.get(item.id);
      const content = item.text || body?.textContent || '';
      // Commentary often repeats the handoff; keep that update in the compact work-stage row, not as an answer.
      if (activeChartRead && item.phase === 'commentary') {
        body?.closest('.codex-widget-message')?.remove();
        messages.delete(item.id);
        addWorkStep('Chart context checked · reading market structure','chart-context','done');
        setStatus(`${assistantName()} is reading the shared chart`);
      } else if (activeChartRead && body && !body.isConnected) {
        chartReadFinalReturned = true;
        bubble('agent', content, item.id, null, body, true);
      } else {
        if (activeChartRead) chartReadFinalReturned = true;
        body ||= bubble('agent', '', item.id);
        body.textContent = content;
        renderAgentAnswer(body, content, activeChartRead);
      }
    } else if (method === 'item/started' && item.type === 'subAgentActivity') {
      const actualName = item.agentName || item.name;
      const label=actualName ? `${actualName.replaceAll('_',' ')} specialist started` : `Specialist started${requestedAgent ? ` · ${requestedAgent}` : ''}`;
      addWorkStep(label,item.id||`specialist-${workSteps.size}`,'active');
      setStatus(label);
    } else if (method === 'item/completed' && item.type === 'subAgentActivity') {
      const actualName = item.agentName || item.name || requestedAgent || 'Specialist';
      const label=`${actualName.replaceAll('_',' ')} returned findings · reviewing them`;
      addWorkStep(label,item.id||`specialist-${workSteps.size}`,'done');
      setStatus(label);
    } else if (method === 'item/started' && item.type === 'collabAgentToolCall') {
      if (item.tool === 'wait') setStatus('Waiting for the specialist to return');
      else {
        const label=`Starting specialist step${item.receiverThreadId?' · separate agent':''}`;
        addWorkStep(label,item.id||`specialist-call-${workSteps.size}`,'active'); setStatus(label);
      }
    } else if (method === 'item/completed' && item.type === 'collabAgentToolCall') {
      const done=item.status==='completed';
      const label=done?'Specialist step returned · reviewing result':'Specialist step did not complete';
      addWorkStep(label,item.id||`specialist-call-${workSteps.size}`,done?'done':'failed'); setStatus(label,!done);
    } else if (method === 'item/started' && item.type === 'mcpToolCall') {
      const label=readableToolName(item.tool,item.server);
      addWorkStep(label,item.id||`tool-${workSteps.size}`,'active'); setStatus(label);
    } else if (method === 'item/completed' && item.type === 'mcpToolCall') {
      const done=item.status!=='failed';
      const label=`${readableToolName(item.tool,item.server)} · ${done?'complete':'needs attention'}`;
      addWorkStep(label,item.id||`tool-${workSteps.size}`,done?'done':'failed'); setStatus(label,!done);
    } else if (method === 'item/started' && ['webSearch','webSearchCall'].includes(item.type)) {
      addWorkStep('Checking current public sources',item.id||`web-${workSteps.size}`,'active'); setStatus('Checking current public sources');
    } else if (method === 'item/completed' && ['webSearch','webSearchCall'].includes(item.type)) {
      const done=item.status!=='failed';
      addWorkStep(`Current public source search ${done?'complete':'needs attention'}`,item.id||`web-${workSteps.size}`,done?'done':'failed');
      setStatus(`Current public source search ${done?'complete':'needs attention'}`,!done);
    } else if (method === 'item/started' && item.type === 'commandExecution') {
      const label=activeMode==='build'?'Running a requested local command':'Using a workspace utility';
      addWorkStep(label,item.id||`command-${workSteps.size}`,'active'); setStatus(label);
    } else if (method === 'item/completed' && item.type === 'commandExecution') {
      const done=item.status==='completed';
      const label=`Workspace utility ${done?'finished':'needs attention'}`;
      addWorkStep(label,item.id||`command-${workSteps.size}`,done?'done':'failed'); setStatus(label,!done);
    } else if (method === 'item/started' && item.type === 'fileChange') {
      const label='Editing the requested workspace files'; addWorkStep(label,item.id||`edit-${workSteps.size}`,'active'); setStatus(label);
    } else if (method === 'item/completed' && item.type === 'fileChange') {
      const done=item.status!=='failed'; const label=`Workspace edit ${done?'complete':'needs attention'}`;
      addWorkStep(label,item.id||`edit-${workSteps.size}`,done?'done':'failed'); setStatus(label,!done);
    } else if (method === 'widget/approvalDeclined') {
      setStatus('A requested action was declined by the current permission mode.', true);
    } else if (method === 'widget/approvalRequested') {
      renderApproval(params.approval);
      setStatus('Codex needs your decision before continuing.');
    } else if (method === 'widget/approvalResolved') {
      const card = approvalCards.get(params.approvalId);
      if (card) {
        card.classList.add('is-resolved');
        card.querySelector('div').textContent = params.decision === 'accept' ? 'Approved once' : 'Declined';
        approvalCards.delete(params.approvalId);
      }
    } else if (method === 'turn/completed') {
      const status = params.turn?.status || 'completed';
      turnId = '';
      setBusy(false);
      if (status === 'completed') {
        if (activeChartRead && !chartReadFinalReturned)
          bubble('agent', `The chart context was shared, but ${assistantName()}’s turn ended before a market read or validated marks came back.`);
        auth.textContent = `ChatGPT connected${planType ? ` · ${planType}` : ''}`;
        auth.classList.add('is-connected');
        finishWork('completed');
        setStatus(activeMode === 'build' ? 'Build turn complete · inspect workspace diff and checks' : 'Review complete · research and paper only');
      } else if (status === 'failed') { finishWork('failed'); showTurnFailure(params.turn); }
      else { finishWork(status); setStatus(`Turn ${status} · review may be incomplete`, true); }
      activeChartRead = false;
      activeReadMarket = false;
      activeReadMarketContext = null;
      chartReadFinalReturned = false;
    }
  }
  async function poll() {
    if (polling || !threadId || !root.isConnected) return;
    polling = true;
    try {
      const id = threadId;
      const state = await request(`/threads/${encodeURIComponent(id)}/events?after=${sequence}`);
      if (id === threadId) {
        for (const event of state.events || []) onEvent(event);
        sequence = state.sequence || sequence;
      }
    } catch (error) { setStatus(error.message, true); }
    finally { polling = false; }
  }
  async function submitMessage(messageText = textarea.value) {
    const text = String(messageText || '').trim();
    if ((!text && !imageInput.files[0]) || busy || collectingReadMarket) return false;
    try {
      if (!threadId) await newThread();
      setBusy(true);
      setStatus('Sending to Codex…');
      const chart = chartContext();
      if (pendingReadMarket && chart) {
        chart.readMarket = pendingReadMarket;
        pendingReadMarket = null;
      }
      activeReadMarket = surface === 'quant-lab' && Boolean(chart?.readMarket);
      activeReadMarketContext = activeReadMarket ? primaryChart(chart) : null;
      activeReadMarketMarksTried = false;
      const uploadedImage = await readImage(imageInput.files[0]);
      let image = uploadedImage;
      if (!image && chart && typeof captureChartImage === 'function') {
        try { image = String(captureChartImage() || ''); } catch { image = ''; }
        if (image.length > 11_000_000) image = '';
      }
      const mode = modeSelect.value;
      const skill = skillSelect.value;
      const agent = agentSelect.value;
      activeMode = mode;
      requestedAgent = agent;
      updatePersona();
      const message = text || 'Analyze the attached screenshot as provisional chart evidence.';
      const isChartReadRequest = (skill === 'cleo' || agent === 'cleo' || agent === 'tradingagents')
        && /\b(read|analy[sz]e|review|inspect|look at|what stands out|what do you see)\b/i.test(message);
      const selectedChart = chart?.charts?.find(item => Number(item.chart) === Number(chart.activeChart));
      if (surface === 'quant-lab' && isChartReadRequest && $('.codex-widget-chart').checked
          && !selectedChart?.bars?.length && !uploadedImage) {
        setBusy(false);
        setStatus('Share chart is on, but no loaded chart data is available. Load the chart, then try again.', true);
        return;
      }
      activeChartRead = surface === 'quant-lab' && (skill === 'cleo' || agent === 'cleo' || agent === 'tradingagents') && Boolean(chart?.charts?.length)
        && isChartReadRequest;
      chartReadFinalReturned = false;
      bubble('user', message, '', {mode, skill, agentRequested:agent, chart, imageAttached:Boolean(image), imagePreview:image});
      beginWorkCard(message, chart, Boolean(image));
      const result = await request(`/threads/${encodeURIComponent(threadId)}/turns`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({text:message, chart, mode, skill, agent, image,
          profile:{workflows:profile.workflows, markets:profile.markets}}),
      });
      turnId = result.turnId;
      addWorkStep('Request accepted · waiting for activity updates','request','done');
      if (textarea.value.trim() === text) textarea.value = '';
      imageInput.value = '';
      $('.codex-widget-image-name').hidden = true;
      void poll();
      const state = await request('/account');
      refreshList(state.threads || []);
      return true;
    } catch (error) {
      setBusy(false);
      activeReadMarket = false;
      activeReadMarketContext = null;
      activeChartRead = false;
      addWorkStep('The request did not start','request','failed');
      finishWork('failed', error.message);
      setStatus(error.message, true);
      if (/\barchived\b/i.test(error.message)) void connect();
      return false;
    }
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    void submitMessage();
  });
  $('.codex-widget-chart').addEventListener('change', chartContext);
  imageInput.addEventListener('change', () => {
    const name = $('.codex-widget-image-name');
    name.textContent = imageInput.files[0]?.name || '';
    name.hidden = !imageInput.files[0];
  });
  agentSelect.addEventListener('change', () => {
    if (agentSelect.value === 'cleo' && [...skillSelect.options].some(option => option.value === 'cleo'))
      skillSelect.value = 'cleo';
    else if (agentSelect.value === 'tradingagents' && skillSelect.value === 'cleo')
      skillSelect.value = '';
    updatePersona();
  });
  skillSelect.addEventListener('change', updatePersona);
  $('.codex-widget-setup-open').addEventListener('click', openSetup);
  avatarButton.addEventListener('click', openAvatarPicker);
  $('.cleo-avatar-close').addEventListener('click', closeAvatarPicker);
  $('.cleo-avatar-cancel').addEventListener('click', closeAvatarPicker);
  $('.cleo-avatar-save').addEventListener('click', saveAvatar);
  avatarBackdrop.addEventListener('click', event => { if (event.target === avatarBackdrop) closeAvatarPicker(); });
  $('.cleo-setup-close').addEventListener('click', closeSetup);
  setupBackdrop.addEventListener('click', event => { if (event.target === setupBackdrop) closeSetup(); });
  root.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!avatarBackdrop.hidden) closeAvatarPicker();
    else if (!setupBackdrop.hidden) closeSetup();
  });
  $('.cleo-setup-back').addEventListener('click', () => { setupPage = Math.max(0, setupPage - 1); renderSetupPage(); });
  $('.cleo-setup-next').addEventListener('click', () => {
    if (setupPage < 2) { setupPage += 1; renderSetupPage(); }
    else saveSetup();
  });
  $('.cleo-setup-roster').addEventListener('click', event => {
    const choice = event.target.closest('.cleo-agent-choice');
    if (!choice) return;
    setupAgent.value = choice.dataset.agentName;
    syncRosterSelection();
  });
  setupAgent.addEventListener('change', syncRosterSelection);
  for (const group of Object.keys(choices)) root.querySelector(`[data-group="${group}"]`).addEventListener('click', event => {
    const button = event.target.closest('[data-value]');
    if (button) button.classList.toggle('is-selected');
  });
  stream.addEventListener('click', event => {
    if (event.target.closest('[data-action="read-market"]')) {
      if (!busy) widgetApi.analyzeReadMarket();
      return;
    }
    const starter=event.target.closest('[data-starter]');
    if (!starter || busy) return;
    void submitMessage(starter.dataset.starter || '');
  });
  $('.codex-widget-new').addEventListener('click', () => { void newThread().catch(error => setStatus(error.message, true)); });
  selector.addEventListener('change', () => { void loadThread(selector.value).catch(error => setStatus(error.message, true)); });
  stopButton.addEventListener('click', async () => {
    if (!threadId || !turnId) return;
    try {
      await request(`/threads/${encodeURIComponent(threadId)}/interrupt`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({turnId}),
      });
      setStatus('Stopping Codex…');
    } catch (error) { setStatus(error.message, true); }
  });
  textarea.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault(); form.requestSubmit();
    }
  });
  function onVisible() {
    if (!document.hidden && !auth.classList.contains('is-connected')) void connect();
  }
  const pollTimer = setInterval(() => {
    if (!root.isConnected) {
      clearInterval(pollTimer);
      clearTimeout(reconnectTimer);
      document.removeEventListener('visibilitychange', onVisible);
      return;
    }
    void poll();
  }, 900);
  document.addEventListener('visibilitychange', onVisible);
  queueMicrotask(() => { void connect(); });
  const widgetApi = {root, analyzeReadMarket() {
    if (busy || typeof collectReadMarket !== 'function') return false;
    collectingReadMarket = true;
    const button = root.querySelector('.codex-widget-read-market');
    const progress = contextLine;
    if (button) button.disabled = true;
    if (progress) { progress.hidden = false; progress.textContent = 'Collecting stored chart snapshots…'; }
    void collectReadMarket((completed, total) => {
      if (progress) progress.textContent = `Collecting stored chart snapshots · ${completed}/${total}`;
    }).then(async readMarket => {
      if (!readMarket || !Array.isArray(readMarket.frames)) throw new Error('No multi-timeframe snapshot was returned.');
      pendingReadMarket = readMarket;
      $('.codex-widget-chart').checked = true;
      chartContext();
      skillSelect.value = [...skillSelect.options].some(option => option.value === 'cleo') ? 'cleo' : skillSelect.value;
      agentSelect.value = [...agentSelect.options].some(option => option.value === 'cleo') ? 'cleo' : '';
      updatePersona();
      const prompt = 'Read the market across the supplied stored snapshots. Give me the four sections: Market Sentiment & Market Bias; Reading the Liquidity Levels; Elliott Wave, Trend Change & Fibonacci; Relative Volume & Divergence. Daily is context; trade levels come from 15m, 30m, 1h, and 4h; 1m is confirmation only. Keep liquidity and inducement as chart-based hypotheses, disclose provisional RVOL and divergence measures, state unavailable intervals, and finish with a short Final Recommendation. Return any active-chart marks only when their source and exact timestamps are supported by the supplied bars.';
      if (progress) progress.textContent = `${readMarket.frames.filter(frame => frame.status === 'available').length}/10 snapshots ready · starting Cleo review`;
      collectingReadMarket = false;
      const sent = await submitMessage(prompt);
      if (!sent && progress) progress.textContent = 'Read could not start · check the chat connection and try again.';
      if (button) button.disabled = false;
    }).catch(error => {
      collectingReadMarket = false;
      activeReadMarket = false;
      activeReadMarketContext = null;
      if (progress) progress.textContent = `Read could not start · ${error.message}`;
      if (button) button.disabled = false;
    });
    return true;
  }, analyzeElliott() {
    if (busy) return false;
    $('.codex-widget-chart').checked = true;
    chartContext();
    skillSelect.value = [...skillSelect.options].some(option => option.value === 'cleo') ? 'cleo' : skillSelect.value;
    agentSelect.value = [...agentSelect.options].some(option => option.value === 'cleo') ? 'cleo' : '';
    updatePersona();
    textarea.value = 'Analyze the active chart with Elliott Wave and place sourced wave labels and conditional paths directly on that chart.';
    form.requestSubmit();
    return true;
  }};
  return widgetApi;
}
