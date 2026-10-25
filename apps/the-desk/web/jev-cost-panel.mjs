import {usd,meteredCost,projectSession} from './jev-cost-view.mjs';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=v=>v?new Date(v).toLocaleString():'—';
function table(headers,rows){return rows.length?`<div class="table-scroll"><table><thead><tr>${headers.map(h=>'<th>'+esc(h)+'</th>').join('')}</tr></thead><tbody>${rows.map(r=>'<tr>'+r.map(c=>'<td>'+esc(c)+'</td>').join('')+'</tr>').join('')}</tbody></table></div>`:'<p class="small muted">No Jev usage recorded yet.</p>';}
let latest=null,market=null;
export function renderJevCosts(data,symbol){
  if(!$('#jevCosts'))return;
  latest=data.costs;market=symbol;
  if(!latest?.symbols?.[symbol]){$('#jevCostState').textContent='Waiting for cost meter…';return;}
  const c=latest.symbols[symbol],projection=c.projection,p=latest.pricing;
  $('#jevSessionCost').textContent=meteredCost(c.session);
  $('#jevParentCost').textContent=meteredCost(c.current_parent_swing);
  $('#jevTotalCost').textContent=meteredCost(latest.total);
  $('#jevParentLabel').textContent='Current / latest parent #'+(c.current_parent_swing.parent_id??'—');
  renderProjection();
  $('#jevCostState').textContent=`${projection.active?'Collecting':'Paused / off — no new Jev calls'} · session ${(c.session.id||'not started').slice(0,10)} · ${c.session.requests} requests · ${c.session.input_tokens.toLocaleString()} metered input tokens. Estimates refresh with status every 3 seconds.`;
  if(latest.stale)$('#jevCostState').textContent='STALE · previous estimates shown; collection status unverified. '+$('#jevCostState').textContent.split(' · session ')[1];
  $('#jevCostInspect').href=latest.transport?'/data/jev-costs.json':'/api/swing/costs';
  $('#jevCostCoverage').textContent=`Stored BTC + ETH total: ${latest.total.requests} requests, ${latest.total.priced_requests} priced, ${latest.total.unknown_cost_requests} unknown, ${latest.total.pending_requests} pending. ${latest.total.legacy_repriced_requests} requests repriced at the verified current list price. Totals cover retained tracker records, not other apps or your entire TypeSafe account.`+((latest.total.orphaned_prediction_requests||0)>0?` ${latest.total.orphaned_prediction_requests} metered requests have no readable prediction record; their costs remain included.`:'')+(latest.restored_archive_cutoff_utc?` Older history was restored through ${time(Date.parse(latest.restored_archive_cutoff_utc))}; missing records after that backup cannot be priced.`:'');
  $('#jevRate').textContent=p?`Published rate: $${p.input_usd_per_million} / million billable input tokens; output $${p.output_usd_per_million}. Verified ${p.verified_date}. One request’s returned billable count covers all five questions; it is not multiplied again.`:'No verified list price for this model. Costs stay unknown.';
  $('#jevParentMean').textContent=`Average known cost per observed parent group in this session: ${usd(c.mean_usd_per_observed_parent)} across ${c.observed_parent_groups_in_session} groups. Parent groups may still be developing; they are separate from the fully completed-swing audit below.`;
  $('#jevSessions').innerHTML=table(['Market','Session started','Run','Requests / unknown','Known estimate'],latest.sessions.slice(0,20).map(s=>[s.symbol,time(s.started),s.id.slice(0,10),s.requests+' / '+s.unknown_cost_requests,meteredCost(s)]));
  $('#jevParents').innerHTML=table(['Market / run','Parent swing','Observed from','Requests / unknown','Known estimate'],latest.parent_swings.slice(0,30).map(s=>[s.symbol+' / '+s.run.slice(0,8),'#'+s.parent_id,time(s.first_at),s.requests+' / '+s.unknown_cost_requests,meteredCost(s)]));
}
function renderProjection(){
  if(!latest||!market)return;
  const projection=latest.symbols[market].projection,hours=Number($('#jevPlanHours').value);
  $('#jevProjectedCost').textContent=usd(projectSession(projection,hours));
  $('#jevProjectedLabel').textContent=`Projected ${Number.isFinite(hours)&&hours>0?hours:'—'}h · selected market`;
  $('#jevProjection').textContent=`If enabled at ${projection.requests_per_hour/60} checks/min: ${usd(projection.estimated_usd_per_hour_if_enabled)} / hour, based on ${projection.sample_requests} recent metered requests for this market/model. Active markets combined: ${latest.active_projection_complete?usd(latest.active_estimated_usd_per_hour):'unknown'} / hour. Projections assume similar snapshot sizes and continuous sampling; they are not a spending cap.`;
  $('#jevCadenceCosts').innerHTML=table(['Checks / minute','Requests / hour','Projected / hour','Projected '+(hours||'—')+'h'],[1,2,4,6].map(n=>{const perCall=projection.estimated_usd_per_request,rate=Number.isFinite(perCall)?perCall*n*60:null;return [n,n*60,usd(rate),usd(rate!=null&&Number.isFinite(hours)&&hours>0&&hours<=168?rate*hours:null)];}));
}
export function setupJevCostPanel(){$('#jevPlanHours')?.addEventListener('input',renderProjection);}
export function markJevCostsUnavailable(){if($('#jevCostState'))$('#jevCostState').textContent='Cost refresh unavailable · previous figures may be stale. Reconnect to update recorded usage.';}
