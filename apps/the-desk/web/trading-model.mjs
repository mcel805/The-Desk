import {tradeColors,bracketLabel} from './chart-bracket-model.mjs';
export const tradingDefaults=Object.freeze({positions:true,orders:true,brackets:true,executionHistory:false,pnl:true,reverse:true,quickButtons:true,instant:false,pnlUnit:'money'});
export function tradingConfig(input={}){const c={...tradingDefaults};for(const k of Object.keys(c))if(typeof input[k]==='boolean'&&k!=='pnlUnit')c[k]=input[k];if(['money','ticks','percent'].includes(input.pnlUnit))c.pnlUnit=input.pnlUnit;return c;}
// Older always-on execution/quantity settings do not opt into history review.
export function paperExecutionMarkers(state,market,config,replay=false){
  if(replay||!config.executionHistory)return [];
  return state.fills.filter(fill=>fill.instrument===market&&fill.account_id===state.active_account).slice(0,100);
}
export function marketIdentity(chart){
  const m=chart?.market;if(!m)return 'hyperliquid:BTC';
  const symbol=m.symbol||'hyperliquid:BTC',resolved=chart.data?.resolve?.(symbol);
  const provider=String(resolved?.provider?.name||resolved?.provider||m.provider||symbol.split(':')[0]).toLowerCase();
  return (provider.includes('coinbase')?'coinbase':'hyperliquid')+':'+String(resolved?.ticker||symbol.split(':').at(-1));
}
export function positionMetrics(position,quote,unit='money'){
  const sign=position.side==='buy'?1:-1,entry=Number(position.entry),qty=Number(position.qty),mark=Number(quote?.[sign===1?'bid':'ask']??entry),difference=(mark-entry)*sign;
  const value=unit==='ticks'?difference/Number(quote?.tick||.01):unit==='percent'?difference/entry*100:difference*qty;
  return {mark,qty,entry,pnl:difference*qty,value,unit,increment:Math.abs(qty*Number(quote?.tick||.01))};
}
export function summarizePositions(positions,quote,unit='money'){
  const qty=positions.reduce((s,p)=>s+Number(p.qty)*(p.side==='buy'?1:-1),0),total=positions.reduce((s,p)=>s+Number(p.qty),0);
  const entry=total?positions.reduce((s,p)=>s+Number(p.entry)*Number(p.qty),0)/total:0;
  const pnl=positions.reduce((s,p)=>s+positionMetrics(p,quote).pnl,0);
  return {qty,entry,pnl,increment:Math.min(.01,...positions.map(p=>positionMetrics(p,quote).increment)),value:unit==='ticks'?(total?pnl/total/Number(quote?.tick||.01):0):unit==='percent'?(entry&&total?pnl/total/entry*100:0):pnl,unit};
}
// Preserve a position's cash value per price tick, including sub-cent P&L.
export function positionPnlIncrement(positions,quotes){
  const steps=positions.map(p=>positionMetrics(p,quotes[p.instrument]).increment).filter(n=>Number.isFinite(n)&&n>0);
  return Math.min(.01,...steps);
}
export function formatMoney(value,increment=.01){
  if(value==null||value===''||!Number.isFinite(Number(value)))return '—';
  const n=Number(value),step=Number(increment),precision=Number.isFinite(step)&&step>0?Math.ceil(-Math.log10(step)-1e-10):2;
  const small=n!==0&&Math.abs(n)<.01?Math.ceil(-Math.log10(Math.abs(n)))+1:2;
  const digits=Math.min(8,Math.max(2,precision,small));
  return '$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:digits});
}
export function formatPnl(metrics){const {value,unit}=metrics,n=Math.abs(value).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});return (value<0?'−':'+')+(unit==='money'?formatMoney(Math.abs(value),metrics.increment):unit==='percent'?n+'%':n+' ticks');}
export function formatTradePrice(value){return Number(value).toLocaleString('en-US',{maximumFractionDigits:8});}
export function tradingLevels(state,market,config){
  const levels=[];
  if(config.orders)for(const o of state.orders.filter(x=>x.instrument===market&&['working','triggered'].includes(x.status))){
    for(const [field,color] of [['price',tradeColors.entry],['trigger',tradeColors.entry],['stop',tradeColors.stop],['target',tradeColors.target]])if(o[field]&&(config.brackets||!['stop','target'].includes(field)))levels.push({key:o.id+field,item:o,field,price:Number(o[field]),label:['price','trigger'].includes(field)?o.side.toUpperCase()+' '+o.kind.replace('_',' ').toUpperCase()+' · '+o.qty+' @ '+formatTradePrice(o[field])+' · '+o.status.toUpperCase():bracketLabel(o,field,state.quotes[market]),color,kind:'order'});
  }
  if(config.positions)for(const p of state.positions.filter(x=>x.instrument===market)){
    const metrics=positionMetrics(p,state.quotes[market],config.pnlUnit);
    for(const [field,label,color] of [['entry',(p.side==='buy'?'LONG':'SHORT')+' '+p.qty+' · ENTRY @ '+formatTradePrice(p.entry)+(config.pnl?' · P&L '+formatPnl(metrics):''),tradeColors[p.side]],['stop',bracketLabel(p,'stop',state.quotes[market]),tradeColors.stop],['target',bracketLabel(p,'target',state.quotes[market]),tradeColors.target]])if(p[field]&&(config.brackets||field==='entry'))levels.push({key:p.id+field,item:p,field,price:Number(p[field]),label,color,kind:'position'});
  }
  return levels;
}
// A resting order belongs to the instrument/account, not the visible candle range.
// Keep off-scale controls accessible without drawing a false line at the pane edge.
export function tradeLevelPlacement(y,{top,height}){
  if(!Number.isFinite(y)||!Number.isFinite(top)||!Number.isFinite(height)||height<=0)return null;
  const bottom=top+height,edge=y<=top?'top':y>=bottom?'bottom':null;
  return {y:edge==='top'?Math.min(top+46,bottom-13):edge==='bottom'?Math.max(top+13,bottom-13):y,edge};
}
export function ladderPrices(center,tick,multiplier=1,count=25){const step=tick*multiplier,base=Math.round(center/step);return Array.from({length:count},(_,i)=>Number(((base+Math.floor(count/2)-i)*step).toPrecision(12))).filter(x=>x>0);}
