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
      <button id="battySupportButton" class="batty-chat-action" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="battySupportPanel"><span aria-hidden="true">ⓘ</span>Support</button>
      <button id="battyRecentButton" class="batty-chat-action" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="battyRecentPanel"><span aria-hidden="true">◷</span>Recent</button>
      <button id="battyNewChatButton" class="batty-chat-action is-primary" type="button" aria-label="Start a new chat"><span aria-hidden="true">＋</span><span>New</span></button>
    </nav>
  </header>
  <section id="battyRecentPanel" class="batty-recent-panel" role="dialog" aria-label="Recent chats" hidden>
    <header class="batty-recent-head"><div><strong>Recent chats</strong><small>Saved on this device · local time</small></div><button id="battyRecentClose" type="button" aria-label="Close recent chats">×</button></header>
    <div id="battyRecentList" class="batty-recent-list" role="list"></div>
  </section>
  <section id="battySupportPanel" class="batty-support-panel" role="dialog" aria-label="Batty support log" hidden>
    <header class="batty-recent-head"><div><strong>Support log</strong><small>Local diagnostics · message text and files excluded</small></div><button id="battySupportClose" type="button" aria-label="Close support log">×</button></header>
    <div class="batty-support-toolbar"><button id="battySupportRefresh" type="button">Refresh</button><button id="battySupportExport" type="button">Export redacted JSON</button></div>
    <p id="battySupportNote" class="batty-support-note">Recent Batty turns appear here with request IDs and provider status.</p>
    <div id="battySupportEvents" class="batty-support-events" role="list"></div>
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
      <div class="batty-attachment-row"><input id="battyFileInput" type="file" multiple hidden><button id="battyAttachButton" type="button" aria-label="Attach files">＋ Attach</button>${velaPage ? '<button id="battyClipButton" type="button" aria-label="Choose a Show Me clip" aria-haspopup="dialog" aria-expanded="false" aria-controls="battyClipPanel" title="Choose a recent Show Me clip">📹</button>' : ''}<button id="battyShareScreenButton" type="button" aria-pressed="false" title="Choose the Count Desk browser tab; Batty captures one frame for each question">Share tab</button><span id="battyShareStatus" role="status">Screenshot off</span></div>
      ${velaPage ? '<section id="battyClipPanel" class="batty-clip-panel" role="dialog" aria-label="Recent Show Me clips" hidden><header><strong>Recent Show Me clips</strong><button id="battyClipClose" type="button" aria-label="Close clips">×</button></header><p>Choose a clip, then send a chat question for review or write a request and choose Build with Codex. Codex receives timed still frames; microphone audio stays in the saved clip.</p><div id="battyClipList" class="batty-clip-list"></div><video id="battyClipPreview" controls playsinline preload="metadata" hidden></video><a id="battyClipDownload" download hidden>Download selected clip ↓</a><small id="battyClipStatus" role="status">No clip selected.</small></section><div id="battySelectedClip" class="batty-selected-clip" hidden></div><section id="battyBuildPanel" class="batty-build-panel" aria-label="Show Me coding run" aria-live="polite" hidden></section>' : ''}
      <p id="battyAttachmentStatus" class="batty-attachment-status" aria-live="polite">Files are sent only with your next question.</p>
      <div id="battyAttachmentList" class="batty-attachment-list" aria-live="polite"></div>
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
const supportButton = $('#battySupportButton');
const supportPanel = $('#battySupportPanel');
const supportEvents = $('#battySupportEvents');
const supportNote = $('#battySupportNote');
const supportExport = $('#battySupportExport');
const supportRefresh = $('#battySupportRefresh');
const supportClose = $('#battySupportClose');
const fileInput = $('#battyFileInput');
const attachButton = $('#battyAttachButton');
const attachmentList = $('#battyAttachmentList');
const attachmentStatus = $('#battyAttachmentStatus');
const shareScreenButton = $('#battyShareScreenButton');
const shareStatus = $('#battyShareStatus');
const clipButton = velaPage ? $('#battyClipButton') : null;
const clipPanel = velaPage ? $('#battyClipPanel') : null;
const clipList = velaPage ? $('#battyClipList') : null;
const buildPanel = velaPage ? $('#battyBuildPanel') : null;
const buildKey = 'countdesk-show-me-build-v1';
let selectedClipId = '';
let activeBuildId = '';
let buildPoll = null;
let marketReadPending = false;
let readMarketProgressCard = null;
function updateReadMarketProgress(text, stateName='working'){
  if(!readMarketProgressCard){
    const card=document.createElement('article');card.className='agent-activity-card read-market-chat-progress';
    const head=document.createElement('strong');head.textContent='CLEO · READ THE MARKET';
    const body=document.createElement('p');body.setAttribute('role','status');body.setAttribute('aria-live','polite');
    const note=document.createElement('small');note.textContent='Public workflow stages and returned findings are shown; private chain-of-thought is not displayed.';
    card.append(head,body,note);agentActivityCards.append(card);readMarketProgressCard={card,body};
  }
  readMarketProgressCard.body.textContent=text;
  readMarketProgressCard.card.dataset.state=stateName;
}
let selectedFiles = [];
let sharedScreenStream = null;
let sharedScreenVideo = null;
let recentSupportEvents = [];
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
  const view={tab:'Count Desk', symbol:$('#symbol')?.value || '', timeframe:$('#timeframe')?.value || '30M', cutoff};
  const readContext=marketReadPending?window.countDeskMarketReadContext:null;
  if(readContext?.schema==='countdesk.market-read-context.v1')Object.assign(view,{symbol:readContext.symbol,timeframe:readContext.timeframe,cutoff:readContext.cutoff,readMarket:true,readMarketCapturedAt:readContext.capturedAt,readMarketSource:readContext.source,readMarketFrames:readContext.frames});
  return view;
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
  if (/market research|finance news|newspaper|morning (market )?brief|close (market )?brief|market landscape|news (channel|feed)/i.test(prompt)) return ['batty', 'market_research_reporter'];
  const chartIntent = /chart|wave|count|market|setup|level|price|bias|trend|fibonacci|liquidity|structure|trade idea/i.test(prompt);
  return chartIntent ? ['batty', 'cleo'] : ['batty'];
}

