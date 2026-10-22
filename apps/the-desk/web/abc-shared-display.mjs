// Workspace-only visual sharing. This registry never supplies Pine inputs or alerts.
const entry=tf=>['1','5'].includes(String(tf));
const key=m=>[String(m.symbol||'').replace(/^[^:]+:/,p=>p.toLowerCase()),['standard','candles',undefined].includes(m.chartStyle)?'standard':m.chartStyle].join('|');
export class ABCSharedDisplay {
 constructor(){this.sources=new Map();this.listeners=new Set();}
 publish(owner,value){this.sources.set(owner,value);for(const fn of this.listeners)fn();}
 remove(owner){if(this.sources.delete(owner))for(const fn of this.listeners)fn();}
 subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
 select(market,bars){
  if(entry(market.timeframe))return null;
  const last=bars.at(-1)?.time,step=Number(market.timeframe)*60000;
  if(!Number.isFinite(last)||!Number.isFinite(step))return null;
  const candidates=[...this.sources.values()].filter(s=>key(s.market)===key(market)&&entry(s.market.timeframe)&&s.cutoff+Number(s.market.timeframe)*60000>=last&&s.cutoff+Number(s.market.timeframe)*60000<=last+step);
  // Prefer 1m over 5m. Ambiguous duplicate studies cannot silently claim authority.
  for(const tf of ['1','5']){const matches=candidates.filter(s=>String(s.market.timeframe)===tf);if(matches.length)return matches.length===1?matches[0]:null;}
  return null;
 }
}
export const sharedABCDisplay=new ABCSharedDisplay();
export function sharedABCModel(base,source,{market,bars,id}){
 const tf=String(source.market.timeframe),step=Number(market.timeframe)*60000,last=bars.at(-1)?.time;
 const plays=(source.model.abcPlays||[]).filter(p=>base.inputValues?.keepHistory!==false||!p.end);
 const prefixes=new Set(plays.map(p=>p.drawingPrefix));
 const belongs=obj=>[...prefixes].some(p=>obj.id?.startsWith(p+':'));
 const marker=obj=>/:(?:level-before-contact|in-play|retired-level|start-tick|end-tick)$/.test(obj.id||'');
 const rename=obj=>({...obj,id:`${id}:shared:${obj.id}`});
 const lines=(source.model.lines||[]).filter(l=>belongs(l)&&marker(l)).map(l=>{
  const result=rename(l);
  // Preserve event time; make the short marker leg visible at the viewing resolution.
  if(/:(start|end)-tick$/.test(l.id))result.x2=l.x1+step*.5;
  if(/:in-play$/.test(l.id))result.x2=Math.max(l.x2,last+step*2);
  return result;
 });
 const labels=[]; // Shared play annotations use only the short start/end ticks.
 const boxes=(source.model.boxes||[]).filter(b=>belongs(b)&&b.id.endsWith(':highlight')).map(b=>({...rename(b),right:Math.max(b.right,last+step*2)}));
 const reason=`Shared ${tf}m play markers · ABC decisions stay on ${tf}m`;
 const tables=(base.tables||[]).map(t=>({...t,cells:t.cells.map((row,i)=>i===1?row.map((cell,j)=>j===1?{...cell,text:reason}:cell):row)}));
 return {...base,lines,labels,boxes,tables,abcPlays:structuredClone(plays),abcShared:{sourceTimeframe:tf,cutoff:source.cutoff,displayOnly:true},abcBridge:{...base.abcBridge,reason}};
}
