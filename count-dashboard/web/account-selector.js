const ACCOUNT_CONTEXT_KEY = 'count-desk-account-contexts-v1';
const MODES = [
  ['live-manual', 'Live - Manual'],
  ['simulation-manual', 'Simulation - Manual'],
  ['simulation-agentic', 'Simulation - Agentic'],
  ['live-agentic', 'Live - Agentic'],
];
const MODE_LABEL = Object.fromEntries(MODES);
const $ = selector => document.querySelector(selector);

function readSaved() {
  try {
    const value = JSON.parse(localStorage.getItem(ACCOUNT_CONTEXT_KEY) || '{}');
    return {
      profiles: Array.isArray(value.profiles) ? value.profiles.filter(item =>
        item && typeof item.id === 'string' && typeof item.name === 'string' && MODE_LABEL[item.mode]
      ).map(item => ({id:item.id, name:item.name, mode:item.mode, agent:String(item.agent || '')})) : [],
      simulation: value.simulation && typeof value.simulation === 'object' ? value.simulation : {},
      selectedId: typeof value.selectedId === 'string' ? value.selectedId : '',
    };
  } catch { return {profiles:[], simulation:{}, selectedId:''}; }
}

const saved = readSaved();
let simulationAccounts = [];
let editingId = '';

function entries() {
  const simulation = simulationAccounts.map(row => {
    const id = `sim:${row.account_id}`;
    const override = saved.simulation[id] || {};
    return {
      id, source:'Stored chart simulation',
      name:typeof override.name === 'string' && override.name.trim() ? override.name : row.name,
      mode:MODE_LABEL[override.mode] ? override.mode : 'simulation-manual',
      agent:typeof override.agent === 'string' ? override.agent : '',
    };
  });
  const order = Object.keys(MODE_LABEL);
  return [...simulation, ...saved.profiles.map(row => ({...row, source:'Browser entry'}))]
    .sort((a,b) => order.indexOf(a.mode) - order.indexOf(b.mode) || a.name.localeCompare(b.name));
}

function persist() {
  try {
    localStorage.setItem(ACCOUNT_CONTEXT_KEY, JSON.stringify(saved));
    return true;
  } catch {
    $('#accountSelectorStatus').textContent = 'Browser storage is unavailable; this change may not survive a reload.';
    return false;
  }
}

function labelAccount() {
  const all = entries();
  if (!all.some(row => row.id === saved.selectedId)) saved.selectedId = all[0]?.id || '';
  const selected = all.find(row => row.id === saved.selectedId);
  $('#activeAccountName').textContent = selected?.name || 'Choose an account';
  $('#activeAccountMode').textContent = selected ?
    `${MODE_LABEL[selected.mode]}${selected.agent ? ` · ${selected.agent}` : ''} · context only` : 'Local context only';
  $('#previousAccount').disabled = all.length < 2;
  $('#nextAccount').disabled = all.length < 2;
  $('#openAccountSelector').title = selected ? `${selected.name} · ${MODE_LABEL[selected.mode]} · chart label only` : 'Add a trading account context';
  window.dispatchEvent(new CustomEvent('count-desk-account-context-change', {detail:selected || null}));
}

function renderGroups() {
  const all = entries();
  const container = $('#accountGroups');
  container.replaceChildren();
  for (const [mode, title] of MODES) {
    const section = document.createElement('section');
    section.className = 'account-group';
    const heading = document.createElement('h3');
    heading.textContent = title;
    section.append(heading);
    const group = all.filter(row => row.mode === mode);
    if (!group.length) {
      const empty = document.createElement('p');
      empty.className = 'account-group-empty';
      empty.textContent = 'No accounts assigned';
      section.append(empty);
    }
    for (const row of group) {
      const item = document.createElement('div');
      item.className = 'account-group-item';
      const choose = document.createElement('button');
      choose.type = 'button';
      choose.className = 'account-choice';
      choose.dataset.accountId = row.id;
      choose.setAttribute('aria-pressed', String(row.id === saved.selectedId));
      const name = document.createElement('strong');
      name.textContent = row.name;
      const meta = document.createElement('small');
      meta.textContent = `${row.agent ? `${row.agent} · ` : ''}${row.source}`;
      choose.append(name, meta);
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'account-edit';
      edit.dataset.editAccountId = row.id;
      edit.textContent = 'Edit';
      edit.setAttribute('aria-label', `Edit ${row.name}`);
      item.append(choose, edit);
      section.append(item);
    }
    container.append(section);
  }
}

