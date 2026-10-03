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

export function createCodexWidget(host, {contextProvider = chartSnapshot, surface = 'vela'} = {}) {
  const root = document.createElement('section');
  root.className = 'codex-widget';
  root.dataset.surface = surface;
  root.innerHTML = `<header class="codex-widget-welcome"><span class="codex-widget-avatar" aria-hidden="true">✦</span><div><small>YOUR TRADING PARTNER</small><strong class="codex-widget-persona">Cleo</strong><span>Charts · quant research · paper strategies</span></div><i class="codex-widget-ready-dot" aria-hidden="true"></i></header>
    <div class="codex-widget-toolbar"><span class="codex-widget-auth" role="status">Checking sign-in…</span><label class="codex-widget-thread-label">Conversation<select class="codex-widget-threads" aria-label="Recent conversations"></select></label><button type="button" class="codex-widget-new">＋ New chat</button></div>
    <details class="codex-widget-options"><summary>Work settings <span>Research is read-only · Build can edit this workspace</span></summary><div class="codex-widget-controls"><label>Mode<select class="codex-widget-mode" aria-label="Codex permission mode"><option value="research">Research · read only</option><option value="build">Build · edit and test</option></select></label><label>Skill<select class="codex-widget-skill" aria-label="Use a Codex skill"><option value="">Auto · choose as needed</option></select></label><label>Specialist<select class="codex-widget-agent" aria-label="Ask a named Codex agent"><option value="">No separate specialist</option></select></label></div></details>
    <div class="codex-widget-context" role="status">Chart context is shared with your next message. Source and cutoff are shown here.</div>
    <div class="codex-widget-stream" aria-live="polite"><section class="codex-widget-welcome-card"><span class="codex-widget-welcome-spark" aria-hidden="true">✦</span><h2>What are we looking at?</h2><p>I can read the chart with you, shape an indicator idea, or map out a paper strategy. I’ll show the work stages as they happen and call out what I could actually verify.</p><div class="codex-widget-starters"><button type="button" data-starter="Read the active chart. Tell me what stands out, what argues against the setup, and what would change your view.">Read this chart</button><button type="button" data-starter="Help me turn this indicator idea into one clear purpose, exact rules, and a build plan.">Build an indicator</button><button type="button" data-starter="Help me formalize this strategy as a paper study, including entries, exits, costs, and what would disprove it.">Study a strategy</button><button type="button" data-starter="Review the current market context and sentiment using available sourced data. Tell me what was actually checked.">Check market context</button></div></section></div>
    <details class="codex-widget-help"><summary>How Cleo’s work stages are shown</summary><p>The live work card reports visible events such as chart/data reads, source searches, specialist starts, and local build steps. It gives concise activity summaries, not private chain-of-thought. A stage appears only when the connected runtime reports that work.</p><p>Research is read-only. Build can edit this repository and run local checks. Codex pauses for command or file approvals. Indicator measurements, strategy outcomes, and paper fills are reported only when their actual tools return evidence.</p></details>
    <div class="codex-widget-activity" role="status" aria-live="polite"><span class="codex-widget-activity-dot" aria-hidden="true"></span><span class="codex-widget-activity-text">Ready when you are · research and paper only</span></div>
    <form class="codex-widget-composer"><textarea rows="3" maxlength="12000" aria-label="Message Cleo" placeholder="Tell me what you’re seeing or what you want to build…"></textarea><div class="codex-widget-compose-row"><label class="codex-widget-chart-toggle"><input type="checkbox" class="codex-widget-chart" checked> Share chart</label><label class="codex-widget-attach">＋ Screenshot<input class="codex-widget-image" type="file" accept="image/png,image/jpeg,image/webp" hidden></label><button type="button" class="codex-widget-stop" hidden>Stop</button><button type="submit" class="codex-widget-send">Send <span aria-hidden="true">↑</span></button></div><div class="codex-widget-image-name" hidden></div><small class="codex-widget-paper-note">Research and paper workflows · no live order routing</small></form>`;
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
  let threadId = '';
  let turnId = '';
  let sequence = 0;
  let busy = false;
  let polling = false;
  let connecting = false;
  let reconnectTimer = 0;
  let planType = '';
  let requiresSignIn = false;
  let requestedAgent = '';
  let activeMode = 'research';
  const messages = new Map();
  const approvalCards = new Map();
  let currentWorkCard = null;
  let workSteps = new Map();

  function assistantName() {
    if (skillSelect.value === 'cleo' || agentSelect.value === 'cleo') return 'Cleo';
    return surface === 'quant-lab' ? 'Quant Lab' : 'Codex';
  }
  function updatePersona() {
    persona.textContent = assistantName();
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
  function bubble(type, content, key = '', metadata = null) {
    const element = document.createElement('article');
    element.className = `codex-widget-message is-${type}`;
    const label = document.createElement('strong');
    label.textContent = type === 'user' ? 'You' : type === 'activity' ? 'Work update' : assistantName();
    const body = document.createElement(type === 'agent' ? 'div' : 'p');
    if (type === 'agent') body.className='codex-widget-message-body codex-widget-markdown';
    body.textContent = content;
    element.append(label, body);
    if (metadata) {
      const note = document.createElement('small');
      note.className = 'codex-widget-receipt';
      note.textContent = [metadata.mode, metadata.skill && `$${metadata.skill}`,
        metadata.agentRequested && `requested agent: ${metadata.agentRequested}`,
        metadata.chart && [metadata.chart.sourceLabel || metadata.chart.provider || 'chart',
          metadata.chart.symbol || metadata.chart.market || 'symbol unknown',
          metadata.chart.timeframe || 'timeframe unknown',
          metadata.chart.cutoff || 'cutoff unknown'].join(' · '),
        metadata.imageAttached && 'screenshot attached'].filter(Boolean).join(' · ');
      element.append(note);
    }
    stream.querySelector('.codex-widget-empty')?.remove();
    if (type !== 'activity') stream.querySelector('.codex-widget-message.is-activity')?.remove();
    if (type === 'agent' && content) renderMarkdown(body, content);
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
    source.textContent=chart ? `Chart shared · ${[chart.sourceLabel||chart.provider, chart.symbol||chart.market, chart.timeframe, chart.cutoff].filter(Boolean).join(' · ')}${imageAttached?' · screenshot attached':''}` : `No chart context shared${imageAttached?' · screenshot attached':''}`;
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
  function finishWork(status) {
    if (!currentWorkCard) return;
    const completed=status==='completed';
    currentWorkCard.card.classList.remove('is-running');
    currentWorkCard.card.classList.add(completed?'is-complete':'is-failed');
    currentWorkCard.live.textContent=completed?'DONE':'PAUSED';
    currentWorkCard.title.textContent=completed?'Review ready':'Needs attention';
    currentWorkCard.summary.textContent=completed?'The response is ready. Check the source and limits noted in Cleo’s reply.':'The turn stopped before the review was complete.';
    for (const item of workSteps.values()) if (item.classList.contains('is-active')) item.classList.replace('is-active', completed?'is-done':'is-failed');
    currentWorkCard=null;
  }
  function readableToolName(tool, server='') {
    const known={read_chart:'Reading the selected chart',dashboard_overview:'Checking Count Desk context',read_trading_journal:'Checking available journal records',read_liquidity_lab:'Checking Quant Lab study records',read_market_research:'Checking approved market context and sentiment'};
    if (known[tool]) return known[tool];
    const human=String(tool||'workspace source').replaceAll('_',' ').replace(/\b\w/g,letter=>letter.toUpperCase());
    return server ? `Reading ${server} · ${human}` : `Checking ${human}`;
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
      const option = new Option(item.name.replaceAll('_', ' '), item.name);
      option.title = item.description || '';
      agentSelect.append(option);
    }
    skillSelect.value = skills.some(item => item.name === priorSkill) ? priorSkill
      : skills.some(item => item.name === 'cleo') ? 'cleo'
        : surface === 'quant-lab' && skills.some(item => item.name === 'quant-lab') ? 'quant-lab' : '';
    agentSelect.value = (catalog.agents || []).some(item => item.name === priorAgent) ? priorAgent : '';
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
    contextLine.textContent = chart ? [chart.sourceLabel || chart.provider || 'Chart source unknown',
      chart.symbol || chart.market || 'symbol unknown', chart.timeframe || 'timeframe unknown',
      chart.cutoff || 'last bar unknown'].join(' · ') : 'No loaded chart context is available.';
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
      const body = messages.get(key) || bubble('agent', '', key);
      body.textContent += params.delta || '';
      if (body.textContent.length && !workSteps.has('final-answer'))
        addWorkStep('Writing the response for you','final-answer','active');
      stream.scrollTop = stream.scrollHeight;
    } else if (method === 'item/completed' && item.type === 'agentMessage') {
      const body = messages.get(item.id) || bubble('agent', '', item.id);
      renderMarkdown(body, item.text || body.textContent);
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
      const label=activeMode==='build'?'Running a requested local build or check':'Running a workspace command';
      addWorkStep(label,item.id||`command-${workSteps.size}`,'active'); setStatus(label);
    } else if (method === 'item/completed' && item.type === 'commandExecution') {
      const done=item.status==='completed';
      const label=`Local build or check ${done?'finished':'needs attention'}`;
      addWorkStep(label,item.id||`command-${workSteps.size}`,done?'done':'failed'); setStatus(label,!done);
    } else if (method === 'item/started' && item.type === 'fileChange') {
      const label='Editing the requested workspace files'; addWorkStep(label,item.id||`edit-${workSteps.size}`,'active'); setStatus(label);
    } else if (method === 'item/completed' && item.type === 'fileChange') {
      const done=item.status!=='failed'; const label=`Workspace edit ${done?'complete':'needs attention'}`;
      addWorkStep(label,item.id||`edit-${workSteps.size}`,done?'done':'failed'); setStatus(label,!done);
    } else if (method === 'item/started' && item.type === 'reasoning') {
      addWorkStep('Reviewing the available evidence',item.id||`review-${workSteps.size}`,'active'); setStatus('Reviewing the available evidence');
    } else if (method === 'item/completed' && item.type === 'reasoning') {
      addWorkStep('Evidence review complete',item.id||`review-${workSteps.size}`,'done');
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
        auth.textContent = `ChatGPT connected${planType ? ` · ${planType}` : ''}`;
        auth.classList.add('is-connected');
        finishWork('completed');
        setStatus(activeMode === 'build' ? 'Build turn complete · inspect workspace diff and checks' : 'Review complete · research and paper only');
      } else if (status === 'failed') { finishWork('failed'); showTurnFailure(params.turn); }
      else { finishWork(status); setStatus(`Turn ${status} · review may be incomplete`, true); }
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
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const text = textarea.value.trim();
    if ((!text && !imageInput.files[0]) || busy) return;
    try {
      if (!threadId) await newThread();
      setBusy(true);
      setStatus('Sending to Codex…');
      const chart = chartContext();
      const image = await readImage(imageInput.files[0]);
      const mode = modeSelect.value;
      const skill = skillSelect.value;
      const agent = agentSelect.value;
      activeMode = mode;
      requestedAgent = agent;
      updatePersona();
      const message = text || 'Analyze the attached screenshot as provisional chart evidence.';
      bubble('user', message, '', {mode, skill, agentRequested:agent, chart, imageAttached:Boolean(image)});
      beginWorkCard(message, chart, Boolean(image));
      const result = await request(`/threads/${encodeURIComponent(threadId)}/turns`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({text:message, chart, mode, skill, agent, image}),
      });
      turnId = result.turnId;
      addWorkStep('Request accepted · waiting for activity updates','request','done');
      textarea.value = '';
      imageInput.value = '';
      $('.codex-widget-image-name').hidden = true;
      void poll();
      const state = await request('/account');
      refreshList(state.threads || []);
    } catch (error) {
      setBusy(false);
      addWorkStep('The request did not start','request','failed');
      finishWork('failed');
      setStatus(error.message, true);
      if (/\barchived\b/i.test(error.message)) void connect();
    }
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
    updatePersona();
  });
  skillSelect.addEventListener('change', updatePersona);
  stream.addEventListener('click', event => {
    const starter=event.target.closest('[data-starter]');
    if (!starter || busy) return;
    textarea.value=starter.dataset.starter||'';
    form.requestSubmit();
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
  return root;
}
