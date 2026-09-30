const studies = [
  {id:'volume-profile',name:'Volume Profile',description:'Approximate observed volume across price bins.',image:'volume-profile-sketch.png',colorImage:'volume-profile-color.png',version:'v1.0.0'},
  {id:'fibonacci',name:'Fibonacci',description:'Map retracement levels from chart swings.',image:'fibonacci-sketch.png',colorImage:'fibonacci-color.png',version:'v0.1.0'},
  {id:'liquidity',name:'Liquidity',description:'Map confirmed external zones and internal swing levels.',image:'liquidity-sketch.png',colorImage:'liquidity-color.png',version:'v1.0.0',premium:true},
  {id:'liquidity-zones',name:'Liquidity Zones',description:'Mark research zones around swept levels.',image:'liquidity-zones-sketch.png',colorImage:'liquidity-zones-color.png',version:'v0.1.0'},
  {id:'daily-bias',name:'Daily Bias',description:'Show provisional context from prior sweeps.',image:'daily-bias-sketch.png',colorImage:'daily-bias-color.png',version:'v0.1.0'},
  {id:'elliott-wave',name:'Elliott Wave',description:'Inspect provisional counts and path structure.',image:'elliott-wave-sketch.png',colorImage:'elliott-wave-color.png',version:'v0.1.0'},
  {id:'confirmed-swings',name:'Confirmed Swings',description:'Locate confirmed pivots in stored bars.',image:'confirmed-swings-sketch.png',colorImage:'confirmed-swings-color.png',version:'v0.1.0'},
  {id:'confluence',name:'Confluence',description:'See where chart structures align.',image:'convergence-sketch.png',colorImage:'convergence-color.png',version:'v0.1.0'},
  {id:'premium-discount',name:'Premium / Discount',description:'Divide a selected swing into price zones.',image:'premium-discount-sketch.png',colorImage:'premium-discount-color.png',version:'v0.1.0'},
];

// Display tiers are visual states only. A future reviewed evaluation can supply
// a score; this catalog intentionally starts uncalibrated at 50/50.
function scorePresentation(evaluation = null) {
  if (evaluation === null) return {tier:'coin',glyph:'½',label:'50% / 50%',note:'Coin flip · uncalibrated placeholder'};
  const {score,reviewed,source,timeframe,cutoff,sampleSize} = evaluation;
  if (!Number.isInteger(score) || score < 50 || score > 95 || score % 5 !== 0) throw new RangeError('Score must be 50–95 in five-point steps');
  if (reviewed !== true || !source || !timeframe || !cutoff || !Number.isInteger(sampleSize) || sampleSize < 1) throw new Error('Reviewed evidence with provenance is required');
  const glyphs = {50:'½',55:'↗',60:'✧',65:'✦',70:'★',75:'◇',80:'◆',85:'⬡',90:'✷',95:'✺'};
  const tier = score < 60 ? 'watch' : score < 70 ? 'tested' : 'strong';
  return {tier,glyph:glyphs[score],label:`${score}% / ${100-score}%`,note:'Reviewed evidence · see evaluation record'};
}

const grid = document.querySelector('#indicatorGrid');
if (grid) {
  function activateIndicator(id) {
    for (const card of grid.querySelectorAll('.indicator-card')) {
      const active = card.dataset.indicatorId === id;
      card.classList.toggle('is-active', active);
      card.setAttribute('aria-current', active ? 'true' : 'false');
      const image = card.querySelector('.indicator-art img');
      image.src = `./tool-belt-assets/${active ? image.dataset.colorImage : image.dataset.monoImage}`;
      image.alt = `${active ? 'Colored' : 'Pencil sketch'} illustration representing ${card.dataset.indicatorName}`;
    }
  }
  for (const study of studies) {
    const score = scorePresentation();
    const card = document.createElement('article');
    card.className = 'indicator-card';
    card.dataset.indicatorId = study.id;
    card.dataset.indicatorName = study.name;
    card.innerHTML = `<div class="indicator-art"><img src="./tool-belt-assets/${study.image}" data-mono-image="${study.image}" data-color-image="${study.colorImage}" alt="Pencil sketch representing ${study.name}" loading="lazy"><span class="indicator-version" title="Tool Belt catalog version">${study.version}</span>${study.premium ? '<span class="indicator-premium">PREMIUM</span>' : ''}</div><div class="indicator-body"><span class="indicator-kind">${study.premium ? 'PREMIUM INDICATOR' : 'COUNT DESK LAYER'}</span><h3>${study.name}</h3><p>${study.description}</p><div class="indicator-probability"><span class="probability-icon" data-tier="${score.tier}" aria-hidden="true">${score.glyph}</span><span class="probability-copy"><strong>${score.label}</strong><small>${score.note}</small></span></div>${study.id === 'volume-profile' ? '<button class="indicator-inspect" type="button" data-open-profile>Inspect calculation →</button>' : ''}${study.id === 'liquidity' ? '<button class="indicator-inspect" type="button" data-open-liquidity>Build liquidity map →</button>' : ''}<a class="indicator-card-link" href="./index.html#chartWorkspace">Open Count Desk →</a><a class="indicator-card-link" href="./indicator-agent.html?indicator=${encodeURIComponent(study.id)}">Open Indicator Agent →</a></div>`;
    grid.append(card);
  }
  const requestedIndicator = new URLSearchParams(location.search).get('indicator');
  if (studies.some((study) => study.id === requestedIndicator)) activateIndicator(requestedIndicator);
  grid.addEventListener('click', (event) => {
    const card = event.target.closest('.indicator-card');
    if (!card) return;
    if (event.target.closest('[data-open-profile], [data-open-liquidity], a[href*="indicator-agent.html"]')) activateIndicator(card.dataset.indicatorId);
  });
  window.setActiveToolBeltIndicator = activateIndicator;
}
