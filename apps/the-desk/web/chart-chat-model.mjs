import {canonicalFrame} from './spider-model.mjs';
import {marketIdentity} from './trading-model.mjs';
export const owned=d=>d.text?.value?.startsWith('Desk AI · ');
export const frame=tf=>String(tf)==='120'?'2h':canonicalFrame(tf);
export const drawingScope=d=>d.text?.value?.split(' · ')[2]||'';
export const scopeKey=s=>s.symbol+'|'+s.timeframe;
export function requestedFrame(text){
 if(/\b(daily|day chart)\b/i.test(text))return 'D';
 if(/\bhourly\b/i.test(text))return '60';
 const m=text.toLowerCase().match(/\b(one|two|three|four|five|fifteen|thirty|\d+)\s*[- ]?\s*(minute|min|m|hour|hr|h|day|d)\b/);
 if(!m)return null;const n=({one:1,two:2,three:3,four:4,five:5,fifteen:15,thirty:30})[m[1]]||Number(m[1]);
 const unit=m[2][0];return unit==='h'?String(n*60):unit==='d'?'D':String(n);
}
export function chartScope(ws,cell=ws.active){return {cellId:cell.id,symbol:marketIdentity(cell.chart),timeframe:frame(cell.chart.market.timeframe),replay:!!ws.replay.state.active};}
export function sameScope(a,b){return ['cellId','symbol','timeframe','replay'].every(k=>a[k]===b[k]);}
export function chartSnapshot(ws){
 const c=ws.active.chart,n=c.renderer?.renderer||c.rendererControl?.renderer,bars=n?.scene?.bars;
 if(!Array.isArray(bars)||!bars.length)throw Error('Chart candles are still loading. Try again when the chart is visible.');
 if(ws.replay.state.active)throw Error('Exit replay for this MVP. Replay-cutoff analysis is not enabled.');
 const style=n.scene.priceStyle||n.scene.style||'candles';
 return {...chartScope(ws),style:typeof style==='string'?style:style.type||'candles',timezone:'UTC',cutoff:Date.now(),
  bars:bars.slice(-1000).map(b=>({time:b.time,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.volume??null}))};
}
export function applyMarkup(chart,result){
 const previous=chart.drawings.all().filter(owned).map(d=>structuredClone(d.serialize?.()||d));
 const ids=[];
 try{
  for(const spec of result.drawings){const d=chart.drawings.add(spec.type,spec.options);if(!d?.id)throw Error('Chart rejected '+spec.type);ids.push(d.id);}
 }catch(e){for(const id of ids)chart.drawings.remove(id);throw e;}
 // Commit only after every new drawing exists. One concept replaces only itself.
 const concept=result.action==='clear'?null:result.action;
 const matches=d=>result.action==='clear'||(d.text?.value?.startsWith('Desk AI · '+concept+' · ')&&(!result.scope||drawingScope(d)===result.scope));
 const removed=previous.filter(matches);
 for(const d of removed)chart.drawings.remove(d.id);
 return {ids,removed};
}
export function restoreMarkup(chart,change){
 for(const id of change.ids)chart.drawings.remove(id);
 for(const d of change.removed)chart.drawings.add(d.type,{...d,id:undefined});
}
