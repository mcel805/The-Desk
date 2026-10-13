import test from 'node:test';
import assert from 'node:assert/strict';
import {derivationPath,signatureHex,actionResult,ledgerOperation,usbInventory} from '../native-ledger.mjs';
import {HardwareProvider} from '../web/hardware-wallet.mjs';
import {WalletController} from '../web/wallet-model.mjs';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const address='0x1111111111111111111111111111111111111111';
const other='0x2222222222222222222222222222222222222222';
const message=`Desk login\nSign in to The Desk with your Base wallet.\nChain ID: 8453\nNonce: ${'a'.repeat(32)}\n`;
function observable(value){return {subscribe(handlers){queueMicrotask(()=>handlers.next(value));return {unsubscribe(){}};}};}
function sdkFixture(){
  const calls=[],device={id:randomUUID(),name:'Ledger Nano X',deviceModel:'nanoX'};
  const inventory=()=>usbInventory([{vendorId:0x2c97,productId:0x401,path:'physical-usb-device',usagePage:0xffa0}]);
  const dmk={startDiscovering:()=>({subscribe(h){queueMicrotask(()=>{h.next(device);h.complete();});return {unsubscribe(){}};}}),async stopDiscovering(){},async connect(p){calls.push(['connect',p]);return 'session';},async disconnect(p){calls.push(['disconnect',p]);},close(){calls.push(['close']);}};
  const action=output=>({observable:observable({status:'completed',output}),cancel(){}});
  const signer={getAddress(path,options){calls.push(['address',path,options]);return action({address});},signMessage(path,m){calls.push(['sign',path,m]);return action({r:'0x'+'1'.repeat(64),s:'0x'+'2'.repeat(64),v:0});}};
  return {dmk,signerFor:()=>signer,inventory,calls,deviceId:inventory()[0].id};
}
test('explicit account derivation supports Ledger Live and legacy without arbitrary paths',()=>{
  assert.equal(derivationPath('ledger-live',2),"44'/60'/2'/0/0");assert.equal(derivationPath('legacy',2),"44'/60'/0'/0/2");
  for(const [scheme,index] of [['ledger-live',20],['ledger-live',-1],['ledger-live',true],['arbitrary',0]])assert.throws(()=>derivationPath(scheme,index));
});
test('USB discovery exposes opaque identifiers; account selection confirms address on device and closes session',async()=>{
  const f=sdkFixture(),scan=await ledgerOperation({operation:'discover'},f);assert.equal(scan.devices[0].id,f.deviceId);assert(!JSON.stringify(scan).includes('physical-usb-device'));
  f.calls.length=0;const result=await ledgerOperation({operation:'account',deviceId:f.deviceId,scheme:'ledger-live',index:0,confirmAddress:true},f);
  assert.equal(result.address,address);assert.deepEqual(f.calls.find(c=>c[0]==='address')[2],{checkOnDevice:true});assert.deepEqual(f.calls.slice(-2).map(c=>c[0]),['disconnect','close']);
});
test('USB login signs actual text only after checking exact current address',async()=>{
  const f=sdkFixture(),input={operation:'sign-login',deviceId:f.deviceId,scheme:'legacy',index:0,address,message};
  assert.equal((await ledgerOperation(input,f)).signature,'0x'+'1'.repeat(64)+'2'.repeat(64)+'1b');assert.equal(f.calls.find(c=>c[0]==='sign')[2],message);
  f.calls.length=0;await assert.rejects(ledgerOperation({...input,address:other},f),/account changed/);assert(!f.calls.some(c=>c[0]==='sign'));assert.equal(f.calls.at(-1)[0],'close');
  await assert.rejects(ledgerOperation({...input,message:'arbitrary signing request'},f),/Only a Base/);
});
test('unsupported USB operations and unknown devices fail closed',async()=>{
  const f=sdkFixture();await assert.rejects(ledgerOperation({operation:'send-transaction'},f),/Unsupported/);
  await assert.rejects(ledgerOperation({operation:'account',deviceId:'unknown',scheme:'ledger-live',index:0},f),/No selected Ledger/);
  assert.throws(()=>signatureHex({r:'bad',s:'bad',v:0}));
});
test('device errors, rejection, cancellation, and approval timeout never return a signature',async()=>{
  for(const status of ['error','stopped'])await assert.rejects(actionResult({observable:observable({status,error:{name:'UserRefusedError'}}),cancel(){}}));
  let cancelled=false;await assert.rejects(actionResult({observable:{subscribe(){return {unsubscribe(){}};}},cancel(){cancelled=true;}},5),/timed out/);assert(cancelled);
});
function providerFixture(){
  let session={authenticated:false},selected=address;const calls=[];
  const api=async(path,p)=>{calls.push({path,p});switch(path){
    case '/api/wallet/hardware/selected':return {address:selected};
    case '/api/wallet/challenge':return {message,nonce:'a'.repeat(32)};
    case '/api/wallet/hardware/sign-login':return {signature:'test-signature'};
    case '/api/wallet/verify':return session={authenticated:true,address,chainId:8453};
    case '/api/wallet/session':return session;
    case '/api/wallet/logout':return session={authenticated:false};
    case '/api/wallet/hardware/disconnect':return {};
    case '/api/wallet/hardware/rpc':return {result:p.method==='eth_blockNumber'?'0x10':p.method==='eth_getBalance'?'0xde0b6b3a7640000':'0x12d687'};
    default:throw new Error(path);
  }};
  const provider=new HardwareProvider(api),controller=new WalletController(api);return {provider,controller,calls,switchAddress:()=>selected=other};
}
test('extension-free provider completes WalletController login and reads Base balances at same block',async()=>{
  const f=providerFixture();await f.controller.login(f.provider);assert.equal(f.controller.session.address,address);
  const balances=await f.controller.balances();assert.equal(balances.eth,'1');assert.equal(balances.usdc,'1.234567');
  assert.deepEqual(f.calls.find(c=>c.path.endsWith('sign-login')).p,{nonce:'a'.repeat(32),message});
  assert(f.calls.filter(c=>c.path.endsWith('/rpc')&&c.p.method!=='eth_blockNumber').every(c=>c.p.params[1]==='0x10'));
});
test('hardware account switch revokes identity before stale balance reads',async()=>{
  const f=providerFixture();await f.controller.login(f.provider);f.switchAddress();await assert.rejects(f.controller.balances());await f.controller.revoking;
  assert.equal(f.controller.session,null);assert(!f.calls.some(c=>c.path.endsWith('/rpc')));
});
test('hardware provider never forwards arbitrary signing or transfer requests',async()=>{
  const f=providerFixture();for(const method of ['eth_sign','eth_signTypedData_v4','eth_sendTransaction','wallet_addEthereumChain'])await assert.rejects(f.provider.request({method,params:[]}),e=>e.code===4200);
  assert.equal(f.calls.length,0);
});

