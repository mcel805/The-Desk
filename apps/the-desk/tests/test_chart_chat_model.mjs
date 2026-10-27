import test from 'node:test';
import assert from 'node:assert/strict';
import {requestedFrame,sameScope,applyMarkup,restoreMarkup,chartSnapshot,frame} from '../web/chart-chat-model.mjs';
function chart(initial=[]){let n=0;const rows=structuredClone(initial);return {drawings:{all:()=>structuredClone(rows),add:(type,options)=>{if(type==='bad')return null;const d={...structuredClone(options),type,id:'new'+ ++n};rows.push(d);return d;},remove:id=>{const i=rows.findIndex(d=>d.id===id);if(i>=0)rows.splice(i,1);}}};}
const drawing=(id,text)=>({id,type:'hline',text:{value:text},anchors:[{time:1,price:100}]});
test('requested natural language timeframes route the two user scenarios',()=>{
 assert.equal(requestedFrame('on the one-minute chart profile every swing'),'1');
 assert.equal(requestedFrame('draw liquidity on the three-minute chart'),'3');
 assert.equal(requestedFrame('On the 30-minute chart draw liquidity'),'30');
 assert.equal(requestedFrame('on 4h chart'),'240');
 assert.equal(frame(requestedFrame('on 2h chart')),'2h');
 assert.equal(frame(requestedFrame('on daily chart')),'1d');
 assert.equal(requestedFrame('what is the current trend?'),null);
});
test('only matching concept is replaced and undo restores exact prior geometry',()=>{
 const manual=drawing('manual','My high'),spider=drawing('spider','Spider · level'),old=drawing('old','Desk AI · liquidity · old'),profile=drawing('profile','Desk AI · volume_profile · swing');
 const c=chart([manual,spider,old,profile]);const delta=applyMarkup(c,{action:'liquidity',drawings:[{type:'hline',options:{text:{value:'Desk AI · liquidity · new'}}}]});
 assert.deepEqual(c.drawings.all().map(d=>d.id),['manual','spider','profile','new1']);restoreMarkup(c,delta);
 assert.equal(c.drawings.all().find(d=>d.text.value===old.text.value).anchors[0].price,100);
 assert.equal(c.drawings.all().length,4);
});
test('renderer rejection rolls back the entire new batch and keeps old markup',()=>{
 const old=drawing('old','Desk AI · liquidity · old');const c=chart([old]);
 assert.throws(()=>applyMarkup(c,{action:'liquidity',drawings:[{type:'hline',options:{}},{type:'bad',options:{}}]}));assert.deepEqual(c.drawings.all(),[old]);
});
test('clear preserves manual and Spider drawings, and can be undone',()=>{
 const c=chart([drawing('m','Manual'),drawing('s','Spider · high'),drawing('ai','Desk AI · liquidity · high')]);
 const d=applyMarkup(c,{action:'clear',drawings:[]});assert.deepEqual(c.drawings.all().map(x=>x.id),['m','s']);restoreMarkup(c,d);assert.equal(c.drawings.all().length,3);
});
test('cell, symbol, timeframe and replay changes each invalidate scope',()=>{
 const s={cellId:'a',symbol:'hyperliquid:BTC',timeframe:'1m',replay:false};assert.ok(sameScope(s,{...s}));
 for(const field of Object.keys(s))assert.equal(sameScope(s,{...s,[field]:'changed'}),false);
});
test('replay cannot accidentally inspect future chart history',()=>{
 const ws={active:{id:'a',chart:{market:{symbol:'hyperliquid:BTC',timeframe:'1'},renderer:{renderer:{scene:{bars:[{time:1}]}}}}},replay:{state:{active:true}}};assert.throws(()=>chartSnapshot(ws),/Exit replay/);
});
test('redraw only replaces the same concept on the same source and timeframe',()=>{
 const a=drawing('a','Desk AI · liquidity · hyperliquid:BTC|1m · old'),b=drawing('b','Desk AI · liquidity · hyperliquid:BTC|30m · parent');
 const c=chart([a,b]);applyMarkup(c,{action:'liquidity',scope:'hyperliquid:BTC|1m',drawings:[{type:'hray',options:{text:{value:'Desk AI · liquidity · hyperliquid:BTC|1m · new'}}}]});
 assert.deepEqual(c.drawings.all().map(x=>x.id),['b','new1']);
});
