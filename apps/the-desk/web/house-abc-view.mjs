// Visual projection of source-owned, closed-bar House ABC evidence.
const finite=Number.isFinite;
export const houseFamilies=['Volume exhaustion','EMA','SAR','Candlestick','Geometry','Structure','Slow / chop','Momentum divergence'];
export const houseColors=['#ff9628','#42a5f5','#ab7bff','#f45b69','#00c3ff','#e056fd','#ffd166','#cbd5e1'];
const stageNames={1:'A DRIVE',2:'B RETRACEMENT',3:'C DEVELOPING',4:'C BEYOND A',5:'INVALIDATED',6:'ABC COMPLETE',7:'EXPIRED'};
export function projectHouseABC(h,{timeToX,priceToY,width,top,height,cutoff}){
 if(h?.status!=='AVAILABLE'||!finite(h.cutoff)||h.cutoff!==cutoff||!h.abc||!Number.isInteger(h.abc.id)||!h.abc.points)return null;
 const pts={};
 for(const name of ['o','a','b','c']){const p=h.abc.points[name];if(!p||!finite(p.price)||!Number.isSafeInteger(p.origin)||p.origin>=cutoff||p.known!=null&&(!Number.isSafeInteger(p.known)||p.known>cutoff))continue;const x=timeToX(p.origin),y=priceToY(p.price);if(!finite(x)||!finite(y))continue;pts[name]={...p,x,y,visible:x>=0&&x<=width&&y>=top&&y<=top+height};}
 const stage=h.abc.stage;const labels={o:'O',a:stage===1?'A?':'A',b:stage<=2?'B?':'B',c:stage===6?'C':'C?'};
 const lines=[['o','a','#00c3ff',stage===1],['a','b','#ffc41e',stage<=2],['b','c','#b97dff',stage!==6]].flatMap(([a,b,color,dashed])=>pts[a]&&pts[b]?[{a:pts[a],b:pts[b],color,dashed}]:[]);
 const events=(h.events||[]).filter(e=>e.root===h.abc.root_id&&Number.isSafeInteger(e.bar)&&e.bar<cutoff&&Number.isSafeInteger(e.known)&&e.known<=cutoff&&finite(e.price)&&Number.isInteger(e.family)&&e.family>=0&&e.family<8).flatMap(e=>{const x=timeToX(e.bar),y=priceToY(e.price);return finite(x)&&finite(y)&&x>=4&&x<=width-4&&y>=top+4&&y<=top+height-4?[{...e,x,y,id:`${e.root}:${e.bar}:${e.family}`,name:houseFamilies[e.family],color:houseColors[e.family]}]:[]});
 const e=h.exhaustion||{},matched=Number.isInteger(h.abc.root_id)&&h.abc.root_id===e.root_id;
 const retracement=pts.o&&pts.a&&pts.b&&pts.a.price!==pts.o.price?Math.abs((pts.a.price-pts.b.price)/(pts.a.price-pts.o.price))*100:null;
 return {points:pts,labels,lines,events,stage:stageNames[stage]||'WARMING',retracement,score:finite(e.score)?e.score:null,available:finite(e.available)?e.available:null,tier:['LOW','CAUTION','WEAKENING','STRONG OPPOSITION'][e.tier]||'UNAVAILABLE',matched,scoreRoot:e.root_id,root:h.abc.root_id,id:h.abc.id,scoreSide:e.side,side:pts.o&&pts.a?(pts.a.price>=pts.o.price?1:-1):null,contributions:e.contributions||[],receivedAt:h.received_at,historyStart:h.history_start};
}
