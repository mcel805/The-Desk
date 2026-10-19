import test from 'node:test';
import assert from 'node:assert/strict';
import {setupChartAccount} from '../web/chart-account.mjs';

test('account switches discard pending balances and asset lists, including retained row handlers',async t=>{
 const nodes=new Map(),events=new Map(),storage=new Map(),rowButtons=[];
 function element(id){
  if(!nodes.has(id))nodes.set(id,{id,innerHTML:'',textContent:'',value:'',dataset:{},open:false,hidden:false,disabled:false,
   setAttribute(){},append(){},showModal(){this.open=true;},close(){this.open=false;},
   querySelectorAll(selector){return selector==='[data-broker-asset]'?rowButtons:[];}});
  return nodes.get(id);
 }
 const saved=Object.fromEntries(['document','window','localStorage','fetch','setInterval'].map(k=>[k,globalThis[k]]));
 t.after(()=>{for(const [key,value] of Object.entries(saved))if(value===undefined)delete globalThis[key];else globalThis[key]=value;});
 globalThis.document={createElement:tag=>element(tag),querySelector:element,body:{append(){}}};
 globalThis.window={addEventListener:(name,fn)=>events.set(name,fn)};
 globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 globalThis.setInterval=()=>0;
 let holdSync=false,releaseSync,startedSync,holdCatalog=false,releaseCatalog,startedCatalog;
 let syncStarted=new Promise(r=>startedSync=r),catalogStarted=new Promise(r=>startedCatalog=r);
 const portfolio=id=>({accountId:id,sources:{portfolio:{status:'complete',observedAt:Date.now()/1000,data:{cash:id==='A'?'100':'200',total_value:id==='A'?'111':'222',buying_power:{buying_power:'250'}}}}});
 globalThis.fetch=async(url,options)=>({ok:true,json:async()=>{
  if(url.endsWith('/session'))return {};
  if(url.endsWith('/status'))return {connected:true,observedAt:Date.now()/1000,accounts:[{id:'A',name:'A',account:'••••1111',tradable:true},{id:'B',name:'B',account:'••••2222',tradable:true}]};
  if(url.endsWith('/sync')){const id=JSON.parse(options.body).accountId;if(holdSync&&id==='A'){startedSync();return new Promise(r=>releaseSync=r);}return portfolio(id);}
  if(url.includes('/markets/crypto?')){
   const id=new URL('http://test'+url).searchParams.get('accountId');
   if(holdCatalog&&id==='A'){startedCatalog();return new Promise(r=>releaseCatalog=r);}
   return {accountId:id,assets:[{id:id+'-btc',kind:'crypto',symbol:'BTC-USD',name:id+' Bitcoin',eligible:true,restriction:'tradable'}],complete:true,observedAt:Date.now()/1000,scope:'fixture'};
  }
  throw Error('Unexpected fetch '+url);
 }});
 let market='hyperliquid:BTC';const selectedMarkets=[];
 const ui=setupChartAccount({paperAccounts:()=>[{id:'paper',name:'Paper'}],paperId:()=>'paper',onPaper:async()=>{},onChange(){},onMarket:async next=>{market=next;selectedMarkets.push(next);},instrument:()=>market,toast(){}});
 await ui.refresh(true);
 holdSync=true;
 const first=element('#accountSelect').onchange({target:{value:'rh:A'}});await syncStarted;
 await element('#accountSelect').onchange({target:{value:'paper'}});
 releaseSync(portfolio('A'));await first;
 assert.equal(ui.selected,'');assert.equal(ui.metrics.balance,undefined);
 assert.equal(element('#brokerAssetsButton').hidden,true);
 holdSync=false;
 const oldRow={dataset:{brokerAsset:'0'}};rowButtons.push(oldRow);
 await element('#accountSelect').onchange({target:{value:'rh:A'}});
 const oldClick=oldRow.onclick;
 assert.equal(ui.metrics.balance,'100');assert.match(element('#brokerAssetResults').innerHTML,/A Bitcoin/);
 holdCatalog=true;
 const pending=ui.openAssets();await catalogStarted;
 await element('#accountSelect').onchange({target:{value:'rh:B'}});
 await oldClick();
 assert.deepEqual(selectedMarkets,[]);assert.equal(ui.asset,null);
 releaseCatalog({accountId:'A',assets:[{id:'A-eth',kind:'crypto',symbol:'ETH-USD',name:'OLD A Ethereum'}],complete:true,observedAt:Date.now()/1000,scope:'fixture'});
 await pending;
 assert.equal(ui.selected,'B');assert.equal(ui.metrics.balance,'200');
 assert.match(element('#brokerAssetResults').innerHTML,/B Bitcoin/);
 assert.doesNotMatch(element('#brokerAssetResults').innerHTML,/OLD A Ethereum/);
});