function renderAgentActivity({participants=['batty'],working=false,prompt='',response='',startedAt=null}={}){
  agentActivity={participants,working,prompt,response,startedAt};
  readMarketProgressCard=null;
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
    const name=document.createElement('strong');name.textContent=source?.querySelector('.agent-seat-copy strong')?.textContent||({batty:'Batty',cleo:'Cleo',market_research_reporter:'Market Research Reporter'}[id]||id);
    const lamp=document.createElement('i');lamp.className='agent-activity-lamp';lamp.setAttribute('aria-hidden','true');
    head.append(avatarWrap,name,lamp);
    const task=document.createElement('div');task.className='agent-activity-task';
    task.textContent=working
      ? (id==='market_research_reporter' ? 'handoff requested; dispatch unconfirmed' : 'working on your request')
      : (startedAt ? (id==='market_research_reporter' ? 'reporter result returned' : 'reply complete') : 'ready to talk');
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

const allowedAttachmentExtensions = new Set(['txt','md','csv','tsv','json','jsonl','yaml','yml','toml','ini','log','pdf','docx','xlsx','pptx','py','js','ts','tsx','jsx','css','html','xml','sql','sh','pine','svg','png','jpg','jpeg','webp','gif']);
const maxAttachmentBytes = 8 * 1024 * 1024;
const maxAttachmentsBytes = 12 * 1024 * 1024;

function renderAttachments() {
  attachmentList.replaceChildren();
  selectedFiles.forEach((file, index) => {
    const chip = document.createElement('span');
    chip.className = 'batty-attachment-chip';
    const label = document.createElement('span');
    label.textContent = `${file.name} · ${Math.max(1, Math.ceil(file.size / 1024))} KB`;
    const remove = document.createElement('button');
    remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', `Remove ${file.name}`);
    remove.addEventListener('click', () => { selectedFiles.splice(index, 1); renderAttachments(); });
    chip.append(label, remove); attachmentList.append(chip);
  });
}

function addAttachments(files) {
  const next = [...selectedFiles];
  for (const file of files) {
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    if (!allowedAttachmentExtensions.has(extension)) { attachmentStatus.textContent = `${file.name}: unsupported file type.`; continue; }
    if (!file.size || file.size > maxAttachmentBytes) { attachmentStatus.textContent = `${file.name}: files must be 8 MB or smaller.`; continue; }
    if (next.some(item => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) continue;
    if (next.length >= 8) { attachmentStatus.textContent = 'Attach up to 8 files per message.'; break; }
    next.push(file);
  }
  if (next.reduce((sum, file) => sum + file.size, 0) > maxAttachmentsBytes) {
    attachmentStatus.textContent = 'Attachments must total 12 MB or less per message.';
  } else {
    selectedFiles = next; attachmentStatus.textContent = selectedFiles.length ? 'Attachments are temporary and are deleted after a successful turn.' : 'Files are sent only with your next question.';
  }
  fileInput.value = '';
  renderAttachments();
}

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function renderShowMeBuild(report) {
  if (!buildPanel) return;
  buildPanel.hidden = false;
  buildPanel.replaceChildren();
  const heading = document.createElement('strong');
  heading.textContent = `Codex build · ${report.status}`;
  const detail = document.createElement('p');
  detail.textContent = `${report.clipId || ''} · ${report.model || ''} · ${report.id || ''}`;
  buildPanel.append(heading, detail);
  if (report.summary) {
    const summary = document.createElement('pre');
    summary.textContent = report.summary;
    buildPanel.append(summary);
  }
  if (report.changedFiles?.length) {
    const files = document.createElement('small');
    files.textContent = `Changed: ${report.changedFiles.join(', ')}`;
    buildPanel.append(files);
  }
  if (report.error) {
    const error = document.createElement('p');
    error.className = 'batty-build-error';
    error.textContent = report.error;
    buildPanel.append(error);
  }
}

async function refreshShowMeBuild() {
  if (!activeBuildId) return;
  try {
    const response = await fetch(`${chatApiBase}/api/show-me/builds/${activeBuildId}`, {cache:'no-store'});
    const report = await response.json();
    if (!response.ok) throw new Error(report.error || 'Could not read the coding run.');
    renderShowMeBuild(report);
    if (!['queued', 'running'].includes(report.status)) {
      clearInterval(buildPoll); buildPoll = null; activeBuildId = '';
    }
  } catch (error) {
    clearInterval(buildPoll); buildPoll = null; activeBuildId = '';
    try { localStorage.removeItem(buildKey); } catch (_) {}
    renderShowMeBuild({status:'unavailable', error:error.message});
  }
}

async function buildFromShowMe() {
  if (!selectedClipId || activeBuildId) return;
  const prompt = input.value.trim();
  if (!prompt) {
    renderShowMeBuild({status:'needs a request', clipId:selectedClipId,
      error:'Describe the change to build in the message box first.'});
    input.focus();
    return;
  }
  const clipId = selectedClipId;
  renderShowMeBuild({status:'starting', clipId});
  try {
    const response = await fetch(`${chatApiBase}/api/show-me/builds`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({clipId, prompt, model:modelPicker.value, effort:effortPicker.value}),
    });
    const report = await response.json();
    if (!response.ok) throw new Error(report.error || `Could not start build (${response.status}).`);
    activeBuildId = report.id;
    try { localStorage.setItem(buildKey, activeBuildId); } catch (_) {}
    input.value = '';
    renderShowMeBuild(report);
    buildPoll = setInterval(refreshShowMeBuild, 3000);
    void refreshShowMeBuild();
  } catch (error) {
    renderShowMeBuild({status:'failed to start', clipId, error:error.message});
  }
}

function selectShowMeClip(clip) {
  selectedClipId = clip.id;
  const selected = $('#battySelectedClip');
  selected.hidden = false;
  selected.replaceChildren();
  const label = document.createElement('span');
  label.textContent = `📹 ${clip.title} · v${clip.version} · visual frames ready`;
  const remove = document.createElement('button');
  remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', 'Remove Show Me clip');
  remove.addEventListener('click', () => { selectedClipId = ''; selected.hidden = true; });
  const build = document.createElement('button');
  build.type = 'button'; build.className = 'batty-build-button';
  build.textContent = 'Build with Codex';
  build.title = 'Run a local Codex coding turn using these frames and your request';
  build.addEventListener('click', buildFromShowMe);
  selected.append(label, build, remove);
  $('#battyClipPreview').src = clip.videoUrl;
  $('#battyClipPreview').hidden = false;
  $('#battyClipDownload').href = clip.videoUrl;
  $('#battyClipDownload').download = `${clip.id}.${clip.mimeType === 'video/mp4' ? 'mp4' : 'webm'}`;
  $('#battyClipDownload').hidden = false;
  $('#battyClipStatus').textContent = `${clip.id} selected. Write a request, then send for review or Build with Codex.`;
  clipPanel.hidden = true;
  clipButton.setAttribute('aria-expanded', 'false');
  input.focus();
}

async function loadShowMeClips() {
  if (!clipList) return;
  clipList.textContent = 'Loading Recent…';
  try {
    const response = await fetch(`${chatApiBase}/api/show-me/clips`, {cache:'no-store'});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load clips.');
    clipList.replaceChildren();
    if (!result.clips.length) { clipList.textContent = 'No clips yet. Use Show Me in the chart header.'; return; }
    for (const clip of result.clips) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'batty-clip-choice';
      const title = document.createElement('strong'); title.textContent = `${clip.title} · v${clip.version}`;
      const detail = document.createElement('small');
      detail.textContent = `${new Date(clip.createdAt).toLocaleString()} · ${Math.ceil(clip.durationMs / 1000)}s · ${clip.frameCount} frames`;
      button.append(title, detail);
      button.addEventListener('click', () => selectShowMeClip(clip));
      clipList.append(button);
    }
  } catch (error) { clipList.textContent = error.message; }
}

