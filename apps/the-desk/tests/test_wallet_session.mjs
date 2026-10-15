import test from 'node:test';
import assert from 'node:assert/strict';
import {WalletController} from '../web/wallet-model.mjs';
import {restoreWalletSession} from '../web/wallet-session.mjs';

const address='0x1111111111111111111111111111111111111111';
function fixture({session=true}={}) {
  const calls=[];
  const api=async(path)=>{calls.push(path);if(path==='/api/wallet/session')return session?{authenticated:true,address,chainId:8453}:{authenticated:false};if(path==='/api/wallet/logout')return {authenticated:false};throw new Error(path);};
  return {controller:new WalletController(api),calls};
}
function provider(){return {on(){},removeListener(){}};}

test('empty provider provenance revokes an authenticated cookie before rendering',async()=>{
  const f=fixture(),choices=[];
  const restored=await restoreWalletSession({controller:f.controller,savedProvider:'',config:{},hardware:provider(),createPairing:()=>{throw new Error('unexpected pairing');},forgetProvider:()=>{},showChoices:()=>choices.push(true)});
  assert.equal(restored,false);assert.equal(f.controller.session,null);assert.deepEqual(f.calls,['/api/wallet/logout']);assert.deepEqual(choices,[true]);
});

test('missing mobile configuration revokes the cookie without restoring a relay',async()=>{
  const f=fixture(),removed=[],choices=[],pairings=[];
  const restored=await restoreWalletSession({controller:f.controller,savedProvider:'walletconnect',config:{},hardware:provider(),createPairing:()=>{pairings.push(true);return {restore:async()=>provider()};},forgetProvider:()=>removed.push(true),showChoices:()=>choices.push(true)});
  assert.equal(restored,false);assert.equal(f.controller.session,null);assert.deepEqual(f.calls,['/api/wallet/logout']);assert.deepEqual(removed,[true]);assert.deepEqual(choices,[true]);assert.deepEqual(pairings,[]);
});

test('known Ledger provenance binds before restoring the authenticated cookie',async()=>{
  const f=fixture(),hardware=provider();
  const restored=await restoreWalletSession({controller:f.controller,savedProvider:'ledger-usb',config:{},hardware,createPairing:()=>{throw new Error('unexpected pairing');},forgetProvider:()=>{},showChoices:()=>{}});
  assert.equal(restored,true);assert.equal(f.controller.session.address,address);assert.equal(f.controller.provider,hardware);assert.deepEqual(f.calls,['/api/wallet/session']);
});
