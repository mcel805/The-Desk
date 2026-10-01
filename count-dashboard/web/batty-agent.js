const $ = (selector, root = document) => root.querySelector(selector);
const main = $('main');
const velaPage = document.body.classList.contains('vela-preview-page');
const journalPage = document.body.classList.contains('trade-journal-page');
const resourcesPage = document.body.classList.contains('resources-page');
const liquidityLabPage = document.body.classList.contains('liquidity-lab-page');
const pageLabel = journalPage ? 'Trading Journal' : resourcesPage ? 'Resources' : liquidityLabPage ? 'Liquidity Lab' : 'Count Desk';
const chatApiBase = document.body.dataset.chatApi || '';
const cleoHandoffPrompt = new URLSearchParams(window.location.search).get('cleoPrompt')?.trim() || '';
const content = document.createElement('div');
content.className = 'batty-page-content';
if (!velaPage) while (main.firstChild) content.append(main.firstChild);

const dock = document.createElement('aside');
dock.className = 'batty-dock';
dock.setAttribute('aria-label', 'Batty agent chat');
dock.innerHTML = `
  <header class="batty-chat-head">
    <div class="batty-chat-identity">
      <span class="batty-chat-icon" id="battyChatIcon" aria-hidden="true">B</span>
      <div><strong>Batty</strong><small>FIRSTMATE · TRADING DESK</small></div>
    </div>
    <div id="battyCleoChip" class="batty-cleo-chip" title="Cleo is the chart specialist for structural reads">
      <span class="batty-cleo-mark" aria-hidden="true">✦</span><span><strong>Cleo</strong><small>chart specialist</small></span><i aria-hidden="true"></i>
    </div>
    <nav class="batty-chat-actions" aria-label="Conversation controls">
      <button id="battyRecentButton" class="batty-chat-action" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="battyRecentPanel"><span aria-hidden="true">◷</span>Recent</button>
      <button id="battyNewChatButton" class="batty-chat-action is-primary" type="button" aria-label="Start a new chat"><span aria-hidden="true">＋</span><span>New</span></button>
    </nav>
  </header>
  <section id="battyRecentPanel" class="batty-recent-panel" role="dialog" aria-label="Recent chats" hidden>
    <header class="batty-recent-head"><div><strong>Recent chats</strong><small>Saved on this device · local time</small></div><button id="battyRecentClose" type="button" aria-label="Close recent chats">×</button></header>
    <div id="battyRecentList" class="batty-recent-list" role="list"></div>
  </section>
  <section id="agentActivity" class="agent-activity" aria-label="Firstmate chat activity">
    <div class="agent-activity-heading">
      <div><small>FIRSTMATE CHAT</small><strong><i></i><span id="battyChatStatus">Ready when you are</span></strong></div>
      <span id="battyProviderBadge" class="agent-activity-badge is-disconnected">CONNECTING</span>
    </div>
    <div id="agentActivityCards" class="agent-activity-cards"></div>
    <p id="battyProviderNote" class="agent-activity-note">ChatGPT session ready · Firstmate crew dispatch is not connected</p>
  </section>
  <section class="batty-chat-body" aria-label="Chat with Batty">
    <div id="battyChatStream" class="batty-chat-stream" aria-live="polite"></div>
    <form id="battyChatForm" class="batty-chat-composer">
      <label class="batty-sr-only" for="battyChatInput">Message Batty</label>
      <textarea id="battyChatInput" rows="3" placeholder="Ask about this view, the markets, or your desk…"></textarea>
      <div class="batty-composer-controls">
        <div class="batty-model-controls">
          <label class="batty-sr-only" for="battyModel">Model</label>
          <select id="battyModel" aria-label="Model">
            <option value="gpt-6-luna">GPT-6 Luna</option>
            <option value="gpt-6-sol">GPT-6 Sol</option>
            <option value="gpt-6-astra">GPT-6 Astra</option>
          </select>
          <label class="batty-sr-only" for="battyEffort">Reasoning effort</label>
          <select id="battyEffort" aria-label="Reasoning effort">
            <option value="none">None</option><option value="low">Low</option>
            <option value="medium" selected>Medium</option><option value="high">High</option>
            <option value="xhigh">Xhigh</option><option value="max">Max</option>
          </select>
        </div>
        <div class="batty-composer-actions"><button type="submit" aria-label="Send message">↑</button></div>
      </div>
    </form>
    <p class="batty-chat-foot"><span id="battyChatScope"><i></i>${pageLabel}</span><span>I’ll assume you mean the tab you’re on unless you say otherwise.</span></p>
  </section>`;

