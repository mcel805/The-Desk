// Observed Hyperliquid executions only; gaps and partial coverage stay explicit.
export class TradeTape {
 constructor(limit=10000){this.limit=limit;this.clear('');}
 clear(instrument){this.instrument=instrument;this.rows=[];this.ids=new Set();this.since=Date.now();this.status='connecting';}
 add(t){
  if(t.instrument!==this.instrument||!t.instrument.startsWith('hyperliquid:')||!['B','A'].includes(t.side)||!Number.isFinite(t.qty)||t.qty<=0||!Number.isFinite(t.price)||t.price<=0||!Number.isFinite(t.time)||t.id==null)return;
  const key=t.time+':'+t.id;if(this.ids.has(key))return;this.ids.add(key);this.rows.push({...t,key});
  if(this.rows.length>this.limit){const removed=this.rows.shift();this.ids.delete(removed.key);this.since=Math.max(this.since,removed.time);}
 }
 snapshot({minutes=1,tick=1}={}){
  if(!Number.isFinite(tick)||tick<=0||!Number.isFinite(minutes)||minutes<=0)throw Error('Invalid footprint grouping');
  const buckets=new Map();for(const t of this.rows){const time=Math.floor(t.time/(minutes*60000))*minutes*60000,price=Number((Math.round(t.price/tick)*tick).toPrecision(12)),key=time+':'+price;let b=buckets.get(key);if(!b){b={time,price,buy:0,sell:0,count:0};buckets.set(key,b);}b[t.side==='B'?'buy':'sell']+=t.qty;b.count++;}
  const levels=[...buckets.values()].sort((a,b)=>b.time-a.time||b.price-a.price).slice(0,200).map(b=>({...b,delta:b.buy-b.sell}));
  return {instrument:this.instrument,source:'Hyperliquid public trades',status:this.status,coverageStart:this.since,coverageEnd:this.rows.at(-1)?.time??null,observedTrades:this.rows.length,partial:true,note:'Observed since connection; reconnect gaps and trimmed history are not backfilled. No historical/full-session delta claim.',levels};
 }
}
export const tape=new TradeTape();
export function setupFootprint(){
 const panel=document.createElement('section');panel.id='footprintPanel';panel.hidden=true;panel.innerHTML='<header><strong>Observed footprint</strong><button id="footprintClose" aria-label="Close footprint">×</button></header><p id="footprintStatus"></p><div id="footprintRows"></div>';
 document.querySelector('.chart-section').append(panel);panel.querySelector('#footprintClose').onclick=()=>panel.hidden=true;
 const button=document.createElement('button');button.id='footprintButton';button.textContent='Footprint';document.querySelector('.quote-strip .header-spacer').before(button);button.onclick=()=>panel.hidden=!panel.hidden;
 window.addEventListener('desk:open-footprint',()=>{panel.hidden=false;});
 setInterval(()=>{if(panel.hidden)return;const s=tape.snapshot();panel.querySelector('#footprintStatus').textContent=`${s.instrument} · ${s.status} · ${s.observedTrades} observed executions · 1m / 1 USD grouping. Partial coverage since ${new Date(s.coverageStart).toISOString()}.`;
  const body=panel.querySelector('#footprintRows');body.replaceChildren();if(!s.levels.length){body.textContent='No supported executions observed. Hyperliquid trades only; candle volume is not bid/ask volume.';return;}
  const table=document.createElement('table');table.innerHTML='<thead><tr><th>UTC minute</th><th>Price</th><th>Sell</th><th>Buy</th><th>Delta</th></tr></thead>';const tbody=document.createElement('tbody');for(const row of s.levels.slice(0,60)){const tr=document.createElement('tr');for(const value of [new Date(row.time).toISOString().slice(11,16),row.price,row.sell.toFixed(4),row.buy.toFixed(4),row.delta.toFixed(4)]){const td=document.createElement('td');td.textContent=value;tr.append(td);}tbody.append(tr);}table.append(tbody);body.append(table);
 },500);
}
