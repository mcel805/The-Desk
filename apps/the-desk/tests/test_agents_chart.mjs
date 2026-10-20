import test from 'node:test';
import assert from 'node:assert/strict';

test('chart bridge excludes synchronized copies and namespaces independent cell drawings',async()=>{
 const original={window:globalThis.window,fetch:globalThis.fetch,localStorage:globalThis.localStorage,setInterval:globalThis.setInterval};
 const store=new Map(),requests=[];globalThis.localStorage={getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)};
 globalThis.window=new EventTarget();globalThis.fetch=async(_,o)=>{requests.push(JSON.parse(o.body));return {ok:true};};globalThis.setInterval=()=>0;
 try{
  const {setupAgentsChart}=await import('../web/agents-chart.mjs');
  function cell(id,symbol){const events={},rows=[];return {id,events,rows,chart:{market:{symbol,timeframe:'1'},on:(e,f)=>{events[e]=f;},drawings:{all:()=>rows},indicators:()=>[]}};}
  const btc=cell('btc-cell','HYPERLIQUID:BTC'),eth=cell('eth-cell','HYPERLIQUID:ETH'),other=cell('other-btc-cell','HYPERLIQUID:BTC');
  const ws={active:btc,cells:()=>[btc,eth,other],get chart(){return this.active.chart;},replay:{state:{active:false}}};
  const bridge=setupAgentsChart({workspace:()=>ws,instrument:()=>ws.active.chart.market.symbol.replace('HYPERLIQUID:','hyperliquid:'),toast:()=>{}});bridge.attach();
  const line={id:'dw-1',type:'hline',anchors:[{time:1,price:100}],style:{lineColor:'#00ffff'}};
  btc.rows.push({...line});eth.rows.push({...line});
  // Vela propagates a destination creation synchronously before the origin's later listener.
  eth.events['drawing:created']({id:'dw-1'});btc.events['drawing:created']({id:'dw-1'});
  await new Promise(setImmediate);await bridge.publish();
  const first=requests.at(-1).levels[0];assert.equal(first.id,'drawing:btc-cell:dw-1');
  ws.active=eth;await bridge.publish();assert.deepEqual(requests.at(-1).levels,[],'copied BTC line cannot become an ETH signal');
  ws.active=other;other.rows.push({...line});other.events['drawing:created']({id:'dw-1'});await new Promise(setImmediate);await bridge.publish();
  assert.equal(requests.at(-1).levels[0].id,'drawing:other-btc-cell:dw-1');assert.notEqual(requests.at(-1).levels[0].id,first.id);
  const pool=price=>({liquidity:true,instrument:'hyperliquid:BTC',timeframe:'1',observedAt:Date.now(),lastBarTime:200,lines:[{id:'pool',xloc:'bar_time',x1:100,x2:300,y1:price,y2:price,style:'solid',width:2,extend:'none'}]});
  const handle=price=>({id:'ind-1',source:'indicator("Agentic - Liquidity"',visible:true,context:async select=>{assert.equal(select.deskAgentLevels,true);return pool(price);}});
  btc.chart.indicators=()=>[handle(100)];other.chart.indicators=()=>[handle(200)];
  ws.active=btc;await bridge.publish();assert.equal(requests.at(-1).levels.find(l=>l.source==='liquidity').price,'100');
  ws.active=other;await bridge.publish();assert.equal(requests.at(-1).levels.find(l=>l.source==='liquidity').price,'200');
  assert.equal(requests.at(-1).levels.find(l=>l.source==='liquidity').id,'liquidity:other-btc-cell:ind-1:bar_time:100:200');
  btc.chart.indicators=()=>[{...handle(100),visible:false}];ws.active=btc;await bridge.publish();assert.equal(requests.at(-1).levels.filter(l=>l.source==='liquidity').length,0);
 }finally{Object.assign(globalThis,original);}
});
