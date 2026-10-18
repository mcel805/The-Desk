// Independent completed-candle channel ledger used as a numeric oracle.
export const defaults={showChannels:true,geometryPivot:4,geometryHistory:600,geometryMinSpan:8,geometryTouchTolerance:2,geometryMinTouches:0,geometryShown:8,geometryActiveShown:4,geometryShowBroken:true,geometryShowLabels:false,geometryActiveInk:'#BECFE6FF',geometryBrokenInk:'#6C7C94FF'};
export function geometryReference(bars,overrides={},tick=1){
 const o={...defaults,...overrides},window=[],highs=[],lows=[],ledger=[],eps=tick*.0001;
 const base=(g,t)=>g.p0+(g.p1-g.p0)*(t-g.t0)/(g.t1-g.t0);
 const inside=(g,b)=>g.side<0?b.low>=base(g,b.time)-eps&&b.high<=base(g,b.time)+g.offset+eps:b.high<=base(g,b.time)+eps&&b.low>=base(g,b.time)-g.offset-eps;
 const touch=(g,b)=>Math.abs((g.side<0?b.low:b.high)-base(g,b.time))<=o.geometryTouchTolerance*tick+eps||Math.abs((g.side<0?b.high:b.low)-(base(g,b.time)+(g.side<0?g.offset:-g.offset)))<=o.geometryTouchTolerance*tick+eps;
 function candidate(a,b,side){
  const start=window.findIndex(c=>c.time===a.time);if(start<0)return;
  const interval=window.slice(start).filter(c=>c.time<=b.time);
  const g={t0:a.time,p0:a.price,t1:b.time,p1:b.price,side,offset:0,endAt:b.time,broken:false,touches:0,spanBars:interval.length};
  if(interval.length<o.geometryMinSpan)return;
  for(const c of interval){const v=base(g,c.time);if(side<0?c.low<v-eps:c.high>v+eps)return;g.offset=Math.max(g.offset,side<0?c.high-v:v-c.low);}
  if(g.offset<=0)return;
  for(const c of window.slice(start+1)){
   if(c.time<b.time&&touch(g,c))g.touches++;
   if(c.time>b.time){if(!inside(g,c)){g.broken=true;break;}g.endAt=c.time;if(touch(g,c))g.touches++;}
  }
  return g;
 }
 for(let i=0;i<bars.length;i++){
  const b=bars[i];window.push(b);if(window.length>o.geometryHistory)window.shift();
  for(const g of ledger)if(!g.broken&&b.time>g.endAt){if(inside(g,b)){g.endAt=b.time;if(touch(g,b))g.touches++;}else g.broken=true;}
  const p=o.geometryPivot,k=i-p;if(k<p)continue;
  for(const side of [1,-1]){
   const field=side>0?'high':'low',price=bars[k][field];
   // Pine chooses the rightmost pivot on a plateau.
   if(bars.slice(k-p,k).some(c=>side>0?c[field]>price:c[field]<price)||bars.slice(k+1,i+1).some(c=>side>0?c[field]>=price:c[field]<=price))continue;
   const pivots=side>0?highs:lows,current={time:bars[k].time,price};
   for(const prior of pivots.slice(-4).reverse()){const g=candidate(prior,current,side);if(g){ledger.push(g);if(ledger.length>48)ledger.shift();}}
   pivots.push(current);if(pivots.length>8)pivots.shift();
  }
 }
 const selected=[];
 if(o.showChannels)for(const broken of [false,true])for(const g of [...ledger].reverse()){
  const cap=broken?o.geometryShown:Math.min(o.geometryActiveShown,o.geometryShown);
  if(g.broken===broken&&(!broken||o.geometryShowBroken)&&selected.length<cap&&g.endAt>=g.t1&&g.touches>=o.geometryMinTouches)selected.push(g);
 }
 return {ledger,selected,lines:selected.flatMap(g=>[0,g.side<0?g.offset:-g.offset].map(shift=>({x1:g.t0,y1:g.p0+shift,x2:g.endAt,y2:base(g,g.endAt)+shift,width:g.broken?1:2,style:g.broken?'dashed':'solid',extend:'none'})))};
}
