export const TIMEFRAMES={'1m':'1','3m':'3','5m':'5','15m':'15','30m':'30','1h':'60','2h':'120','4h':'240','1d':'D'};
export function levelOverlays(snapshot,detail){
 const levels=(snapshot.context?.levels||[]).map(l=>({id:l.id,price:l.price,label:l.label,color:l.source==='manual-cyan'?'#00ffff':'#c4b5fd',style:'solid'}));
 for(const p of detail.positions||[])if(p.status==='open'){
  for(const [key,label,color]of [['entry','Entry','#60a5fa'],['stop','Stop','#fb7185'],['target','Target','#34d399']])if(p[key])levels.push({id:p.id+':'+key,price:p[key],label:label+' · '+p.side+' '+p.qty,color,style:key==='entry'?'solid':'dotted'});
 }
 for(const o of detail.orders||[])if(['working','triggered'].includes(o.status)&&o.price)levels.push({id:o.id,price:o.price,label:'Working '+o.side+' '+o.qty,color:'#fbbf24',style:'dashed'});
 return levels;
}

export function snapshotUpdates(previous,next){
 const last=previous?.bars?.at(-1)?.time;
 return last===undefined?next.bars:next.bars.filter(b=>b.time>=last);
}
