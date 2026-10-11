/** Deterministic watchlist convenience; does not create a trade signal. */
export function nearestCoreLevels(levels,price){
 if(!Number.isFinite(price))return [];
 const core=levels.filter(p=>[2,3,4].includes(p.tf)&&!p.taken&&Number.isFinite(p.price));
 const nearest=side=>core.filter(p=>side>0?p.price>price:p.price<price).sort((a,b)=>Math.abs(a.price-price)-Math.abs(b.price-price)||b.weight-a.weight||String(a.id).localeCompare(String(b.id)))[0];
 return [nearest(1),nearest(-1)].filter(Boolean);
}
