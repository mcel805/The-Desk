/** Horizontal drawings are human test levels, never indicator-confirmed pools. */
export function manualHuntLevels(slot){
 const source=slot?.source,price=slot?.bars?.at(-1)?.close;
 if(!source||!Number.isFinite(price))return [];
 const generated=new Set([...(slot.tradeDrawings||[]),...(slot.cleoDrawingIds||[]),...(slot.shammyDrawingIds||[])]);
 return (slot.chart?.drawings?.all?.()||[]).filter(d=>d.type==='hline'&&d.paneId==='price'&&!d.locked&&!generated.has(d.id)&&Number.isFinite(d.anchors?.[0]?.price)&&d.anchors[0].price>0).map(d=>({
  id:d.props?.riderManualId||'manual:'+d.id,drawingId:d.id,type:'hline',origin:'manual',
  label:d.text?.value||'Manual horizontal',price:d.anchors[0].price,side:d.anchors[0].price>=price?1:-1,
  tf:6,weight:0,taken:false,takenAt:0,time:slot.bars[0]?.time||Date.now(),
  provider:source.id,symbol:source.market
 }));
}
