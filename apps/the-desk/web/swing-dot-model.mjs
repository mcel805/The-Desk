// Presentation-only projection. Historical votes and timestamps are immutable.
export const dotColors=Object.freeze({up:'#00c99b',down:'#ff6072',flat:'#a3acba',unavailable:'#8993a5'});
export function projectEvaluationDots(dots,{timeToX,priceToY,width,top,height,timeframe='1',now=Date.now(),barWidth=null}){
 if(String(timeframe)!=='1')return [];
 return dots.flatMap(d=>{
  if(!Number.isInteger(d.bar)||!Number.isInteger(d.slot)||d.slot<1||d.slot>6||!Number.isFinite(d.high)||!Number.isFinite(d.low)||d.observed_at>now||!Object.hasOwn(dotColors,d.vote))return [];
  const radius=Number.isFinite(barWidth)?Math.max(1.8,Math.min(3.5,barWidth*.36)):3.5;
  const cx=timeToX(d.bar),ys=[priceToY(d.high),priceToY(d.low)],anchor=d.vote==='up'?Math.max(...ys):Math.min(...ys),cy=anchor+(d.vote==='up'?1:-1)*(radius+8.5+(d.slot-1)*(radius*2+3));
  if(!Number.isFinite(cx)||!Number.isFinite(cy)||cx<4||cx>width-4||cy<top+4||cy>top+height-4)return [];
  const direction={up:'LONG LEAN',down:'SHORT LEAN',flat:'NEUTRAL',unavailable:'NO VALID EVALUATION'}[d.vote];
  const probabilities=d.probabilities?Object.entries(d.probabilities).map(([k,v])=>`${k} ${(100*v).toFixed(1)}%`).join(' / '):'';
  return [{...d,cx,cy,radius,color:dotColors[d.vote],hollow:d.vote==='unavailable',label:`${direction} · evaluation ${d.slot}/${60/d.cadence_seconds} · ${new Date(d.observed_at).toISOString()} · ${d.service}${probabilities?' · '+probabilities:''} · next full candle ${new Date(d.prediction_bar).toISOString()}. Research judgment, not entry permission.`}];
 });
}