if (clipButton) {
  try {
    const savedBuild = localStorage.getItem(buildKey);
    if (/^build-[0-9a-f]{16}$/.test(savedBuild || '')) {
      activeBuildId = savedBuild;
      buildPoll = setInterval(refreshShowMeBuild, 3000);
      void refreshShowMeBuild();
    }
  } catch (_) { /* Local storage may be disabled. */ }
  clipButton.addEventListener('click', () => {
    clipPanel.hidden = !clipPanel.hidden;
    clipButton.setAttribute('aria-expanded', String(!clipPanel.hidden));
    if (!clipPanel.hidden) void loadShowMeClips();
  });
  $('#battyClipClose').addEventListener('click', () => { clipPanel.hidden = true; clipButton.setAttribute('aria-expanded','false'); });
  document.addEventListener('countdesk:show-me-select', async event => {
    await loadShowMeClips();
    const response = await fetch(`${chatApiBase}/api/show-me/clips`, {cache:'no-store'});
    const result = await response.json();
    const clip = result.clips?.find(item => item.id === event.detail.id);
    if (clip) selectShowMeClip(clip);
  });
}

function showScreenShare(active, message = '') {
  shareScreenButton.textContent = active ? 'Stop sharing' : 'Share tab';
  shareScreenButton.setAttribute('aria-pressed', String(active));
  shareScreenButton.classList.toggle('is-sharing', active);
  shareStatus.textContent = message || (active ? 'LIVE · screenshot on send' : 'Screenshot off');
}

