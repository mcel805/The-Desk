// Rider's setup shortcut selects actionable nearby confluence, not the strongest distant pools.
export function nearestRiderConfluenceZones(zones, price) {
  if (!Number.isFinite(price) || !Array.isArray(zones)) return [];
  const distance = zone => zone.side > 0
    ? Math.max(0, Number(zone.lo) - price)
    : Math.max(0, price - Number(zone.hi));
  const nearest = side => zones
    .filter(zone => zone?.side === side && Number.isFinite(Number(zone.lo)) && Number.isFinite(Number(zone.hi)))
    .sort((a, b) => distance(a) - distance(b) || Number(b.strength || 0) - Number(a.strength || 0))
    .slice(0, 1);
  return [...nearest(1), ...nearest(-1)];
}
