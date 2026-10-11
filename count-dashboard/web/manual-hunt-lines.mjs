/** Horizontal drawings are human test levels, never indicator-confirmed pools. */
const restoredIds=new WeakMap();
export function manualHuntLevels(slot){
 const source=slot?.source,price=slot?.bars?.at(-1)?.close;
 if(!source||!Number.isFinite(price))return [];
 const generated=new Set([...(slot.tradeDrawings||[]),...(slot.cleoDrawingIds||[]),...(slot.shammyDrawingIds||[])]);
 return (slot.chart?.drawings?.all?.()||[]).filter(d=>d.type==='hline'&&d.paneId==='price'&&!d.locked&&!generated.has(d.id)&&Number.isFinite(d.anchors?.[0]?.price)&&d.anchors[0].price>0).map(d=>({
  id:restoredIds.get(slot.chart)?.get(d.id)||d.props?.riderManualId||'manual:'+d.id,drawingId:d.id,type:'hline',origin:'manual',
  label:d.text?.value||'Manual horizontal',price:d.anchors[0].price,side:d.anchors[0].price>=price?1:-1,
  tf:6,weight:0,taken:false,takenAt:0,time:slot.bars[0]?.time||Date.now(),
  provider:source.id,symbol:source.market
 }));
}

/** Renderer props may be filtered. Own restored identity outside the renderer. */
export function restoreManualHuntLevels(slot,frozen=[]){
 if(!slot?.chart?.drawings?.add||!slot?.bars?.length)return manualHuntLevels(slot);
 let aliases=restoredIds.get(slot.chart);
 if(!aliases){aliases=new Map();restoredIds.set(slot.chart,aliases);}
 let lines=manualHuntLevels(slot);
 for(const level of frozen){
  if(lines.some(line=>line.id===level.id))continue;
  const drawing=slot.chart.drawings.add('hline',{paneId:'price',anchors:[{time:slot.bars.at(-1).time,price:level.price}],style:{lineColor:'#19d0e9',lineWidth:2}});
  if(drawing?.id){aliases.set(drawing.id,level.id);lines=manualHuntLevels(slot);}
 }
 return lines.map(line=>{const approved=frozen.find(level=>level.id===line.id);return approved?{...line,price:approved.price,side:approved.side,label:approved.label}:line;});
}

/** Remove manual drawings belonging to a completed hunt while keeping its saved session record. */
export function clearHuntManualLines(slot,levels=[]){
 if(!slot?.chart?.drawings?.remove||!levels.length)return 0;
 const selected=levels.filter(level=>level?.origin==='manual'&&level.provider===slot.source?.id&&level.symbol===slot.source?.market);
 if(!selected.length)return 0;
 const ids=new Set(selected.flatMap(level=>[level.id,level.drawingId].filter(Boolean)));
 const prices=new Set(selected.map(level=>Number(level.price)).filter(Number.isFinite));
 const matches=manualHuntLevels(slot).filter(line=>ids.has(line.id)||ids.has(line.drawingId)||prices.has(Number(line.price)));
 const aliases=restoredIds.get(slot.chart);
 for(const line of matches){slot.chart.drawings.remove(line.drawingId);aliases?.delete(line.drawingId);}
 return matches.length;
}
