const $ = (selector, root = document) => root.querySelector(selector);
const drawer = $('#marketResearchNewsDrawer');
const toggle = $('#marketResearchNewsButton');
const status = $('#marketNewsStatus');
const editions = $('#marketNewsEditions');
const api = '/api/market-research';
const headers = {'Content-Type':'application/json'};
let state = {};

async function request(path, options = {}) {
  const response = await fetch(`${api}${path}`, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Market Research request failed (${response.status})`);
  return payload;
}

function scheduleFromState(schedule = {}) {
  $('#marketNewsProduct').value = schedule.product || 'ALL FUTURES';
  $('#marketNewsSession').value = schedule.session_label || 'US equity-index RTH proxy';
  $('#marketNewsTimezone').value = schedule.timezone_name || 'America/Chicago';
  $('#marketNewsOpen').value = schedule.session_open || '08:30';
  $('#marketNewsClose').value = schedule.session_close || '15:00';
}

function coverageText(coverage = {}) {
  return `${coverage.approved ?? 0} rights-approved feeds · ${coverage.scanned ?? 0} scanned by cutoff · ${coverage.failed ?? 0} failed · ${coverage.homes ?? 0} registered source homes. Coverage is partial, never an industry-wide census.`;
}

function addFeedback(brief, clip, vote, container) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = ({useful:'Useful',noise:'Noise',missed_channel:'Missed channel'})[vote];
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await request('/feedback', {method:'POST',headers,body:JSON.stringify({brief_id:brief.id,clip_id:clip.id,vote})});
      button.textContent = 'Recorded';
    } catch (error) { status.textContent = error.message; button.disabled = false; }
  });
  container.append(button);
}

function askReporter(brief) {
  const product = brief?.product || $('#marketNewsProduct').value.trim() || 'ALL FUTURES';
  const cutoff = brief?.cutoff || new Date().toISOString();
  const edition = brief?.edition || 'current landscape';
  window.dispatchEvent(new CustomEvent('countdesk:ask-market-research-reporter', {detail:{
    prompt:`Prepare a sourced ${edition} Market Research report for ${product}. Use the Market Research indicator ledger and verify today's financial landscape using primary sources. As of cutoff ${cutoff}, give no more than three concise clips; each must distinguish verified event, plausible market transmission, and counterpath. State source publication times, coverage gaps, uncertainty, and leave bias unsigned where evidence is insufficient. Do not make a trade recommendation.`,
  }}));
}

