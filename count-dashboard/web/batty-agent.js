const $ = (selector, root = document) => root.querySelector(selector);
const main = $('main');
const journalPage = document.body.classList.contains('trade-journal-page');
const resourcesPage = document.body.classList.contains('resources-page');
const liquidityLabPage = document.body.classList.contains('liquidity-lab-page');
const pageLabel = journalPage ? 'Trading Journal' : resourcesPage ? 'Resources' : liquidityLabPage ? 'Liquidity Lab' : 'Count Desk';
const chatApiBase = document.body.dataset.chatApi || '';
const content = document.createElement('div');
content.className = 'batty-page-content';
while (main.firstChild) content.append(main.firstChild);

const dock = document.createElement('aside');
dock.className = 'batty-dock';
dock.setAttribute('aria-label', 'Batty agent chat');
dock.innerHTML = `
  <header class="batty-chat-head">
    <div class="batty-chat-identity">
      <span class="batty-chat-icon" id="battyChatIcon" aria-hidden="true">B</span>
      <div><strong>Batty</strong><small>FIRSTMATE · TRADING DESK</small></div>
    </div>
    <span class="batty-chat-menu" aria-hidden="true">···</span>
  </header>
  <section id="agentActivity" class="agent-activity" aria-label="Agent team activity">
    <div class="agent-activity-heading">
      <div><small>TEAM ON DECK</small><strong><i></i><span id="battyChatStatus">Ready when you are</span></strong></div>
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

main.classList.add('batty-main');
main.append(content, dock);

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
const agentActivityCards = $('#agentActivityCards');
const agentTaskDescriptions = {
  batty:'reading your request', cfo:'coordinating research handoffs', scientist:'ranking forecast evidence',
  'lead-researcher':'checking dated sources', analyst:'checking source evidence',
  'chart-technician':'mapping wave scenarios', reviewer:'checking rules evidence',
  paper:'tracking paper outcomes', outcome:'measuring scenario results',
};
let chatHistory = [];
let agentActivity = {participants:['batty'],startedAt:null,prompt:'',response:'',working:false};
let agentActivityTicker = null;

function activeContext() {
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
  if (liquidityLabPage) return {tab:'Liquidity Lab', selection:$('.batty-page-content')?.innerText?.slice(0,6000) || 'Liquidity Lab'};
  if (journalPage) {
    const selected = id => $(`#${id}`)?.selectedOptions?.[0]?.textContent?.trim() || '';
    return {tab:'Trading Journal', selection:[selected('filterTeam'),selected('filterMember'),selected('filterAccount')].filter(Boolean).join(' · ')};
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

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function participantsFor() { return ['batty']; }

function estimateLocalTokens(agentId) {
  const activity=agentActivity;
  const roleText=agentId==='batty'
    ? `${activity.prompt} ${activity.response}`
    : `${activity.prompt} ${agentTaskDescriptions[agentId]||''}`;
  return roleText.trim()?Math.ceil(roleText.trim().split(/\s+/).length*1.3):0;
}

function updateAgentActivityMetrics() {
  const seconds=agentActivity.startedAt?Math.max(0,Math.floor((Date.now()-agentActivity.startedAt)/1000)):0;
  for(const card of agentActivityCards.querySelectorAll('[data-activity-agent]')){
    const id=card.dataset.activityAgent;
    const time=card.querySelector('[data-task-time]');
    const tokens=card.querySelector('[data-task-tokens]');
    if(time)time.textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
    if(tokens)tokens.textContent=String(estimateLocalTokens(id));
  }
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
    const task=document.createElement('div');task.className='agent-activity-task';task.textContent=working?(agentTaskDescriptions[id]||'supporting this task'):(startedAt?'preview task complete':'ready for tasks');
    const metrics=document.createElement('div');metrics.className='agent-activity-metrics';
    const time=document.createElement('span');time.innerHTML='<b data-task-time>00:00</b> time';
    const tokens=document.createElement('span');tokens.innerHTML='<b data-task-tokens>0</b> est. tok';
    metrics.append(time,tokens);card.append(head,task,metrics);agentActivityCards.append(card);
  }
  $('#agentActivity').classList.toggle('is-working',working);
  if(agentActivityTicker){clearInterval(agentActivityTicker);agentActivityTicker=null;}
  updateAgentActivityMetrics();
  if(working)agentActivityTicker=setInterval(updateAgentActivityMetrics,1000);
}