if (velaPage) {
  const modularAgents = window.countDeskModularWorkspace;
  if (modularAgents?.mountAgents) modularAgents.mountAgents(dock);
  else $('#deskChatMount').append(dock);
  document.dispatchEvent(new CustomEvent('countdesk:agents-ready',{detail:{dock}}));
  dock.setAttribute('aria-label', 'Cleo chat');
  $('.batty-chat-identity strong', dock).textContent = 'Cleo';
  $('.batty-chat-identity small', dock).textContent = 'CHART SPECIALIST · BATTY COORDINATES';
  $('#battyChatIcon', dock).textContent = '✦';
  $('#battyChatInput', dock).placeholder = 'Ask Cleo about this chart…';
  $('.batty-chat-body', dock).setAttribute('aria-label', 'Chat with Cleo');
  $('label[for="battyChatInput"]', dock).textContent = 'Message Cleo';
  $('.agent-activity-heading small', dock).textContent = 'CHART CHAT';
} else {
  main.classList.add('batty-main');
  main.append(content, dock);
}

const stream = $('#battyChatStream');
const status = $('#battyChatStatus');
const icon = $('#battyChatIcon');
const input = $('#battyChatInput');
const form = $('#battyChatForm');
const sendButton = $('button[type="submit"]', form);
const scope = $('#battyChatScope');
const modelPicker = $('#battyModel');
const effortPicker = $('#battyEffort');
const providerBadge = $('#battyProviderBadge');
const providerNote = $('#battyProviderNote');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const cleoReportAlarm = velaPage ? $('#cleoReportAlarm') : null;
const cleoReportReadPrefix = 'batty-cleo-report-read-v1:';
const agentActivityCards = $('#agentActivityCards');
const sessionsKey = 'batty-chat-sessions-v1';
const activeSessionKey = 'batty-active-chat-v1';
const legacyChatHistoryKey = 'batty-conversation-v1';
const maxRecentSessions = 40;
const maxMessagesPerSession = 100;
let chatSessions = loadChatSessions();
let activeSession = findInitialSession();
let chatHistory = activeSession.messages;
const recentButton = $('#battyRecentButton');
const recentPanel = $('#battyRecentPanel');
const recentList = $('#battyRecentList');
const newChatButton = $('#battyNewChatButton');
let agentActivity = {participants:['batty'],startedAt:null,prompt:'',response:'',working:false};

function cleoReportId(item) {
  return `cleo-report-${String(item.timestamp || '').replace(/\D/g, '')}`;
}

function cleoReports() {
  return chatHistory.filter(item => item.role === 'assistant' && !item.error && item.specialists?.includes('cleo'));
}

function updateCleoReportAlarm({initialize = false} = {}) {
  if (!cleoReportAlarm) return;
  const latest = cleoReports().at(-1);
  const key = `${cleoReportReadPrefix}${activeSession.id}`;
  let seenAt = null;
  try {
    seenAt = localStorage.getItem(key);
    if (seenAt === null && initialize) {
      seenAt = latest?.timestamp || '';
      localStorage.setItem(key, seenAt);
    }
  } catch { seenAt = latest?.timestamp || ''; }
  const unread = Boolean(latest?.timestamp && seenAt !== null && latest.timestamp > seenAt);
  cleoReportAlarm.classList.toggle('has-unread', unread);
  cleoReportAlarm.setAttribute('aria-label', unread ? 'New Cleo report ready. Open latest report.' : 'Open latest Cleo report');
  cleoReportAlarm.title = unread ? 'New Cleo report · select to read' : 'No new Cleo report';
}

function markCleoReportsRead() {
  const latest = cleoReports().at(-1);
  if (!latest) return;
  try { localStorage.setItem(`${cleoReportReadPrefix}${activeSession.id}`, latest.timestamp || ''); } catch {}
  updateCleoReportAlarm();
  const article = document.getElementById(cleoReportId(latest));
  if (!article) return;
  article.scrollIntoView({block:'center', behavior:reducedMotion ? 'auto' : 'smooth'});
  article.tabIndex = -1;
  article.focus({preventScroll:true});
  article.classList.add('cleo-report-highlighted');
  setTimeout(() => article.classList.remove('cleo-report-highlighted'), 2200);
}

