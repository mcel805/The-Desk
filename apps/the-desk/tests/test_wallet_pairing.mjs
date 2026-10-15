import test from 'node:test';
import assert from 'node:assert/strict';
import {WalletPairing} from '../web/wallet-pairing.mjs';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function fixture(){
  let options,connectResolve;const listeners=new Map(),calls=[];
  const provider={session:null,on(event,fn){listeners.set(event,fn)},removeListener(event,fn){if(listeners.get(event)===fn)listeners.delete(event)},async connect(){calls.push('connect');listeners.get('display_uri')?.('wc:test-session@2?relay-protocol=irn&symKey=test-only');await new Promise(r=>connectResolve=r);this.session={topic:'test-only'}},async disconnect(){calls.push('disconnect');this.session=null;}};
  const pairing=new WalletPairing({projectId:'a'.repeat(32),origin:'http://127.0.0.1:18880',load:async()=>({EthereumProvider:{init:async input=>{options=input;return provider;}}}),onURI:uri=>calls.push(uri)});
  return {provider,pairing,calls,listeners,options:()=>options,approve:()=>connectResolve()};
}
test('unconfigured QR pairing never initializes a relay or creates a fake URI',async()=>{
  let loaded=false;const pairing=new WalletPairing({load:async()=>{loaded=true},projectId:'',origin:'http://127.0.0.1:18880'});
  await assert.rejects(pairing.connect(),/project ID/);assert.equal(loaded,false);
});
test('mobile pairing uses Base and matching origin, presents actual URI, and returns only approved provider',async()=>{
  const f=fixture(),pending=f.pairing.connect();await tick();assert.equal(f.pairing.provider,null);assert(f.calls.some(x=>x.startsWith('wc:')));
  assert.deepEqual(f.options().optionalChains,[8453]);assert.equal(f.options().metadata.url,'http://127.0.0.1:18880');assert.equal(f.options().showQrModal,false);
  f.approve();assert.equal(await pending,f.provider);assert.equal(f.provider.kind,'walletconnect');assert.equal(f.listeners.size,0);
  await f.pairing.disconnect();assert.equal(f.pairing.provider,null);assert(f.calls.includes('disconnect'));
});
test('cancelled QR attempt cannot later install an approved session',async()=>{
  const f=fixture(),pending=f.pairing.connect();await tick();await f.pairing.disconnect();await assert.rejects(pending,/cancelled/);
  f.approve();await tick();assert.equal(f.pairing.provider,null);assert(f.calls.includes('disconnect'));assert.equal(f.listeners.size,0);
});
test('cancel during SDK loading never starts a pairing after back navigation',async()=>{
  const f=fixture();let resolveLoad;f.pairing.load=()=>new Promise(r=>resolveLoad=r);const pending=f.pairing.connect();await f.pairing.disconnect();await assert.rejects(pending,/cancelled/);
  resolveLoad({EthereumProvider:{init:async()=>f.provider}});await tick();assert(!f.calls.includes('connect'));assert(f.calls.includes('disconnect'));
});
test('existing mobile session restores without displaying a QR or requesting a new approval',async()=>{
  const f=fixture();f.provider.session={topic:'previous-session'};assert.equal(await f.pairing.restore(),f.provider);assert(!f.calls.includes('connect'));
});