function render(data) {
  state = data;
  scheduleFromState(data.schedule || {});
  const feeds = data.briefs || [];
  const sources = data.sources || [];
  const approved = sources.filter(item => item.enabled && item.feed_url && item.rights_status === 'approved_internal');
  const scanned = approved.filter(item => item.last_scan_status === 'ok');
  const failed = approved.filter(item => item.last_scan_status === 'error');
  const currentCoverage = {approved:approved.length,scanned:scanned.length,failed:failed.length,homes:sources.length};
  status.textContent = `${data.schedule?.enabled ? 'Scheduled editions on' : 'Scheduled editions off'} · ${data.schedule?.session_label || 'session not labeled'} · ${data.schedule?.timezone_name || 'timezone not set'} · Weekdays only; adjust manually for exchange holidays and early closes. ${coverageText(feeds[0]?.coverage || currentCoverage)} The channel cannot fetch unapproved sources.`;
  editions.replaceChildren();
  if (!feeds.length) {
    const empty = document.createElement('div'); empty.className = 'market-news-empty';
    empty.textContent = `No edition has been saved. ${approved.length ? 'Create an edition to scan the approved feed subset.' : 'No feed is rights-approved yet, so the scan will make no network requests. Review source rights in the indicator ledger before enabling collection.'}`;
    editions.append(empty);
    return;
  }
  for (const brief of feeds) {
    const article = document.createElement('article'); article.className = 'market-news-edition';
    const head = document.createElement('header');
    const heading = document.createElement('strong'); heading.textContent = `${brief.edition === 'morning' ? 'Morning' : 'Close'} · ${brief.product} · ${brief.session_label}`;
    const time = document.createElement('time'); time.dateTime = brief.cutoff; time.textContent = `Cutoff ${brief.cutoff} · ${brief.timezone_name}`;
    head.append(heading,time);
    const coverage = document.createElement('p'); coverage.textContent = coverageText(brief.coverage);
    head.append(coverage); article.append(head);
    if (!(brief.clips || []).length) {
      const empty = document.createElement('p'); empty.className = 'market-news-empty'; empty.textContent = 'No rights-approved headline or reviewed event was available for this cutoff. Bias remains unsigned.'; article.append(empty);
    }
    for (const clip of (brief.clips || []).slice(0,3)) {
      const block = document.createElement('section'); block.className = 'market-news-clip';
      const title = document.createElement('h3'); title.textContent = clip.title;
      const source = document.createElement('a'); source.href = clip.source_url; source.target = '_blank'; source.rel = 'noopener noreferrer'; source.textContent = `${clip.source_name || 'Source'} ↗`;
      block.append(title);
      for (const paragraphText of (clip.paragraphs || []).slice(0,3)) { const p = document.createElement('p'); p.textContent = paragraphText; block.append(p); }
      block.append(source);
      const feedback = document.createElement('div'); feedback.className = 'market-news-feedback';
      for (const vote of ['useful','noise','missed_channel']) addFeedback(brief,clip,vote,feedback);
      block.append(feedback); article.append(block);
    }
    const foot = document.createElement('footer');
    const hash = document.createElement('span'); hash.textContent = `Snapshot ${String(brief.snapshot_hash || '').slice(0,12)} · ${brief.status || 'descriptive, unscored'}`;
    const analyze = document.createElement('button'); analyze.type = 'button'; analyze.className = 'market-news-feedback'; analyze.textContent = 'Ask Reporter to analyze'; analyze.addEventListener('click',() => askReporter(brief));
    foot.append(hash,analyze); article.append(foot); editions.append(article);
  }
}

async function refresh() {
  try { render(await request('/state')); }
  catch (error) { status.textContent = `Market Research is unavailable: ${error.message}`; }
}

async function createEdition(edition) {
  status.textContent = `Scanning rights-approved feeds and saving the ${edition} edition…`;
  try {
    await request('/briefs', {method:'POST',headers,body:JSON.stringify({edition,product:$('#marketNewsProduct').value.trim().toUpperCase() || 'ALL FUTURES',session_label:$('#marketNewsSession').value.trim(),timezone_name:$('#marketNewsTimezone').value.trim()})});
    await refresh();
  } catch (error) { status.textContent = error.message; }
}

toggle?.addEventListener('click',() => {
  drawer.hidden = !drawer.hidden;
  toggle.setAttribute('aria-expanded',String(!drawer.hidden));
  if (!drawer.hidden) refresh();
});
$('#marketResearchNewsClose')?.addEventListener('click',() => { drawer.hidden = true; toggle?.setAttribute('aria-expanded','false'); toggle?.focus(); });
$('#marketNewsMorning')?.addEventListener('click',() => createEdition('morning'));
$('#marketNewsCloseEdition')?.addEventListener('click',() => createEdition('close'));
$('#marketNewsAskReporter')?.addEventListener('click',() => askReporter({edition:'current landscape',product:$('#marketNewsProduct').value.trim().toUpperCase() || 'ALL FUTURES',cutoff:new Date().toISOString()}));
$('#marketNewsScheduleSave')?.addEventListener('click',async () => {
  status.textContent = 'Saving briefing schedule…';
  try {
    const schedule = {enabled:true,product:$('#marketNewsProduct').value.trim().toUpperCase(),session_label:$('#marketNewsSession').value.trim(),timezone_name:$('#marketNewsTimezone').value.trim(),session_open:$('#marketNewsOpen').value,session_close:$('#marketNewsClose').value};
    await request('/schedule',{method:'POST',headers,body:JSON.stringify(schedule)}); await refresh();
  } catch (error) { status.textContent = error.message; }
});
refresh();
