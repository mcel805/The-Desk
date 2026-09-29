const body = document.body;
const textSizes = {small:0.88, default:1, large:1.2};
function setTextSize(size) {
  if (!(size in textSizes)) size = 'default';
  body.style.setProperty('--desk-text-scale', textSizes[size]);
  document.querySelectorAll('[data-text-size]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.textSize === size)));
  try { localStorage.setItem('countdesk-text-size', size); } catch {}
}
let savedSize = 'default';
try { savedSize = localStorage.getItem('countdesk-text-size') || 'default'; } catch {}
setTextSize(savedSize);
document.querySelectorAll('[data-text-size]').forEach(button => button.addEventListener('click', () => setTextSize(button.dataset.textSize)));
const chartToolbar = document.querySelector('.desk-chart-toolbar');
new ResizeObserver(() => {
  body.style.setProperty('--desk-toolbar-height', `${chartToolbar.offsetHeight + 4}px`);
}).observe(chartToolbar);
const collapse = document.querySelector('#deskCollapse');
try { body.classList.toggle('desk-nav-collapsed', localStorage.getItem('countdesk-nav-collapsed') === '1'); } catch {}
function updateNav() {
  const collapsed = body.classList.contains('desk-nav-collapsed');
  collapse.setAttribute('aria-expanded', String(!collapsed));
  collapse.setAttribute('aria-label', collapsed ? 'Expand navigation' : 'Collapse navigation');
}
updateNav();
collapse.addEventListener('click', () => {
  body.classList.toggle('desk-nav-collapsed');
  updateNav();
  try { localStorage.setItem('countdesk-nav-collapsed', body.classList.contains('desk-nav-collapsed') ? '1' : '0'); } catch {}
});
const drawers = {studies:'#deskStudies', replay:'#deskReplay', connections:'#deskConnections', context:'#cleoBriefing'};
function closeDrawers() {
  for (const selector of Object.values(drawers)) document.querySelector(selector).hidden = true;
  document.querySelectorAll('[data-drawer]').forEach(button => button.setAttribute('aria-expanded','false'));
}
document.querySelectorAll('[data-drawer]').forEach(button => button.addEventListener('click', () => {
  const drawer = document.querySelector(drawers[button.dataset.drawer]);
  const opening = drawer.hidden;
  closeDrawers();
  drawer.hidden = !opening;
  if (drawer.tagName === 'DETAILS') drawer.open = opening;
  button.setAttribute('aria-expanded', String(opening));
}));
addEventListener('keydown', event => { if (event.key === 'Escape') closeDrawers(); });
const ask = document.querySelector('#velaAskCleo');
ask.textContent = 'Ask Cleo about this chart';
ask.addEventListener('click', event => {
  event.preventDefault();
  const prompt = new URL(ask.href).searchParams.get('cleoPrompt');
  const input = document.querySelector('#battyChatInput');
  input.value = prompt || 'Read this chart with its active studies and stored cutoff.';
  closeDrawers();
  input.focus();
});
