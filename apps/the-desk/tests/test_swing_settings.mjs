import test from 'node:test';
import assert from 'node:assert/strict';
import {settingsController} from '../web/swing-settings.mjs';
function harness(request){
 const fields=[{name:'quantity',type:'number',value:''},{name:'study_window',type:'number',value:''},{name:'jev_enabled',type:'checkbox',checked:false}];
 const listeners={};let market='hyperliquid:BTC',messages=[];
 const form={elements:fields,addEventListener:(n,f)=>listeners[n]=f,reportValidity:()=>true};
 const c=settingsController({form,market:()=>market,request,onState:()=>{},onMessage:m=>messages.push(m),storage:null});
 return {c,fields,listeners,messages,setMarket:v=>market=v};
}
const state=(quantity=.001,revision='r1')=>({symbols:{'hyperliquid:BTC':{revision,config:{quantity,study_window:5,jev_enabled:true}},'hyperliquid:ETH':{revision:'e1',config:{quantity:.01,study_window:8,jev_enabled:false}}}});
test('one click waits for complete settings even before history exists',async()=>{
 let resolve;const gate=new Promise(r=>resolve=r);const writes=[];
 const h=harness(async(path,body)=>{if(body){writes.push(body);return {};}return gate;});
 assert.equal(h.fields[0].disabled,true);const started=h.c.start();await Promise.resolve();assert.equal(writes.length,0);
 resolve(state());await started;assert.equal(writes.length,1);assert.equal(writes[0].config.quantity,.001);assert.equal(writes[0].expected_revision,'r1');assert.equal(writes[0].action,'start_auto');
});
test('manual edits survive refresh and stale revision is preserved',async()=>{
 let data=state();let sent;const h=harness(async(p,b)=>b?(sent=b):data);await h.c.load();
 h.fields[0].value='.002';h.listeners.input();data=state(.003,'r2');await h.c.start();
 assert.equal(sent.config.quantity,.002);assert.equal(sent.expected_revision,'r1');
});
test('failed settings never submit empty numeric fields',async()=>{
 let writes=0;const h=harness(async(p,b)=>{if(b)writes++;throw Error('offline');});
 await assert.rejects(h.c.start(),/offline/);assert.equal(writes,0);assert.equal(h.c.ready,false);
});
test('market change during load cannot submit another markets quantity',async()=>{
 let resolve;let n=0;const gate=new Promise(r=>resolve=r);let sent;
 const h=harness(async(p,b)=>{if(b){sent=b;return {};}return ++n===1?gate:state();});
 const first=h.c.load();h.setMarket('hyperliquid:ETH');h.c.preview();const start=h.c.start();resolve(state());await first;await start;
 assert.equal(sent.symbol,'hyperliquid:ETH');assert.equal(sent.config.quantity,.01);assert.equal(sent.config.study_window,8);
});