function activeContext() {
  if (velaPage) return {label: `Vela · ${$('#velaSymbol')?.selectedOptions?.[0]?.textContent || ''} · ${$('#velaTimeframe')?.value || ''} · Active studies: ${$('#cleoIndicators')?.textContent || 'Pending'}`, detail:'Vela chart and active studies'};
  if (resourcesPage) return {label: 'Resources · Batty user guide', detail: 'Batty Resources'};
  if (liquidityLabPage) return {label: 'Liquidity Lab · active workspace', detail: 'Liquidity Lab'};
  if (journalPage) {
    const selected = id => {
      const element = $(`#${id}`);
      return element?.selectedOptions?.[0]?.textContent?.trim() || '';
    };
    const team = selected('filterTeam');
    const trader = selected('filterMember');
    const account = selected('filterAccount');
    const symbol = $('#paperSymbol')?.value?.trim();
    const parts = [pageLabel];
    if (trader && trader !== 'All traders') parts.push(trader);
    else if (team && team !== 'All teams') parts.push(team);
    if (account && account !== 'All accounts') parts.push(account.split(' · ')[0]);
    if (symbol) parts.push(symbol.toUpperCase());
    return {label: parts.join(' · '), detail: 'Trading Journal'};
  }

  const symbolElement = $('#symbol');
  const symbol = symbolElement?.selectedOptions?.[0]?.textContent?.trim() || symbolElement?.value || 'selected market';
  const timeframe = $('#timeframe')?.value || 'timeframe';
  const inspector = $('.inspector-tab[aria-selected="true"]')?.textContent?.trim() || 'Chart';
  const tracker = $('#panel-journal');
  const trackerRect = tracker?.getBoundingClientRect();
  const trackerIsActive = trackerRect && trackerRect.top < innerHeight * .65 && trackerRect.bottom > 120;
  if (trackerIsActive) return {label: `${pageLabel} · Level tracker · ${symbol.split(' · ')[0]}`, detail: `Level forward tracker · ${symbol}`};
  return {label: `${pageLabel} · ${symbol.split(' · ')[0]} · ${timeframe} · ${inspector}`, detail: `${symbol} · ${timeframe} · ${inspector}`};
}

function activeView() {
  if (velaPage) return window.countDeskVelaContext || {tab:'Count Desk',symbol:$('#velaSymbol')?.value || '',timeframe:$('#velaTimeframe')?.value || '1H'};
  if (liquidityLabPage) return {tab:'Liquidity Lab', selection:$('.batty-page-content')?.innerText?.slice(0,6000) || 'Liquidity Lab'};
  if (journalPage) {
    const selected = id => $(`#${id}`)?.selectedOptions?.[0]?.textContent?.trim() || '';
    const selectedValue = id => $(`#${id}`)?.value || '';
    return {
      tab:'Trading Journal',
      selection:[selected('filterTeam'),selected('filterMember'),selected('filterAccount')].filter(Boolean).join(' · '),
      team_id:selectedValue('filterTeam'), member_id:selectedValue('filterMember'), account_id:selectedValue('filterAccount'),
      symbol:$('#paperSymbol')?.value?.trim() || '',
    };
  }
  if (resourcesPage) return {tab:'Resources', selection:location.hash || 'Batty user guide'};
  const cutoffInput = $('#cutoff')?.value;
  const cutoff = cutoffInput ? Math.floor(new Date(cutoffInput).getTime()/1000) : undefined;
  return {tab:'Count Desk', symbol:$('#symbol')?.value || '', timeframe:$('#timeframe')?.value || '30M', cutoff};
}

function updateContext() {
  const context = activeContext();
  scope.innerHTML = `<i></i>${escapeText(context.label)}`;
  const welcomeContext = $('#battyWelcomeContext');
  if (welcomeContext) welcomeContext.textContent = context.detail;
}

function escapeText(value) {
  return String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
}