test('USB identity survives SDK session IDs; no device and multiple devices fail safely',async()=>{
  const first=sdkFixture(),scan=await ledgerOperation({operation:'discover'},first),second=sdkFixture();
  assert.equal((await ledgerOperation({operation:'account',deviceId:scan.devices[0].id,scheme:'ledger-live',index:0},second)).address,address);
  const absent=sdkFixture();absent.inventory=()=>[];assert.deepEqual(await ledgerOperation({operation:'discover'},absent),{devices:[]});
  assert.throws(()=>usbInventory([{vendorId:0x2c97,productId:0x401,path:'a',usagePage:0xffa0},{vendorId:0x2c97,productId:0x401,path:'b',usagePage:0xffa0}]),/one Ledger/);
});
test('maintained SDK discovers through asynchronous HID enumeration across fresh workers',()=>{
  const fixture=fileURLToPath(new URL('./sdk-discovery-fixture.mjs',import.meta.url));
  const child=spawnSync(process.execPath,[fixture],{encoding:'utf8',timeout:10000});
  assert.equal(child.status,0,child.stderr);const scans=JSON.parse(child.stdout);
  assert.equal(scans[0].devices.length,1);assert.equal(scans[0].devices[0].name,'Ledger Nano X');assert.equal(scans[0].devices[0].id,scans[1].devices[0].id);
});
