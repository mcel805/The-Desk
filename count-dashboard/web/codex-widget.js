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

export function createCodexWidget(host) {
  const root = document.createElement('section');
  root.className = 'codex-widget';
  root.innerHTML = `<div class="codex-widget-toolbar"><span class="codex-widget-auth" role="status">Checking Codex sign-in…</span><select class="codex-widget-threads" aria-label="Codex chats"></select><button type="button" class="codex-widget-new">＋ New</button></div>
    <div class="codex-widget-stream" aria-live="polite"><p class="codex-widget-empty">A persistent Codex conversation lives here. Ask for a chart read and Codex can call Cleo.</p></div>
    <div class="codex-widget-activity" role="status" aria-live="polite">Ready · research and paper only</div>
    <form class="codex-widget-composer"><textarea rows="3" maxlength="12000" aria-label="Message Codex" placeholder="Ask Codex, or ask Cleo to read this chart…"></textarea><div class="codex-widget-compose-row"><label><input type="checkbox" class="codex-widget-chart" checked> Share chart context</label><button type="button" class="codex-widget-stop" hidden>Stop</button><button type="submit" class="codex-widget-send">Send ↑</button></div></form>`;
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
  let threadId = '';
  let turnId = '';
  let sequence = 0;
  let busy = false;
  let polling = false;
  let connecting = false;
  let reconnectTimer = 0;
  let planType = '';
  let requiresSignIn = false;
  const messages = new Map();

  function setBusy(value) {
    busy = value;
    sendButton.disabled = value;
    stopButton.hidden = !value;
    selector.disabled = value;
    $('.codex-widget-new').disabled = value;
  }
  function bubble(type, content, key = '') {
    const element = document.createElement('article');
    element.className = `codex-widget-message is-${type}`;
    const label = document.createElement('strong');
    label.textContent = type === 'user' ? 'You' : type === 'activity' ? 'Codex activity' : 'Codex';
    const body = document.createElement('p');
    body.textContent = content;
    element.append(label, body);
    stream.querySelector('.codex-widget-empty')?.remove();
    if (type !== 'activity') stream.querySelector('.codex-widget-message.is-activity')?.remove();
    stream.append(element);
    stream.scrollTop = stream.scrollHeight;
    if (key) messages.set(key, body);
    return body;
  }
  function setStatus(value, error = false) {
    activity.textContent = value;
    activity.classList.toggle('is-error', error);
  }
  function refreshList(threads) {
    const selected = threadId;
    selector.replaceChildren();
    const blank = new Option('Choose a chat', '');
    selector.append(blank);
    for (const thread of threads) selector.append(new Option(thread.title || 'Codex chat', thread.id));
    selector.value = selected && threads.some(thread => thread.id === selected) ? selected : '';
  }
  async function loadThread(id) {
    threadId = id;
    selector.value = id;
    sequence = 0;
    turnId = '';
    messages.clear();
    stream.replaceChildren();
    if (!id) {
      bubble('activity', 'Start a new Codex chat, or choose one from Recent.');
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
        bubble(item.type === 'user' ? 'user' : 'agent', content);
      }
      if (turn.status === 'inProgress') turnId = turn.id;
    }
    if (!stream.children.length) bubble('activity', 'New Codex chat. Ask a question to begin.');
    setBusy(Boolean(turnId));
    setStatus(turnId ? 'Codex is working…' : 'Ready · research and paper only');
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
      await loadThread(state.threads?.find(thread => thread.id === threadId)?.id || state.threads?.[0]?.id || '');
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
    refreshList(state.threads || []);
    await loadThread(created.threadId);
    textarea.focus();
  }
  function onEvent(event) {
    const {method, params = {}} = event;
    const item = params.item || {};
    if (method === 'turn/started') {
      turnId = params.turn?.id || turnId;
      setBusy(true);
      setStatus('Codex is working…');
    } else if (method === 'item/agentMessage/delta') {
      const key = params.itemId || `stream-${turnId}`;
      const body = messages.get(key) || bubble('agent', '', key);
      body.textContent += params.delta || '';
      stream.scrollTop = stream.scrollHeight;
    } else if (method === 'item/completed' && item.type === 'agentMessage') {
      const body = messages.get(item.id) || bubble('agent', '', item.id);
      body.textContent = item.text || body.textContent;
    } else if (method === 'item/started' && item.type === 'collabAgentToolCall') {
      setStatus(item.tool === 'wait' ? 'Codex is waiting for the specialist…' : 'Codex started a specialist call…');
    } else if (method === 'item/completed' && item.type === 'collabAgentToolCall') {
      setStatus(item.status === 'completed' ? 'Specialist step completed · Codex is reviewing…' : 'Specialist step did not complete.');
    } else if (method === 'item/started' && item.type === 'mcpToolCall') {
      setStatus(`Reading ${item.server || 'Count Desk'} · ${item.tool || 'tool'}…`);
    } else if (method === 'widget/approvalDeclined') {
      setStatus('A requested action was declined by this read-only widget.', true);
    } else if (method === 'turn/completed') {
      const status = params.turn?.status || 'completed';
      turnId = '';
      setBusy(false);
      if (status === 'completed') {
        auth.textContent = `ChatGPT connected${planType ? ` · ${planType}` : ''}`;
        auth.classList.add('is-connected');
        setStatus('Reply complete · research and paper only');
      } else if (status === 'failed') showTurnFailure(params.turn);
      else setStatus(`Codex turn ${status}.`, true);
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
    if (!text || busy) return;
    try {
      if (!threadId) await newThread();
      setBusy(true);
      setStatus('Sending to Codex…');
      const chart = $('.codex-widget-chart').checked ? chartSnapshot() : null;
      const result = await request(`/threads/${encodeURIComponent(threadId)}/turns`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({text, chart}),
      });
      turnId = result.turnId;
      textarea.value = '';
      bubble('user', text);
      void poll();
      const state = await request('/account');
      refreshList(state.threads || []);
    } catch (error) { setBusy(false); setStatus(error.message, true); }
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
