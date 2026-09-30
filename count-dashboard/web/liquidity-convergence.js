// Display grouping for confirmed, unbroken swing levels. It does not change
// the source levels, imply independent market evidence, or estimate outcomes.
const rank = timeframe => ({'1H':60,'30M':30,'15M':15,'5M':5,'1M':1})[timeframe] || 0;

export function liquidityConvergenceGroups(levels, chartTimeframe, settings, chartEndTime) {
  const multiplier = Number(settings.convergenceAtr ?? 0.1);
  if (!Number.isFinite(multiplier) || multiplier <= 0) return [];
  const unique = new Map();
  for (const level of levels) {
    if (level.breakIndex >= 0 || !Number.isFinite(level.price) || !Number.isFinite(level.confirmedTime)
        || level.confirmedTime > chartEndTime) continue;
    const key = `${level.timeframe}|${level.side}|${level.time}|${level.price}`;
    if (!unique.has(key) || (level.kind === 'EXT' && unique.get(key).kind !== 'EXT')) unique.set(key, level);
  }
  const active = [...unique.values()];
  const anchors = [...active].sort((a,b) => rank(b.timeframe)-rank(a.timeframe)
    || (b.timeframe === chartTimeframe) - (a.timeframe === chartTimeframe)
    || b.confirmedTime-a.confirmedTime || a.price-b.price);
  const assigned = new Set();
  const groups = [];
  for (const anchor of anchors) {
    if (assigned.has(anchor)) continue;
    const tolerance = Number(anchor.atr) * multiplier;
    if (!(tolerance > 0)) continue;
    const candidates = active.filter(level => !assigned.has(level) && level.side === anchor.side
      && Math.abs(level.price-anchor.price) <= tolerance)
      .sort((a,b)=>Math.abs(a.price-anchor.price)-Math.abs(b.price-anchor.price)
        || rank(b.timeframe)-rank(a.timeframe) || b.confirmedTime-a.confirmedTime);
    const members = [anchor];
    let low = anchor.price, high = anchor.price;
    for (const level of candidates) {
      if (level === anchor) continue;
      const nextLow = Math.min(low,level.price), nextHigh = Math.max(high,level.price);
      if (nextHigh-nextLow > tolerance) continue; // no single-link chains
      members.push(level); low=nextLow; high=nextHigh;
    }
    if (members.length < 2) continue;
    const timeframes = [...new Set(members.map(level=>level.timeframe))];
    if (settings.showLocalConvergences === false && timeframes.length < 2) continue;
    members.forEach(level=>assigned.add(level));
    const joinTime = Math.max(...members.map(level=>level.confirmedTime));
    const opposing = active.filter(level=>level.side!==anchor.side
      && Math.abs(level.price-anchor.price)<=tolerance);
    groups.push({anchor,members,timeframes,tolerance,low,high,joinTime,
      contested:opposing.length>0,opposing});
  }
  // A second pass joins neighboring clusters left by different anchor order.
  // Their full price span must still fit the tighter tolerance.
  const consolidated = [];
  for (const group of groups.sort((a,b)=>a.low-b.low)) {
    const prior = consolidated.find(item=>item.anchor.side===group.anchor.side
      && Math.max(item.high,group.high)-Math.min(item.low,group.low)<=Math.min(item.tolerance,group.tolerance));
    if (!prior) { consolidated.push(group); continue; }
    prior.members.push(...group.members);
    prior.timeframes=[...new Set(prior.members.map(level=>level.timeframe))];
    prior.low=Math.min(prior.low,group.low);
    prior.high=Math.max(prior.high,group.high);
    prior.tolerance=Math.min(prior.tolerance,group.tolerance);
    prior.joinTime=Math.max(prior.joinTime,group.joinTime);
    prior.contested ||= group.contested;
    prior.opposing=[...new Set([...prior.opposing,...group.opposing])];
  }
  return consolidated;
}
