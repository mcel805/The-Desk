/** Local USB signer. Only account reads and the Desk's Base login are exposed. */
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

export function derivationPath(scheme,index) {
  if(!['ledger-live','legacy'].includes(scheme)||!Number.isInteger(index)||index<0||index>19)throw new Error('Choose an Ethereum account from 1 to 20.');
  return scheme==='ledger-live'?`44'/60'/${index}'/0/0`:`44'/60'/0'/0/${index}`;
}
export function signatureHex({r,s,v}) {
  if(!/^0x[0-9a-f]{64}$/i.test(r)||!/^0x[0-9a-f]{64}$/i.test(s)||![0,1,27,28].includes(v))throw new Error('Invalid device signature.');
  return r+s.slice(2)+(v<27?v+27:v).toString(16).padStart(2,'0');
}
export function actionResult(action,timeout=90000) {
  return new Promise((resolve,reject)=>{
    let sub,finished=false;
    const finish=(error,output)=>{if(finished)return;finished=true;clearTimeout(timer);queueMicrotask(()=>sub?.unsubscribe());if(error)reject(error);else resolve(output);};
    const timer=setTimeout(()=>{action.cancel();finish(new Error('Device approval timed out. Unlock the device and reconnect.'));},timeout);
    sub=action.observable.subscribe({next:state=>{
      if(state.status==='completed')finish(null,state.output);
      if(state.status==='error')finish(new Error(state.error?.name==='UserRefusedError'?'Device request declined.':'Device request failed. Unlock Ledger, open Ethereum, and close other wallet apps.'));
      if(state.status==='stopped')finish(new Error('Device request cancelled.'));
    },error:()=>finish(new Error('Device disconnected. Reconnect the USB cable.'))});
  });
}
export function usbInventory(devices,platform=process.platform) {
  const supported=devices.filter(d=>d.vendorId===0x2c97&&(!['darwin','win32'].includes(platform)||d.usagePage===0xffa0));
  if(supported.length>1)throw new Error('Connect one Ledger at a time, then scan again.');
  return supported.map(d=>({id:createHash('sha256').update(`${d.vendorId}:${d.productId}:${d.path}`).digest('hex')}));
}
async function available(dmk) {
  return new Promise((resolve,reject)=>{
    let sub,done=false;const devices=[];
    const finish=(error)=>{if(done)return;done=true;clearTimeout(timer);queueMicrotask(()=>sub?.unsubscribe());error?reject(error):resolve(devices);};
    const timer=setTimeout(()=>finish(new Error('USB discovery timed out.')),5000);
    sub=dmk.startDiscovering({}).subscribe({next:device=>devices.push(device),complete:()=>finish(),error:()=>finish(new Error('USB access unavailable. Unlock Ledger, open Ethereum, and scan again.'))});
  });
}
export async function ledgerOperation(input,{dmk,signerFor,inventory}) {
  let sessionId;
  try {
    if(input.operation==='capabilities')return {available:true,device:'Ledger',transport:'native-usb',chainId:8453};
    if(!['discover','account','sign-login'].includes(input.operation))throw new Error('Unsupported hardware operation.');
    const usb=await inventory();
    if(!usb.length&&input.operation==='discover')return {devices:[]};
    if(usb.length!==1)throw new Error('No selected Ledger found. Plug it in, unlock it, open Ethereum, and scan again.');
    const devices=await available(dmk);
    if(devices.length!==1)throw new Error('Connect one Ledger at a time, then scan again.');
    if(input.operation==='discover')return {devices:[{id:usb[0].id,name:devices[0].name||`Ledger ${devices[0].deviceModel}`} ]};
    const path=derivationPath(input.scheme,input.index);
    const device=input.deviceId===usb[0].id?devices[0]:null;
    if(!device)throw new Error('No selected Ledger found. Plug it in, unlock it, open Ethereum, and scan again.');
    sessionId=await dmk.connect({device,sessionRefresherOptions:{isRefresherDisabled:true}});
    const signer=signerFor(dmk,sessionId);
    const {address}=await actionResult(signer.getAddress(path,{checkOnDevice:input.confirmAddress===true}));
    if(!/^0x[0-9a-f]{40}$/i.test(address))throw new Error('Device returned an invalid Ethereum address.');
    if(input.operation==='account')return {address,path,chainId:8453};
    if(typeof input.address!=='string'||address.toLowerCase()!==input.address.toLowerCase())throw new Error('Device account changed. Reconnect and review its address.');
    if(typeof input.message!=='string'||input.message.length>2000||!input.message.includes('\nChain ID: 8453\n')||!input.message.includes('Sign in to The Desk with your Base wallet.'))throw new Error('Only a Base Desk login message can be signed.');
    return {address,signature:signatureHex(await actionResult(signer.signMessage(path,input.message)))};
  } finally {
    if(sessionId)await dmk.disconnect({sessionId}).catch(()=>{});
    await dmk.stopDiscovering().catch(()=>{});
    dmk.close();
  }
}
async function main() {
  console.log=()=>{};
  try {
    let raw='';for await(const chunk of process.stdin){raw+=chunk;if(raw.length>5000)throw new Error('Hardware request too large.');}
    const input=JSON.parse(raw);
    if(!input||typeof input!=='object'||!['capabilities','discover','account','sign-login'].includes(input.operation))throw new Error('Unsupported hardware operation.');
    const {DeviceManagementKitBuilder}=require('@ledgerhq/device-management-kit');
    const {nodeHidTransportFactory}=require('@ledgerhq/device-transport-kit-node-hid');
    const {SignerEthBuilder}=require('@ledgerhq/device-signer-kit-ethereum');
    const hid=require('node-hid');
    const dmk=new DeviceManagementKitBuilder().addTransport(nodeHidTransportFactory).build();
    const output=await ledgerOperation(input,{dmk,signerFor:(dmk,sessionId)=>new SignerEthBuilder({dmk,sessionId}).build(),inventory:async()=>usbInventory(await hid.devicesAsync())});
    process.stdout.write(JSON.stringify({ok:true,...output}));
  } catch(error) {
    const message=error?.code==='ERR_MODULE_NOT_FOUND'?'Hardware dependencies missing. Run npm ci in apps/the-desk.':String(error?.message||'Hardware connector unavailable.');
    process.stdout.write(JSON.stringify({ok:false,error:message}));process.exitCode=1;
  }
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){await main();process.exit(process.exitCode||0);}