function stopScreenShare(message = '') {
  const stream = sharedScreenStream;
  sharedScreenStream = null;
  if (sharedScreenVideo) { sharedScreenVideo.srcObject = null; sharedScreenVideo.remove(); sharedScreenVideo = null; }
  stream?.getTracks().forEach(track => track.stop());
  showScreenShare(false, message);
}

async function startScreenShare() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    showScreenShare(false, 'Tab sharing is unavailable here.');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({video:{frameRate:5}, audio:false, preferCurrentTab:true});
    const displaySurface = stream.getVideoTracks()[0]?.getSettings?.().displaySurface;
    if (displaySurface !== 'browser') {
      stream.getTracks().forEach(track => track.stop());
      showScreenShare(false, 'This browser could not confirm a browser tab. Choose a supported browser tab share.');
      return;
    }
    const video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.srcObject = stream;
    video.style.cssText = 'position:fixed;width:1px;height:1px;left:-10px;top:-10px;opacity:0;pointer-events:none';
    document.body.append(video);
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('The shared tab video could not be opened.'));
      setTimeout(() => reject(new Error('Timed out waiting for the shared tab.')), 5000);
    });
    await video.play();
    sharedScreenStream = stream; sharedScreenVideo = video;
    stream.getVideoTracks()[0]?.addEventListener('ended', () => stopScreenShare('Sharing stopped by browser.'));
    showScreenShare(true, 'LIVE · screenshot on send');
  } catch (error) {
    showScreenShare(false, error.name === 'NotAllowedError' ? 'Sharing was not started.' : 'Could not start tab sharing.');
  }
}

