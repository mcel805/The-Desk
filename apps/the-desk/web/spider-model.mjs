export const SPIDER_FRAMES=[['1d','D','Daily'],['4h','240','4HR'],['1h','60','1HR'],['30m','30','30M'],['15m','15','15M'],['5m','5','5M'],['3m','3','3M'],['2m','2','2M'],['1m','1','1M']];
export const canonicalFrame=tf=>{const key=String(tf)==='1D'?'D':String(tf);return SPIDER_FRAMES.find(f=>f[0]===key||f[1]===key)?.[0]||key;};
export const colors={objective:'#66a6ff',liquidity:'#66a6ff',block:'#b9c6dd',trap:'#f4b35f',invalidation:'#f26879',conditional:'#bc9bff'};
export const spiderIcon='<svg viewBox="0 0 32 32" width="22" height="22" fill="none" aria-hidden="true"><path d="M13 13 7 8 5 3m8 13L5 13 2 8m11 11-8 2-3 5m11-4-5 4-1 5m12-18 6-5 2-5m-8 13 8-3 3-5m-11 11 8 2 3 5m-11-4 5 4 1 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><ellipse cx="16" cy="21" rx="5" ry="7" fill="currentColor"/><circle cx="16" cy="12" r="4" fill="currentColor"/><circle cx="14.5" cy="11.5" r=".8" fill="#131722"/><circle cx="17.5" cy="11.5" r=".8" fill="#131722"/></svg>';
export function annotationsFor(run,instrument,tf){
 if(run?.status!=='complete'||run.instrument!==instrument)return [];
 const frame=run.analysis?.frames.find(f=>f.timeframe===canonicalFrame(tf)),source=run.snapshots?.[canonicalFrame(tf)];
 if(!frame||source?.status!=='available')return [];
 return frame.annotations.map(a=>({...a,key:run.id+':'+frame.timeframe+':'+a.id,color:colors[a.role]}));
}
export function drawingSpec(a){
 const line=a.kind==='level',zone=a.kind==='zone';
 return {type:line?'hline':zone?'box':'trendline',options:{
 anchors:line?[{time:a.time,price:a.price}]:[{time:a.time,price:a.price},{time:a.endTime,price:a.endPrice}],
 style:{lineColor:a.color,lineWidth:a.role==='invalidation'?2:1,lineStyle:a.state==='conditional'?'dashed':'solid',fillColor:zone?a.color+'18':undefined},
 text:{value:'Spider · '+a.label,size:'small',hAlign:'right',vAlign:'top'},locked:true}};
}
export function sourceURL(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!['localhost','127.0.0.1'].includes(u.hostname)?u.href:null;}catch{return null;}}

export function stripSpiderDrawings(state){
 const copy=structuredClone(state);for(const chart of copy.charts||[]){if(Array.isArray(chart.drawings?.drawings))chart.drawings.drawings=chart.drawings.drawings.filter(d=>!d.text?.value?.startsWith('Spider · '));}return copy;
}