function makeSessionId() {
  return globalThis.crypto?.randomUUID?.() || `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function validTimestamp(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function formatTimestamp(value) {
  const date = validTimestamp(value);
  return date ? new Date(date).toLocaleString(undefined, {
    year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit',
  }) : 'Date unavailable';
}

function cleanMessages(items) {
  if (!Array.isArray(items)) return [];
  return items.filter(item => item && ['user','assistant'].includes(item.role) && typeof item.content === 'string')
    .slice(-maxMessagesPerSession)
    .map(item => ({
      role:item.role,
      content:item.content.slice(0, 12000),
      timestamp:validTimestamp(item.timestamp),
      ...(typeof item.model === 'string' ? {model:item.model} : {}),
      ...(Array.isArray(item.specialists) ? {specialists:item.specialists.filter(name => typeof name === 'string')} : {}),
      ...(item.error === true ? {error:true} : {}),
    }));
}

function loadChatSessions() {
  try {
    const stored = JSON.parse(localStorage.getItem(sessionsKey) || '[]');
    if (Array.isArray(stored)) {
      const valid = stored.filter(session => session && typeof session.id === 'string')
        .map(session => ({
          id:session.id,
          title:typeof session.title === 'string' ? session.title : 'Chat',
          createdAt:validTimestamp(session.createdAt),
          updatedAt:validTimestamp(session.updatedAt),
          context:typeof session.context === 'string' ? session.context : '',
          messages:cleanMessages(session.messages),
        }));
      if (valid.length) return valid.slice(-maxRecentSessions);
    }
  } catch {}

  // Old turns were kept only in sessionStorage and had no timestamps. Preserve
  // them without inventing dates; new messages receive real local timestamps.
  try {
    const legacy = JSON.parse(sessionStorage.getItem(legacyChatHistoryKey) || '[]');
    if (Array.isArray(legacy) && legacy.length) {
      const migrated = [{
        id:makeSessionId(), title:'Earlier conversation', createdAt:null, updatedAt:null,
        context:'', messages:cleanMessages(legacy),
      }];
      localStorage.setItem(sessionsKey, JSON.stringify(migrated));
      sessionStorage.setItem(activeSessionKey, migrated[0].id);
      sessionStorage.removeItem(legacyChatHistoryKey);
      return migrated;
    }
  } catch {}
  return [];
}

function findInitialSession() {
  let requestedId = '';
  try { requestedId = sessionStorage.getItem(activeSessionKey) || ''; } catch {}
  return chatSessions.find(session => session.id === requestedId)
    || [...chatSessions].sort((a,b) => (Date.parse(b.updatedAt || '') || 0) - (Date.parse(a.updatedAt || '') || 0))[0]
    || {id:makeSessionId(),title:'New chat',createdAt:null,updatedAt:null,context:'',messages:[]};
}

function createChatSession() {
  const createdAt = new Date().toISOString();
  activeSession = {
    id:makeSessionId(), title:'New chat', createdAt, updatedAt:createdAt,
    context:activeContext().label, messages:[],
  };
  chatHistory = activeSession.messages;
  try { sessionStorage.setItem(activeSessionKey, activeSession.id); } catch {}
  persistChatHistory();
  recentPanel.hidden = true;
  recentButton.setAttribute('aria-expanded','false');
  renderConversation();
  updateCleoReportAlarm({initialize:true});
  input.focus();
}

function persistChatHistory() {
  activeSession.messages = chatHistory.slice(-maxMessagesPerSession).map(item => ({
    ...item, content:item.content.slice(0, 12000),
  }));
  activeSession.updatedAt = chatHistory.at(-1)?.timestamp || activeSession.updatedAt || new Date().toISOString();
  activeSession.context = activeSession.context || activeContext().label;
  const firstUser = chatHistory.find(item => item.role === 'user' && item.content.trim());
  if (firstUser && activeSession.title === 'New chat') {
    activeSession.title = firstUser.content.replace(/\s+/g,' ').trim().slice(0, 60) || 'New chat';
  }
  try {
    const stored = JSON.parse(localStorage.getItem(sessionsKey) || '[]');
    const merged = new Map();
    for (const session of [...chatSessions, ...(Array.isArray(stored) ? stored : [])]) {
      if (session && typeof session.id === 'string') merged.set(session.id, session);
    }
    merged.set(activeSession.id, activeSession);
    chatSessions = [...merged.values()]
      .sort((a,b) => (Date.parse(b.updatedAt || '') || 0) - (Date.parse(a.updatedAt || '') || 0))
      .slice(0,maxRecentSessions);
    while (chatSessions.length > 1 && JSON.stringify(chatSessions).length > 1_800_000) chatSessions.pop();
    localStorage.setItem(sessionsKey, JSON.stringify(chatSessions));
    sessionStorage.setItem(activeSessionKey, activeSession.id);
  } catch {
    if (!chatSessions.some(session => session.id === activeSession.id)) chatSessions.unshift(activeSession);
  }
  renderRecentChats();
}

function addMessage(kind, message, meta = '') {
  const article = document.createElement('article');
  article.className = `batty-message ${kind}`;
  const text = document.createElement('p');
  text.textContent = message;
  article.append(text);
  if (meta) {
    const label = document.createElement('small');
    label.textContent = meta;
    article.append(label);
  }
  stream.append(article);
  stream.scrollTop = stream.scrollHeight;
  return article;
}

function renderSourceLinks(paragraph, source) {
  const matcher = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)/g;
  paragraph.replaceChildren();
  let cursor = 0;
  for (const match of source.matchAll(matcher)) {
    const index = match.index ?? 0;
    if (index > cursor) paragraph.append(document.createTextNode(source.slice(cursor, index)));
    const label = match[1] || match[3];
    const url = match[2] || match[3];
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.textContent = label;
    paragraph.append(anchor);
    cursor = index + match[0].length;
  }
  if (cursor < source.length) paragraph.append(document.createTextNode(source.slice(cursor)));
}

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function participantsFor(prompt = '') {
  const chartIntent = /chart|wave|count|market|setup|level|price|bias|trend|fibonacci|liquidity|structure|trade idea/i.test(prompt);
  return chartIntent ? ['batty', 'cleo'] : ['batty'];
}

function renderAgentActivity({participants=['batty'],working=false,prompt='',response='',startedAt=null}={}){
  agentActivity={participants,working,prompt,response,startedAt};
  agentActivityCards.replaceChildren();
  document.querySelectorAll('#agentRoster [data-agent-id]').forEach(seat=>seat.classList.toggle('is-working',working&&participants.includes(seat.dataset.agentId)));
  document.querySelectorAll('#agentRoster [data-agent-id]').forEach(seat=>seat.classList.toggle('is-default-agent',seat.dataset.agentId==='batty'));
  for(const id of participants){
    const source=$(`#agentRoster [data-agent-id="${id}"]`);
    const card=document.createElement('article');
    card.className=`agent-activity-card${working?' is-working':''}${id==='batty'?' is-default-agent':''}`;
    card.dataset.activityAgent=id;
    const head=document.createElement('div');head.className='agent-activity-card-head';
    const avatar=source?.querySelector('.agent-pixel')?.cloneNode(true);
    const avatarWrap=document.createElement('span');avatarWrap.className='agent-activity-avatar';
    if(avatar)avatarWrap.append(avatar);else avatarWrap.textContent=source?.querySelector('strong')?.textContent?.slice(0,1)||'B';
    const name=document.createElement('strong');name.textContent=source?.querySelector('.agent-seat-copy strong')?.textContent||(id==='batty'?'Batty':id);
    const lamp=document.createElement('i');lamp.className='agent-activity-lamp';lamp.setAttribute('aria-hidden','true');
    head.append(avatarWrap,name,lamp);
    const task=document.createElement('div');task.className='agent-activity-task';task.textContent=working?'working on your request':(startedAt?'reply complete':'ready to talk');
    card.append(head,task);agentActivityCards.append(card);
  }
  $('#agentActivity').classList.toggle('is-working',working);
  const cleoChip = $('#battyCleoChip');
  if (cleoChip) {
    cleoChip.classList.toggle('is-working', working && participants.includes('cleo'));
    cleoChip.classList.toggle('is-complete', !working && startedAt && participants.includes('cleo'));
    cleoChip.querySelector('small').textContent = working && participants.includes('cleo')
      ? 'working on chart' : (!working && startedAt && participants.includes('cleo') ? 'analysis returned' : 'chart specialist');
  }
}