async function captureSharedScreenshot() {
  if (!sharedScreenStream || !sharedScreenVideo) return '';
  try {
    const video = sharedScreenVideo;
    const scale = Math.min(1, 1440 / (video.videoWidth || 1440));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((video.videoWidth || 1280) * scale));
    canvas.height = Math.max(1, Math.round((video.videoHeight || 720) * scale));
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    let image = canvas.toDataURL('image/jpeg', .72);
    if (image.length > 3_800_000) {
      canvas.width = Math.round(canvas.width * .72); canvas.height = Math.round(canvas.height * .72);
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      image = canvas.toDataURL('image/jpeg', .55);
    }
    return image;
  } catch {
    showScreenShare(true, 'LIVE · screenshot capture failed');
    return '';
  }
}

async function loadSupportEvents() {
  supportNote.textContent = 'Loading local diagnostics…';
  supportEvents.replaceChildren();
  try {
    const response = await fetch(`${chatApiBase}/api/chat/support-log?limit=100`, {cache:'no-store'});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Support log is unavailable.');
    recentSupportEvents = Array.isArray(result.events) ? result.events : [];
    supportNote.textContent = `${recentSupportEvents.length} recent events · local only · prompts, screenshots, and file contents excluded.`;
    if (!recentSupportEvents.length) {
      const empty = document.createElement('p'); empty.className = 'batty-support-empty';
      empty.textContent = 'No chat requests have been logged yet.'; supportEvents.append(empty); return;
    }
    for (const item of recentSupportEvents) {
      const card = document.createElement('article'); card.className = `batty-support-event is-${item.status || 'unknown'}`;
      const head = document.createElement('div'); head.className = 'batty-support-event-head';
      const resultLabel = document.createElement('strong'); resultLabel.textContent = `${item.event === 'api_call' ? 'API' : 'CHAT'} · ${item.status || 'UNKNOWN'} · ${item.httpStatus ?? '—'}`;
      const timeLabel = document.createElement('time'); timeLabel.textContent = formatTimestamp(item.timestamp); head.append(resultLabel, timeLabel);
      const id = document.createElement('code'); id.textContent = item.requestId || 'request ID unavailable';
      const details = document.createElement('p');
      details.textContent = item.event === 'api_call'
        ? [item.method, item.endpoint, `${item.durationMs || 0} ms`].filter(Boolean).join(' · ')
        : [item.model, item.effort, item.activeTab, item.symbol, item.timeframe, `${item.durationMs || 0} ms`].filter(Boolean).join(' · ');
      const calls = document.createElement('p'); calls.textContent = item.calls?.length ? `Calls: ${item.calls.join(', ')}` : 'No provider tool calls recorded.';
      card.append(head, id, details, calls);
      if (item.error) { const error = document.createElement('p'); error.className = 'batty-support-error'; error.textContent = `${item.errorCode || 'ERROR'} · ${item.error}`; card.append(error); }
      if (item.attachmentCount) { const attachments = document.createElement('p'); attachments.textContent = `${item.attachmentCount} attachment(s) · ${item.attachmentTypes.join(', ')}${item.screenshotIncluded ? ' · screenshot' : ''}`; card.append(attachments); }
      supportEvents.append(card);
    }
  } catch (error) {
    supportNote.textContent = error.message || 'Support log is unavailable.';
  }
}

