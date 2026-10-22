import test from 'node:test';
import assert from 'node:assert/strict';
import {ABCSharedDisplay,sharedABCModel} from '../web/abc-shared-display.mjs';
const start=Date.UTC(2026,9,21),minute=60000,market=(tf='1',symbol='hyperliquid:ETH')=>({symbol,timeframe:tf,chartStyle:'standard'});
const bars=[{time:start+30*minute}],prefix='abc:play:1:one';
const source=(tf='1',symbol)=>({market:market(tf,symbol),cutoff:start+30*minute-Number(tf)*minute,model:{abcPlays:[{drawingPrefix:prefix,direction:1,level:2483.3,start:{time:start+7*minute,price:2483.3},end:null,status:'in-play'}],lines:[{id:prefix+':in-play',x1:start+7*minute,x2:start+40*minute,y1:2483.3,y2:2483.3,style:'dashed',color:'#FFD94A'},{id:prefix+':start-tick',x1:start+7*minute,x2:start+9*minute,y1:2483.3,y2:2483.3},{id:prefix+':A',x1:start,y1:10}],labels:[{id:prefix+':start-tag',x:start+7*minute,y:2483.3,text:'START'},{id:prefix+':level-tag',x:start+29*minute,y:2483.3,text:'TOUCHED 2,483.3 · IN PLAY'}],boxes:[{id:prefix+':highlight',left:start+7*minute,right:start+40*minute,top:2483.3,bottom:2483}]}});
const base={inputValues:{keepHistory:true},series:[{title:'ABC audit · contact',points:[{time:start,value:0}]}],lines:[],labels:[],boxes:[],tables:[],abcBridge:{connected:false}};
test('30m sees exact 1m price and event time, visible marker length, and tick-sized shading without text or audit changes',()=>{
 const s=source(),before=structuredClone(s),m=sharedABCModel(base,s,{market:market('30'),bars,id:'target'});
 assert.equal(m.abcPlays[0].level,2483.3);assert.equal(m.abcPlays[0].start.time,start+7*minute);
 assert.equal(m.lines.find(l=>l.id.endsWith(':start-tick')).x2,start+22*minute);
 assert.equal(m.labels.length,0,'play text is omitted on higher timeframes too');assert.equal(m.boxes[0].top,s.model.boxes[0].top);assert.equal(m.boxes[0].bottom,s.model.boxes[0].bottom);
 assert.equal(m.lines.find(l=>l.id.endsWith(':in-play')).y1,2483.3);assert.equal(m.lines.length,2);
 assert.deepEqual(m.series,base.series);assert.equal(m.abcBridge.connected,false);assert.equal(m.abcShared.displayOnly,true);assert.deepEqual(s,before);
});
test('publication arrival/removal notifies targets; 1m wins over 5m regardless of arrival order',()=>{
 const shared=new ABCSharedDisplay();let changes=0;const unsubscribe=shared.subscribe(()=>changes++);
 shared.publish('five',source('5'));assert.equal(shared.select(market('30'),bars).market.timeframe,'5');
 shared.publish('one',source());assert.equal(shared.select(market('30'),bars).market.timeframe,'1');
 shared.remove('one');assert.equal(shared.select(market('30'),bars).market.timeframe,'5');
 shared.remove('five');assert.equal(shared.select(market('30'),bars),null);assert.equal(changes,4);unsubscribe();assert.equal(shared.listeners.size,0);
});
test('reject mixed providers, symbols, styles, stale/future snapshots and ambiguous duplicate sources',()=>{
 const shared=new ABCSharedDisplay();shared.publish('one',source());
 for(const symbol of ['coinbase:ETH','hyperliquid:BTC'])assert.equal(shared.select(market('30',symbol),bars),null);
 assert.equal(shared.select({...market('30'),chartStyle:'heikinashi'},bars),null);
 assert.equal(shared.select(market('1'),bars),null);
 assert.equal(shared.select(market('30'),[{time:start+31*minute}]),null);
 assert.equal(shared.select(market('30'),[{time:start-30*minute}]),null);
 shared.publish('duplicate',source());assert.equal(shared.select(market('30'),bars),null);
});
test('completed source endpoints stay frozen across HTFs and target history preference is honored',()=>{
 const s=source();s.model.abcPlays[0].end={time:start+27*minute,price:2436.5,reason:'Next liquidity level'};s.model.abcPlays[0].status='complete';
 s.model.lines=[{id:prefix+':retired-level',x1:start+7*minute,x2:start+27*minute,y1:2483.3,y2:2483.3,style:'dashed',color:'#00B8A966'},{id:prefix+':end-tick',x1:start+27*minute,x2:start+29*minute,y1:2436.5,y2:2436.5}];
 s.model.labels.push({id:prefix+':end-tag',x:start+27*minute,y:2436.5,text:'END'});s.model.boxes=[];
 const m=sharedABCModel(base,s,{market:market('60'),bars,id:'target'});assert.deepEqual(m.abcPlays,s.model.abcPlays);assert.equal(m.lines[0].x2,start+27*minute);assert.equal(m.labels.length,0);
 const hidden=sharedABCModel({...base,inputValues:{keepHistory:false}},s,{market:market('30'),bars,id:'target'});assert.equal(hidden.lines.length,0);assert.equal(hidden.labels.length,0);assert.equal(hidden.abcPlays.length,0);
});