async function reply(prompt) {
  const context = activeContext();
  const participants=participantsFor(prompt);
  const startedAt=Date.now();
  renderAgentActivity({participants,working:true,prompt,response:'',startedAt});
  addMessage('user', prompt, 'YOU · just now');
  const progress = addMessage('progress', `Reading ${context.detail}, then asking your selected model…`);
  icon.classList.add('working');
  status.textContent = 'Working on your question';
  sendButton.disabled = true;
  try {
    chatHistory.push({role:'user', content:prompt});
    const response = await fetch(`${chatApiBase}/api/chat`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        model:modelPicker.value,
        effort:effortPicker.value,
        context:context.label,
        view:activeView(),
        messages:chatHistory.slice(-24),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Chat request failed (${response.status}).`);
    chatHistory.push({role:'assistant', content:result.text});
    status.textContent = 'Writing this up in desk language';
    progress.querySelector('p').textContent = 'Putting the answer into trader terms…';
    const message = addMessage('assistant', '');
    const paragraph = message.querySelector('p');
    const answer = result.text;
    const stride = reducedMotion ? answer.length : Math.max(1, Math.ceil(answer.length / 120));
    for (let index = 0; index < answer.length; index += stride) {
      paragraph.textContent = answer.slice(0, index + stride);
      agentActivity.response=paragraph.textContent;
      stream.scrollTop = stream.scrollHeight;
      await wait(reducedMotion ? 0 : 14);
    }
    message.querySelector('small')?.remove();
    const meta = document.createElement('small');
    meta.textContent = `${modelPicker.selectedOptions[0].textContent} · Codex / ChatGPT`;
    message.append(meta);
    progress.querySelector('p').textContent = '✓ Batty reply received · local chart snapshot attached when available';
    progress.classList.add('complete');
  } catch (error) {
    chatHistory.pop();
    const message = addMessage('assistant', error.message || 'OpenAI could not answer this request.');
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
    renderAgentActivity({participants:['batty'],working:false});
    sendButton.disabled = false;
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

const welcome = addMessage('assistant', 'Hey Mark. I’m following your active tab. Ask away; I’ll assume you mean this view unless you point me somewhere else.', 'BATTY · your desk partner');
const contextNote = document.createElement('article');
contextNote.className = 'batty-insight welcome-insight';
contextNote.innerHTML = `<strong>ACTIVE CONTEXT</strong><p id="battyWelcomeContext"></p>`;
stream.append(contextNote);
const quick = document.createElement('div');
quick.className = 'batty-quick-prompts';
quick.setAttribute('aria-label', 'Suggested prompts');
['What stands out here?', 'Teach me something', 'Any news affecting this market?'].forEach(prompt => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = prompt;
  button.addEventListener('click', () => submit(prompt));
  quick.append(button);
});
stream.append(quick);
updateContext();

async function loadChatConfig() {
  try {
    const response = await fetch(`${chatApiBase}/api/chat/config`);
    const config = await response.json();
    if (!response.ok) throw new Error(config.error || 'Codex status is unavailable.');
    if (config.configured) {
      providerBadge.textContent = 'CHATGPT CONNECTED';
      providerBadge.classList.remove('is-disconnected');
      providerNote.textContent = 'Using Codex with your ChatGPT sign-in · Firstmate crew dispatch is not connected yet.';
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
  mobileButton.textContent = showDashboard ? 'Back to Batty' : 'Open dashboard';
});
const apiState = $('#apiState,#journalApiState');
apiState?.before(mobileButton);

function updateMobileMode() {
  document.body.classList.toggle('batty-mobile', matchMedia('(max-width: 760px)').matches);
}
updateMobileMode();
addEventListener('resize', updateMobileMode);
