import test from 'node:test';
import assert from 'node:assert/strict';

// Exercise the real module's public click and event handlers with a minimal DOM
// host. The delayed transport reproduces two account requests overlapping.
test('opening another account while a snapshot is pending preserves account/data identity',async t=>{
 const nodes=new Map(),listeners=new Map(),calls=[];
 const element=id=>{
  if(!nodes.has(id))nodes.set(id,{id,innerHTML:'',textContent:'',value:'',dataset:{},open:false,disabled:false,isConnected:true,
   setAttribute(){},querySelectorAll(){return [];},addEventListener(){},showModal(){this.open=true;},close(){this.open=false;}});
  return nodes.get(id);
 };
 const globals={document:globalThis.document,window:globalThis.window,CustomEvent:globalThis.CustomEvent,location:globalThis.location,fetch:globalThis.fetch,setInterval:globalThis.setInterval};
 t.after(()=>{for(const [key,value] of Object.entries(globals))if(value===undefined)delete globalThis[key];else globalThis[key]=value;});
 globalThis.document={createElement:()=>element('dialog'),body:{append(){}},querySelector:element,querySelectorAll:()=>[]};
 globalThis.window={addEventListener:(name,fn)=>listeners.set(name,fn),dispatchEvent(){}};
 globalThis.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options?.detail;}};
 globalThis.location={search:''};globalThis.setInterval=()=>0;
 let release,started;const pending=new Promise(r=>started=r);
 const data=account=>({sources:{portfolio:{data:{cash:account==='A'?'111.00':'222.00',total_value:'500.00'},status:'complete',observedAt:Date.now()/1000,pages:1}}});
 globalThis.fetch=async(url,options)=>({ok:true,json:async()=>{
  calls.push({url,payload:options?.body?JSON.parse(options.body):null});
  if(url.endsWith('/session'))return {};
  if(url.endsWith('/status'))return {connected:true,accounts:[{id:'A',name:'Account A',account:'••••1111',tradable:true},{id:'B',name:'Account B',account:'••••2222',tradable:true}]};
  if(url.endsWith('/agents'))return {agents:[]};if(url.endsWith('/runs'))return {runs:[]};
  if(url.includes('/snapshot?accountId=A')){started();return new Promise(r=>release=r);}
  if(url.includes('/snapshot?accountId=B'))return data('B');
  if(url.endsWith('/sync'))return data(JSON.parse(options.body).accountId);
  throw Error('Unexpected test request '+url);
 }});
 await import('../web/robinhood-workspace.mjs?account-race');
 const first=element('#robinhoodButton').onclick();await pending;
 await listeners.get('desk:open-robinhood-account')({detail:{accountId:'B'}});
 assert.equal(element('#rhWorkspaceAccounts').value,'A');
 assert.match(element('#rhWorkspaceMessage').textContent,/current account request/);
 release(data('A'));await first;
 assert.match(element('#rhWorkspaceContent').innerHTML,/111\.00/);
 assert.equal(calls.find(c=>c.url.endsWith('/sync')).payload.accountId,'A');
 await listeners.get('desk:open-robinhood-account')({detail:{accountId:'B'}});
 assert.equal(element('#rhWorkspaceAccounts').value,'B');
 assert.match(element('#rhWorkspaceContent').innerHTML,/222\.00/);
 assert.doesNotMatch(element('#rhWorkspaceContent').innerHTML,/111\.00/);
});