function render() {
  labelAccount();
  renderGroups();
}

function select(id) {
  if (!entries().some(row => row.id === id)) return;
  saved.selectedId = id;
  persist();
  render();
}

function resetForm() {
  editingId = '';
  $('#accountContextForm').reset();
  $('#accountFormTitle').textContent = 'Add account context';
  $('#saveAccountContext').textContent = 'Add account';
  $('#cancelAccountEdit').hidden = true;
  $('#deleteAccountContext').hidden = true;
  updateAgentRequirement();
}

function updateAgentRequirement() {
  const required = $('#newAccountMode').value.endsWith('agentic');
  $('#newAccountAgent').required = required;
  $('#agentNameRequirement').textContent = required ? '(required)' : '(optional)';
}

async function refreshSimulationAccounts() {
  try {
    const response = await fetch('/api/chart-sim/accounts');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    simulationAccounts = Array.isArray(payload.accounts) ? payload.accounts.filter(row =>
      typeof row.account_id === 'string' && typeof row.name === 'string') : [];
    render();
  } catch {
    $('#accountSelectorStatus').textContent = 'Stored simulation accounts are unavailable. Browser entries remain available.';
  }
}

$('#openAccountSelector').addEventListener('click', () => {
  renderGroups();
  $('#accountSelectorDialog').showModal();
  void refreshSimulationAccounts();
});
$('#closeAccountSelector').addEventListener('click', () => $('#accountSelectorDialog').close());
$('#accountSelectorDialog').addEventListener('click', event => {
  const choice = event.target.closest('[data-account-id]');
  if (choice) {
    select(choice.dataset.accountId);
    $('#accountSelectorDialog').close();
    return;
  }
  const edit = event.target.closest('[data-edit-account-id]');
  if (!edit) return;
  const row = entries().find(item => item.id === edit.dataset.editAccountId);
  if (!row) return;
  editingId = row.id;
  $('#newAccountName').value = row.name;
  $('#newAccountMode').value = row.mode;
  $('#newAccountAgent').value = row.agent;
  $('#accountFormTitle').textContent = 'Edit account context';
  $('#saveAccountContext').textContent = 'Save changes';
  $('#cancelAccountEdit').hidden = false;
  $('#deleteAccountContext').hidden = row.id.startsWith('sim:');
  updateAgentRequirement();
  $('#newAccountName').focus();
});
$('#newAccountMode').addEventListener('change', updateAgentRequirement);
$('#cancelAccountEdit').addEventListener('click', resetForm);
$('#accountContextForm').addEventListener('submit', event => {
  event.preventDefault();
  const name = $('#newAccountName').value.trim();
  const mode = $('#newAccountMode').value;
  const agent = $('#newAccountAgent').value.trim();
  if (!name || !MODE_LABEL[mode] || (mode.endsWith('agentic') && !agent)) return;
  let id = editingId;
  if (id.startsWith('sim:')) {
    saved.simulation[id] = {name, mode, agent};
  } else if (id) {
    const row = saved.profiles.find(item => item.id === id);
    if (!row) return;
    Object.assign(row, {name, mode, agent});
  } else {
    id = `local:${crypto.randomUUID()}`;
    saved.profiles.push({id, name, mode, agent});
  }
  saved.selectedId = id;
  const savedToBrowser = persist();
  if (savedToBrowser) $('#accountSelectorStatus').textContent = 'Account context saved in this browser.';
  resetForm();
  render();
});
$('#deleteAccountContext').addEventListener('click', () => {
  saved.profiles = saved.profiles.filter(row => row.id !== editingId);
  if (saved.selectedId === editingId) saved.selectedId = '';
  const savedToBrowser = persist();
  if (savedToBrowser) $('#accountSelectorStatus').textContent = 'Browser entry removed.';
  resetForm();
  render();
});
for (const [selector, step] of [['#previousAccount', -1], ['#nextAccount', 1]]) {
  $(selector).addEventListener('click', () => {
    const all = entries();
    if (all.length < 2) return;
    const index = all.findIndex(row => row.id === saved.selectedId);
    select(all[(index + step + all.length) % all.length].id);
  });
}
render();
void refreshSimulationAccounts();