async function reply(prompt) {
  const context = activeContext();
  const participants=participantsFor(prompt);
  let completedParticipants=['batty'];
  const startedAt=Date.now();
  renderAgentActivity({participants,working:true,prompt,response:'',startedAt});
  const userTimestamp = new Date().toISOString();
  addMessage('user', prompt, `YOU · ${formatTimestamp(userTimestamp)}`);
  const progress = addMessage('progress', `Batty is checking your request and routing chart analysis to Cleo when needed…`);
  icon.classList.add('working');
  status.textContent = 'Understanding and routing your request';
  sendButton.disabled = true;
  recentButton.disabled = true;
  newChatButton.disabled = true;
  recentPanel.hidden = true;
  recentButton.setAttribute('aria-expanded','false');
  try {
    chatHistory.push({role:'user', content:prompt, timestamp:userTimestamp});
    persistChatHistory();
    const response = await fetch(`${chatApiBase}/api/chat`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        model:modelPicker.value,
        effort:effortPicker.value,
        context:context.label,
        view:activeView(),
        messages:chatHistory.slice(-24).map(({role,content}) => ({role,content})),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Chat request failed (${response.status}).`);
    if (Array.isArray(result.specialists) && result.specialists.includes('cleo')) {
      completedParticipants=['batty','cleo'];
    }
    const assistantTimestamp = new Date().toISOString();
    const assistantMessage = {
      role:'assistant', content:result.text, timestamp:assistantTimestamp,
      model:modelPicker.selectedOptions[0].textContent,
      specialists:Array.isArray(result.specialists) ? result.specialists : [],
    };
    chatHistory.push(assistantMessage);
    persistChatHistory();
    status.textContent = 'Writing this up in desk language';
    progress.querySelector('p').textContent = 'Putting the answer into trader terms…';
    const message = addMessage('assistant', '');
    if (completedParticipants.includes('cleo')) message.id = cleoReportId(assistantMessage);
    const paragraph = message.querySelector('p');
    const answer = result.text;
    const stride = reducedMotion ? answer.length : Math.max(1, Math.ceil(answer.length / 120));
    for (let index = 0; index < answer.length; index += stride) {
      paragraph.textContent = answer.slice(0, index + stride);
      agentActivity.response=paragraph.textContent;
      stream.scrollTop = stream.scrollHeight;
      await wait(reducedMotion ? 0 : 14);
    }
    renderSourceLinks(paragraph, answer);
    message.querySelector('small')?.remove();
    const meta = document.createElement('small');
    meta.textContent = `${modelPicker.selectedOptions[0].textContent} · ${formatTimestamp(assistantTimestamp)}${completedParticipants.includes('cleo')?' · Cleo delegated':''}`;
    message.append(meta);
    if (completedParticipants.includes('cleo')) updateCleoReportAlarm();
    progress.querySelector('p').textContent = completedParticipants.includes('cleo')
      ? '✓ Cleo returned analysis · Batty relayed it'
      : '✓ Batty replied · chart-specialist findings are attributed when returned';
    progress.classList.add('complete');
  } catch (error) {
    const errorText = error.message || 'OpenAI could not answer this request.';
    const errorTimestamp = new Date().toISOString();
    chatHistory.push({role:'assistant',content:errorText,timestamp:errorTimestamp,error:true});
    persistChatHistory();
    const message = addMessage('assistant', errorText, `BATTY · ${formatTimestamp(errorTimestamp)}`);
    message.classList.add('batty-message-error');
    progress.querySelector('p').textContent = 'Codex connection needs attention';
    progress.classList.add('failed');
    if (/not signed in|Codex is unavailable/i.test(error.message || '')) {
      providerBadge.textContent = 'SETUP NEEDED';
      providerBadge.classList.add('is-disconnected');
    providerNote.textContent = 'Sign in to Codex with ChatGPT, then restart the Count Desk.';
    }
  } finally {
    icon.classList.remove('working');
    status.textContent = 'Ready when you are';
    renderAgentActivity({participants:completedParticipants,working:false,startedAt});
    sendButton.disabled = false;
    recentButton.disabled = false;
    newChatButton.disabled = false;
    input.focus();
  }
}

function submit(prompt) {
  const value = prompt.trim();
  if (!value || sendButton.disabled) return;
  input.value = '';
  $('.batty-quick-prompts')?.remove();
  reply(value);
}

function makeQuickPrompts() {
  const quick = document.createElement('div');
  quick.className = 'batty-quick-prompts';
  quick.setAttribute('aria-label', 'Suggested prompts');
  const prompts = pageLabel === 'Count Desk'
    ? ['Ask Cleo for a chart read', 'Map invalidation levels', 'Review the paper setup']
    : ['What stands out here?', 'Teach me something', 'Any news affecting this market?'];
  prompts.forEach(prompt => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = prompt;
    button.addEventListener('click', () => submit(prompt));
    quick.append(button);
  });
  return quick;
}

function renderConversation() {
  stream.replaceChildren();
  addMessage('assistant', 'Hey Mark. I’m following your active tab. Ask away; I’ll assume you mean this view unless you point me somewhere else.', 'BATTY · your desk partner');
  const contextNote = document.createElement('article');
  contextNote.className = 'batty-insight welcome-insight';
  contextNote.innerHTML = `<strong>ACTIVE CONTEXT</strong><p id="battyWelcomeContext"></p>`;
  stream.append(contextNote);
  for (const item of chatHistory) {
    const roleLabel = item.role === 'user' ? 'YOU' : (item.model || 'BATTY');
    const specialistLabel = item.specialists?.includes('cleo') ? ' · Cleo delegated' : '';
    const message = addMessage(item.role, item.content, `${roleLabel} · ${formatTimestamp(item.timestamp)}${specialistLabel}`);
    if (item.role === 'assistant' && !item.error && item.specialists?.includes('cleo')) message.id = cleoReportId(item);
    if (item.role === 'assistant') renderSourceLinks(message.querySelector('p'), item.content);
    if (item.error) message.classList.add('batty-message-error');
  }
  if (!chatHistory.length) stream.append(makeQuickPrompts());
  updateContext();
}

function renderRecentChats() {
  recentList.replaceChildren();
  const ordered = [...chatSessions].sort((a,b) => (Date.parse(b.updatedAt || '') || 0) - (Date.parse(a.updatedAt || '') || 0));
  if (!ordered.length) {
    const empty = document.createElement('p');
    empty.className = 'batty-recent-empty';
    empty.textContent = 'Your recent chats will appear here.';
    recentList.append(empty);
    return;
  }
  for (const session of ordered) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `batty-recent-item${session.id === activeSession.id ? ' is-current' : ''}`;
    row.setAttribute('aria-current',session.id === activeSession.id ? 'true' : 'false');
    const title = document.createElement('strong');
    title.textContent = session.title || 'Chat';
    const preview = document.createElement('span');
    const lastMessage = session.messages?.at(-1);
    preview.textContent = lastMessage?.content?.replace(/\s+/g,' ').trim().slice(0,88) || 'No messages yet';
    const stamp = document.createElement('small');
    stamp.textContent = formatTimestamp(session.updatedAt || session.createdAt);
    row.append(title,preview,stamp);
    row.addEventListener('click', () => {
      const selected = chatSessions.find(item => item.id === session.id);
      if (!selected) return;
      activeSession = selected;
      chatHistory = activeSession.messages;
      try { sessionStorage.setItem(activeSessionKey, activeSession.id); } catch {}
      recentPanel.hidden = true;
      recentButton.setAttribute('aria-expanded','false');
      renderConversation();
    });
    recentList.append(row);
  }
}

renderConversation();
updateCleoReportAlarm({initialize:true});
cleoReportAlarm?.addEventListener('click', markCleoReportsRead);
if (cleoHandoffPrompt) {
  input.value = cleoHandoffPrompt;
  input.setSelectionRange(input.value.length, input.value.length);
}
renderRecentChats();

recentButton.addEventListener('click', () => {
  const opening = recentPanel.hidden;
  recentPanel.hidden = !opening;
  recentButton.setAttribute('aria-expanded',String(opening));
  if (opening) recentList.querySelector('button')?.focus();
});
$('#battyRecentClose').addEventListener('click', () => {
  recentPanel.hidden = true;
  recentButton.setAttribute('aria-expanded','false');
  recentButton.focus();
});
newChatButton.addEventListener('click', createChatSession);
document.addEventListener('click', event => {
  if (!recentPanel.hidden && !dock.contains(event.target)) {
    recentPanel.hidden = true;
    recentButton.setAttribute('aria-expanded','false');
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !recentPanel.hidden) {
    recentPanel.hidden = true;
    recentButton.setAttribute('aria-expanded','false');
    recentButton.focus();
  }
});
addEventListener('storage', event => {
  if (event.key?.startsWith(cleoReportReadPrefix)) {
    updateCleoReportAlarm();
    return;
  }
  if (event.key !== sessionsKey) return;
  chatSessions = loadChatSessions();
  const refreshedActive = chatSessions.find(session => session.id === activeSession.id);
  if (refreshedActive && !sendButton.disabled) {
    activeSession = refreshedActive;
    chatHistory = activeSession.messages;
    renderConversation();
    updateCleoReportAlarm({initialize:true});
  }
  renderRecentChats();
});

async function loadChatConfig() {
  try {
    const response = await fetch(`${chatApiBase}/api/chat/config`);
    const config = await response.json();
    if (!response.ok) throw new Error(config.error || 'Codex status is unavailable.');
    if (config.configured) {
      providerBadge.textContent = 'CHATGPT CONNECTED';
      providerBadge.classList.remove('is-disconnected');
      providerNote.textContent = 'Chart reads route to the project Cleo subagent. Batty coordinates and relays its findings; durable Firstmate crew tracking is separate.';
    } else {
      providerBadge.textContent = 'SETUP NEEDED';
      providerBadge.classList.add('is-disconnected');
      providerNote.textContent = 'Sign in to Codex with ChatGPT, then restart the Count Desk.';
    }
  } catch {
    providerBadge.textContent = 'OFFLINE';
    providerBadge.classList.add('is-disconnected');
    providerNote.textContent = 'Could not reach the local chat service.';
  }
}
loadChatConfig();

const savedModel = localStorage.getItem('batty-chat-model');
const savedEffort = localStorage.getItem('batty-chat-effort');
if (savedModel && [...modelPicker.options].some(option => option.value === savedModel)) modelPicker.value = savedModel;
if (savedEffort && [...effortPicker.options].some(option => option.value === savedEffort)) effortPicker.value = savedEffort;
function syncEffortOptions() {
  const none = effortPicker.querySelector('option[value="none"]');
  if (none) none.hidden = modelPicker.value === 'gpt-6-astra';
  if (modelPicker.value === 'gpt-6-astra' && effortPicker.value === 'none') effortPicker.value = 'low';
}
syncEffortOptions();
modelPicker.addEventListener('change', () => {
  localStorage.setItem('batty-chat-model', modelPicker.value);
  syncEffortOptions();
  localStorage.setItem('batty-chat-effort', effortPicker.value);
});
effortPicker.addEventListener('change', () => localStorage.setItem('batty-chat-effort', effortPicker.value));

form.addEventListener('submit', event => {
  event.preventDefault();
  submit(input.value);
});
input.addEventListener('keydown', event => {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  submit(input.value);
});
renderAgentActivity();
addEventListener('countdesk:chart-context', updateContext);
document.addEventListener('change', event => {
  if (event.target.matches('#symbol,#timeframe,#filterTeam,#filterMember,#filterAccount,#paperAccount,#paperAssetClass')) updateContext();
});
document.addEventListener('input', event => {
  if (event.target.matches('#paperSymbol')) updateContext();
});
document.addEventListener('click', event => {
  if (event.target.closest('[data-inspector-tab]')) setTimeout(updateContext, 0);
});
['#symbol','#timeframe'].forEach(selector => {
  const control = $(selector);
  if (control) new MutationObserver(updateContext).observe(control, {childList:true,subtree:true});
});
let contextScrollTimer;
addEventListener('scroll', () => {
  clearTimeout(contextScrollTimer);
  contextScrollTimer = setTimeout(updateContext, 100);
}, {passive:true});

const mobileButton = document.createElement('button');
mobileButton.type = 'button';
mobileButton.className = 'batty-mobile-toggle';
mobileButton.textContent = 'Open dashboard';
mobileButton.addEventListener('click', () => {
  const showDashboard = document.body.classList.toggle('batty-dashboard-focus');
  try { localStorage.setItem('batty-mobile-focus', showDashboard ? 'chart' : 'chat'); } catch {}
  mobileButton.textContent = showDashboard ? 'Back to Batty' : 'Open dashboard';
});
const apiState = $('#apiState,#journalApiState');
apiState?.before(mobileButton);

function updateMobileMode() {
  if (velaPage) return;
  const mobile = matchMedia('(max-width: 760px)').matches;
  document.body.classList.toggle('batty-mobile', mobile);
  if (mobile) {
    let preference = '';
    try { preference = localStorage.getItem('batty-mobile-focus') || ''; } catch {}
    if (!preference) document.body.classList.add('batty-dashboard-focus');
    mobileButton.textContent = document.body.classList.contains('batty-dashboard-focus') ? 'Back to Batty' : 'Open dashboard';
  }
}
updateMobileMode();
addEventListener('resize', updateMobileMode);
