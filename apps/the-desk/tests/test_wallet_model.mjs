import test from 'node:test';
import assert from 'node:assert/strict';
import {WalletController,units,formatUnits,transferRequest,BASE,USDC,discoverWallets} from '../web/wallet-model.mjs';
const address='0x1111111111111111111111111111111111111111',to='0x2222222222222222222222222222222222222222';
function fixture({chain=BASE.chainId,decline=false}={}) {
 let session={authenticated:false};const calls=[],handlers={};
 const provider={chain,accounts:[address],on:(e,f)=>handlers[e]=f,removeListener:e=>delete handlers[e],async request(p){calls.push(p);if(decline && p.method==='personal_sign')throw Object.assign(new Error('Rejected'),{code:4001});switch(p.method){case 'eth_requestAccounts':case 'eth_accounts':return this.accounts;case 'eth_chainId':return this.chain;case 'wallet_switchEthereumChain':this.chain=BASE.chainId;handlers.chainChanged?.(this.chain);return null;case 'personal_sign':return 'signature';case 'eth_blockNumber':return '0x10';case 'eth_getBalance':return '0xde0b6b3a7640000';case 'eth_call':return '0x12d687';default:throw new Error('Unexpected wallet method '+p.method);}}};
 const api=async(path,p)=>{calls.push({path,p});if(path.endsWith('challenge'))return {nonce:'nonce',message:'one time sign-in'};if(path.endsWith('verify'))return session={authenticated:true,address,chainId:8453};if(path.endsWith('logout'))return session={authenticated:false};if(path.endsWith('session'))return session;throw new Error(path);};
 const controller=new WalletController(api);return {controller,provider,calls,handlers};
}
test('exact ETH/USDC units and transfer ABI, including excessive precision',()=>{
 assert.equal(units('9007199254740993.000001',6),9007199254740993000001n);
 assert.equal(formatUnits('0x0',18),'0');assert.equal(formatUnits(1000000n,6),'1');
 assert.throws(()=>units('1.0000001',6));assert.throws(()=>units('-1',18));assert.throws(()=>units('1e3',18));assert.throws(()=>units('0',6));
 const tx=transferRequest({from:address,to,asset:'USDC',amount:'1.234567'});
 assert.equal(tx.to,USDC);assert.equal(tx.data,'0xa9059cbb'+to.slice(2).padStart(64,'0')+'12d687'.padStart(64,'0'));assert.equal(tx.chainId,BASE.chainId);
 assert.equal(transferRequest({from:address,to,asset:'ETH',amount:'1'}).value,'0xde0b6b3a7640000');
 assert.throws(()=>transferRequest({from:address,to:'0x'+'0'.repeat(40),asset:'ETH',amount:'1'}));
});
test('connect switches to Base then signs identity without any transaction',async()=>{
 const {controller,provider,calls}=fixture({chain:'0x1'});await controller.login(provider);
 assert.equal(controller.session.address,address);assert(calls.some(x=>x.method==='wallet_switchEthereumChain'));
 assert(!calls.some(x=>x.method==='eth_sendTransaction' || x.method==='eth_signTypedData_v4'));
 const balances=await controller.balances();assert.equal(balances.eth,'1');assert.equal(balances.usdc,'1.234567');
 assert.equal(calls.find(x=>x.method==='eth_getBalance').params[1],'0x10');assert.equal(calls.find(x=>x.method==='eth_call').params[1],'0x10');
});
test('declined signature keeps session disconnected',async()=>{const {controller,provider}=fixture({decline:true});await assert.rejects(controller.login(provider),/declined/);assert.equal(controller.session,null);assert.equal(controller.busy,false);});
test('account changes revoke auth and prevent stale identity reads',async()=>{
 const {controller,provider,handlers}=fixture();await controller.login(provider);provider.accounts=[to];handlers.accountsChanged([to]);await controller.revoking;
 assert.equal(controller.session,null);await assert.rejects(controller.balances(),/sign in/);
});
test('account switch during signing cannot verify the challenge',async()=>{
 const {controller,provider,calls}=fixture();const original=provider.request.bind(provider);provider.request=async p=>{if(p.method==='personal_sign')provider.accounts=[to];return original(p);};
 await assert.rejects(controller.login(provider),/changed/);assert(!calls.some(x=>x.path?.endsWith('verify')));
});
test('EIP-6963 discovers both extensions without using injected icons',()=>{
 const target=new EventTarget();target.ethereum={providers:[{request:()=>{},isMetaMask:true}]};let result=[];const dispose=discoverWallets(target,x=>result=x);
 const event=new Event('eip6963:announceProvider');event.detail={info:{uuid:'rabby',name:'Rabby',icon:'javascript:bad'},provider:{request:()=>{}}};target.dispatchEvent(event);
 assert.equal(result.length,2);assert.deepEqual(result.map(x=>x.name),['MetaMask','Rabby']);assert(!('icon' in result[1]));dispose();
});

test('rejected replacement login revokes the previous wallet session',async()=>{
 const {controller,provider,calls}=fixture();await controller.login(provider);
 const replacement=fixture({decline:true}).provider;await assert.rejects(controller.login(replacement),/declined/);
 assert.equal(controller.session,null);assert.equal((await controller.api('/api/wallet/session')).authenticated,false);
 assert.equal(calls.filter(x=>x.path?.endsWith('logout')).length,2);
});
