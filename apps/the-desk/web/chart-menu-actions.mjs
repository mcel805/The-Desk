export function buildChartMenuActions({chart,cell,price,priceLabel=String(price),cursorTime,workspace,copyPrice,openAlert,stageTrade,side,openTemplates,toast,placementLabel='Review & place · PAPER'}){
 const drawings=chart?.drawings?.all?.()||[],indicators=chart?.indicators?.()||[];
 return [
  {id:'reset',label:'Reset chart view',run:()=>cell?.resetView?.()},
  {id:'copy',label:'Copy price '+priceLabel,run:()=>copyPrice(price)},
  {id:'paste',label:'Paste',run:()=>chart?.drawings?.paste?.()},
  {id:'alert',label:'Add alert at '+priceLabel+'…',run:()=>openAlert(price)},
  {id:'buy',label:'Buy limit at '+priceLabel+' · '+placementLabel,run:()=>stageTrade('buy','limit',price)},
  {id:'sell',label:'Sell limit at '+priceLabel+' · '+placementLabel,run:()=>stageTrade('sell','limit',price)},
  {id:'order',label:'Add paper order at '+priceLabel+'…',run:()=>stageTrade(side,'limit',price)},
  {id:'lock-time',label:'Lock vertical cursor line by time',disabled:cursorTime==null,run:()=>{const mark=chart?.drawings?.add?.('vline',{anchors:[{time:cursorTime,price}]});if(mark){chart.drawings.lock(mark.id,true);toast('Vertical time marker added and locked.');}}},
  {id:'table',label:'Table view',run:()=>workspace?.context?.().togglePanel('dataWindow',true)},
  {id:'objects',label:'Object tree',run:()=>workspace?.context?.().togglePanel('objects',true)},
  {id:'template',label:'Chart template ›',run:()=>openTemplates()},
  {id:'remove-drawings',label:`Remove ${drawings.length} drawing${drawings.length===1?'':'s'}`,disabled:drawings.length===0,run:()=>chart?.drawings?.removeMany?.(drawings.map(d=>d.id))},
  {id:'remove-indicators',label:`Remove ${indicators.length} indicator${indicators.length===1?'':'s'}`,disabled:indicators.length===0,run:()=>{for(const handle of indicators)handle.remove();}},
  {id:'settings',label:'Settings…',run:()=>chart?.renderer?.openSettings?.('Canvas')},
 ];
}