function exportSupportEvents() {
  const blob = new Blob([JSON.stringify({exportedAt:new Date().toISOString(),redacted:true,events:recentSupportEvents}, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `batty-support-${new Date().toISOString().slice(0,10)}.json`;
  anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function reply(prompt) {
  const context = activeContext();
  const view=activeView();
  const readMarketMode=view.readMarket===true;
  marketReadPending=false;
  const participants=participantsFor(prompt);
  let completedParticipants=['batty'];
  let readMarketAnswerReturned=false;
  const startedAt=Date.now();
  const requestId = globalThis.crypto?.randomUUID?.() || `turn-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
  renderAgentActivity({participants,working:true,prompt,response:'',startedAt});
  const userTimestamp = new Date().toISOString();
  const evidenceLabels = [];
  const clipIdForTurn = selectedClipId;
  if (selectedFiles.length) evidenceLabels.push(`${selectedFiles.length} file(s)`);
  if (clipIdForTurn) evidenceLabels.push(`Show Me ${clipIdForTurn}`);
  if (sharedScreenStream) evidenceLabels.push('tab screenshot on send');
  addMessage('user', prompt, `YOU · ${formatTimestamp(userTimestamp)}${evidenceLabels.length ? ` · ${evidenceLabels.join(' · ')}` : ''}`);
  const progress = addMessage('progress', readMarketMode ? `Cleo is reviewing ${view.readMarketFrames?.filter(frame=>frame.status==='available').length||0} available timeframe snapshots for the four requested analyses…` : participants.includes('market_research_reporter') ? 'Batty is checking the indicator and attempting a Market Research Reporter handoff…' : `Batty is checking your request and routing chart analysis to Cleo when needed…`);
  if(readMarketMode)updateReadMarketProgress(`Snapshot sent · ${view.readMarketFrames?.filter(frame=>frame.status==='available').length||0}/10 intervals available · Cleo’s four-part review is underway.`);
  icon.classList.add('working');
  status.textContent = readMarketMode ? 'Sending the multi-timeframe snapshot to Cleo' : 'Understanding and routing your request';
  sendButton.disabled = true;
  recentButton.disabled = true;
  newChatButton.disabled = true;
  attachButton.disabled = true;
  if (clipButton) clipButton.disabled = true;
  shareScreenButton.disabled = true;
  recentPanel.hidden = true;
  recentButton.setAttribute('aria-expanded','false');
  try {
    chatHistory.push({role:'user', content:prompt, timestamp:userTimestamp});
    persistChatHistory();
    const screenshot = await captureSharedScreenshot();
    const attachments = await Promise.all(selectedFiles.map(async file => ({name:file.name,type:file.type,data:await fileAsDataUrl(file)})));
    const fileCount = attachments.length;
    if (sharedScreenStream && !screenshot) shareStatus.textContent = 'LIVE · screenshot capture failed';
    const response = await fetch(`${chatApiBase}/api/chat`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        requestId,
        model:modelPicker.value,
        effort:effortPicker.value,
        context:context.label,
        view,
        messages:chatHistory.slice(-24).map(({role,content}) => ({role,content})),
        attachments,
        screenshot,
        ...(clipIdForTurn ? {showMeClipId:clipIdForTurn} : {}),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Chat request failed (${response.status}).`);
    selectedFiles = [];
    if (selectedClipId === clipIdForTurn && clipIdForTurn) {
      selectedClipId = '';
      $('#battySelectedClip').hidden = true;
      $('#battyClipPreview').hidden = true;
      $('#battyClipPreview').removeAttribute('src');
    }
    renderAttachments();
    attachmentStatus.textContent = 'Files are sent only with your next question.';
    if (fileCount) attachmentStatus.textContent = `${fileCount} file(s) sent and removed from the composer.`;
    if (Array.isArray(result.specialists) && result.specialists.includes('cleo')) {
      completedParticipants=['batty','cleo'];
      readMarketAnswerReturned=true;
    }
    if (Array.isArray(result.specialists) && result.specialists.includes('market_research_reporter')) completedParticipants=['batty','market_research_reporter'];
    const assistantTimestamp = new Date().toISOString();
    let visibleAnswer=String(result.text||'');
    if(readMarketMode&&completedParticipants.includes('cleo')){
      const match=visibleAnswer.match(/<!--\s*CLEO_MARKET_READ_START\s*-->([\s\S]*?)<!--\s*CLEO_MARKET_READ_END\s*-->/i);
      if(match){
        try{const marketRead=JSON.parse(match[1].trim());document.dispatchEvent(new CustomEvent('countdesk:market-read-result',{detail:marketRead}));visibleAnswer=visibleAnswer.replace(match[0],'').trim();}catch{}
      }
    }
    const assistantMessage = {
      role:'assistant', content:visibleAnswer, timestamp:assistantTimestamp,
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
    const answer = visibleAnswer;
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
    meta.textContent = `${modelPicker.selectedOptions[0].textContent} · ${formatTimestamp(assistantTimestamp)}${completedParticipants.includes('cleo')?' · Cleo delegated':''}${completedParticipants.includes('market_research_reporter')?' · Market Research Reporter delegated':''}${result.requestId ? ` · ${result.requestId}` : ` · ${requestId}`}`;
    message.append(meta);
    if (completedParticipants.includes('cleo')) updateCleoReportAlarm();
    progress.querySelector('p').textContent = readMarketMode&&completedParticipants.includes('cleo')
      ? '✓ Cleo completed the four-part review · chart marks were checked against the active source'
      : completedParticipants.includes('cleo')
      ? '✓ Cleo returned analysis · Batty relayed it'
      : completedParticipants.includes('market_research_reporter')
        ? '✓ Market Research Reporter returned findings · Batty relayed them'
        : participants.includes('market_research_reporter')
          ? 'Reporter handoff unconfirmed · no sourced edition issued'
          : '✓ Batty replied · chart-specialist findings are attributed when returned';
    progress.classList.add('complete');
    loadSupportEvents();
  } catch (error) {
    const errorText = error.message || 'OpenAI could not answer this request.';
    const errorTimestamp = new Date().toISOString();
    chatHistory.push({role:'assistant',content:errorText,timestamp:errorTimestamp,error:true});
    persistChatHistory();
    const message = addMessage('assistant', errorText, `BATTY · ${formatTimestamp(errorTimestamp)}`);
    message.classList.add('batty-message-error');
    progress.querySelector('p').textContent = 'Codex connection needs attention';
    progress.classList.add('failed');
    loadSupportEvents();
    if (/not signed in|Codex is unavailable/i.test(error.message || '')) {
      providerBadge.textContent = 'SETUP NEEDED';
      providerBadge.classList.add('is-disconnected');
    providerNote.textContent = 'Sign in to Codex with ChatGPT, then restart the Count Desk.';
    }
  } finally {
    if(readMarketMode){window.countDeskMarketReadContext=null;updateReadMarketProgress(readMarketAnswerReturned?'Cleo returned the review; see the four chart boxes for the section summaries.':'The request ended without a confirmed Cleo result. Check the chat response and retry if needed.',readMarketAnswerReturned?'complete':'failed');document.dispatchEvent(new CustomEvent('countdesk:read-market-finished'));}
    icon.classList.remove('working');
    status.textContent = 'Ready when you are';
    renderAgentActivity({participants:completedParticipants,working:false,startedAt});
    sendButton.disabled = false;
    recentButton.disabled = false;
    newChatButton.disabled = false;
    attachButton.disabled = false;
    if (clipButton) clipButton.disabled = false;
    shareScreenButton.disabled = false;
    input.focus();
  }
}

function submit(prompt) {
  const value = prompt.trim();
  if ((!value && !selectedFiles.length && !selectedClipId && !sharedScreenStream) || sendButton.disabled) return;
  input.value = '';
  $('.batty-quick-prompts')?.remove();
  reply(value || (selectedClipId ? 'Review the sampled frames from this Show Me clip. Describe what is visible and propose the next build steps.' : 'Please review the attached file or shared dashboard screenshot and tell me what you see.'));
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
  for (const [index,item] of chatHistory.entries()) {
    const roleLabel = item.role === 'user' ? 'YOU' : (item.model || 'BATTY');
    const specialistLabel = item.specialists?.includes('cleo') ? ' · Cleo delegated' : item.specialists?.includes('market_research_reporter') ? ' · Market Research Reporter delegated' : '';
    const precedingUser = chatHistory.slice(0,index).reverse().find(message=>message.role==='user');
    const unconfirmedReporterReply = item.role==='assistant' && precedingUser && participantsFor(precedingUser.content).includes('market_research_reporter') && !item.specialists?.includes('market_research_reporter');
    const displayedContent = unconfirmedReporterReply
      ? 'Reporter handoff was not confirmed for this reply. Do not treat it as a sourced Market Research edition; no report was issued.'
      : item.content;
    const message = addMessage(item.role, displayedContent, `${roleLabel} · ${formatTimestamp(item.timestamp)}${specialistLabel}`);
    if (item.role === 'assistant' && !item.error && item.specialists?.includes('cleo')) message.id = cleoReportId(item);
    if (item.role === 'assistant' && !unconfirmedReporterReply) renderSourceLinks(message.querySelector('p'), item.content);
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
supportButton.addEventListener('click', () => {
  const opening = supportPanel.hidden;
  supportPanel.hidden = !opening;
  supportButton.setAttribute('aria-expanded', String(opening));
  recentPanel.hidden = true; recentButton.setAttribute('aria-expanded','false');
  if (opening) loadSupportEvents();
});
supportClose.addEventListener('click', () => {
  supportPanel.hidden = true; supportButton.setAttribute('aria-expanded','false'); supportButton.focus();
});
supportRefresh.addEventListener('click', loadSupportEvents);
supportExport.addEventListener('click', exportSupportEvents);
attachButton.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => addAttachments([...fileInput.files]));
shareScreenButton.addEventListener('click', () => sharedScreenStream ? stopScreenShare() : startScreenShare());
form.addEventListener('dragover', event => { event.preventDefault(); form.classList.add('is-drop-target'); });
form.addEventListener('dragleave', event => { if (!form.contains(event.relatedTarget)) form.classList.remove('is-drop-target'); });
form.addEventListener('drop', event => {
  event.preventDefault(); form.classList.remove('is-drop-target');
  if (event.dataTransfer?.files?.length) addAttachments([...event.dataTransfer.files]);
});
addEventListener('beforeunload', () => sharedScreenStream?.getTracks().forEach(track => track.stop()));
document.addEventListener('click', event => {
  if (!recentPanel.hidden && !dock.contains(event.target)) {
    recentPanel.hidden = true;
    recentButton.setAttribute('aria-expanded','false');
  }
  if (!supportPanel.hidden && !dock.contains(event.target)) {
    supportPanel.hidden = true;
    supportButton.setAttribute('aria-expanded','false');
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !supportPanel.hidden) {
    supportPanel.hidden = true;
    supportButton.setAttribute('aria-expanded','false');
    supportButton.focus();
  }
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
document.addEventListener('countdesk:open-chat',()=>{if(main.classList.contains('chat-collapsed'))$('#toggleChat')?.click();});
document.addEventListener('countdesk:read-market-progress',event=>{
  const detail=event.detail||{};
  if(detail.stage==='collecting')updateReadMarketProgress(`Collecting stored chart snapshots · ${detail.completed||0}/${detail.total||10} intervals checked · ${detail.symbol||'market'}`);
  else if(detail.stage==='analyzing')updateReadMarketProgress(`Snapshot ready · ${detail.available||0}/${detail.total||10} intervals available · Cleo is reviewing the four requested sections.`);
});
document.addEventListener('countdesk:read-market',event=>{
  if(!event.detail?.symbol||!window.countDeskMarketReadContext?.frames?.length)return;
  marketReadPending=true;
  updateReadMarketProgress(`Snapshot sent · ${event.detail.available||0}/10 intervals available · Cleo’s four-part review is underway.`);
  input.value='Read the active market using all supplied Daily, 4H, 2H, 1H, 30M, 15M, 5M, 3M, 2M, and 1M snapshots. Return four concise analyses: Market Sentiment & Market Bias; Reading the Liquidity Levels; Elliott Wave, Trend Change & Fibonacci; Relative Volume & Divergence. Draw only supported, source-anchored marks on the active chart, identify missing data/studies, finish with a short Final Recommendation, and label all interpretations as provisional research.';
  updateContext();input.focus();submit(input.value);
});
addEventListener('countdesk:ask-market-research-reporter', event => {
  const prompt = String(event.detail?.prompt || '').trim();
  if (!prompt) return;
  input.value = prompt;
  submit(prompt);
  input.focus();
});
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
