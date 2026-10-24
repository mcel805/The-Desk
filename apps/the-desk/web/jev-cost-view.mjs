export function usd(v){return Number.isFinite(v)?'$'+v.toFixed(v>=1?2:v>=.01?5:6):'—';}
export function meteredCost(m){return m?(m.complete?'':'≥')+usd(m.estimated_usd):'—';}
export function projectSession(projection,hours){
  if(!Number.isFinite(hours)||hours<=0||hours>168)return null;
  return Number.isFinite(projection?.estimated_usd_per_hour_if_enabled)?projection.estimated_usd_per_hour_if_enabled*hours:null;
}
export function costSummaryHtml(costs,symbol){
  const c=costs?.symbols?.[symbol];if(!c)return '<p>Jev cost meter loading…</p>';
  const parent=c.current_parent_swing,projection=c.projection;
  return `<p class="jev-cost-summary" data-jev-cost-summary>${costs.stale?'STALE · previous ':''}Jev estimates · session ${meteredCost(c.session)} · parent ${meteredCost(parent)}<br>Stored total ${meteredCost(costs.total)} · if enabled ${usd(projection.estimated_usd_per_hour_if_enabled)} / hour<br>${costs.stale?'Collection status unverified':projection.active?'Collecting':'Paused / off'} · ${(costs.total.unknown_cost_requests||0)} requests with unknown cost</p>`;
}
