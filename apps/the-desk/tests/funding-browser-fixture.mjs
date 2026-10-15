// Isolated browser acceptance fixture. No private user key or transaction method.
import {privateKeyToAccount} from 'viem/accounts';
const fixtureParams=new URLSearchParams(location.search);
const wallet=privateKeyToAccount('0x'+'1'.repeat(64));
const handlers=new Map();let reject=false,changed=false;
document.querySelector('#fixtureReject').onchange=e=>{reject=e.target.checked;};
document.querySelector('#fixtureChange').onclick=()=>{changed=true;for(const cb of handlers.get('accountsChanged')||[])cb(['0x'+'2'.repeat(40)]);};
document.querySelector('#fixtureReset').onclick=()=>location.reload();
const provider={
  on(event,cb){handlers.set(event,[...(handlers.get(event)||[]),cb]);},
  removeListener(event,cb){handlers.set(event,(handlers.get(event)||[]).filter(x=>x!==cb));},
  async request(p){
    document.querySelector('#fixtureCalls').textContent+=' '+p.method;
    switch(p.method){
      case 'eth_accounts':case 'eth_requestAccounts':return [changed?'0x'+'2'.repeat(40):wallet.address];
      case 'eth_chainId':return '0x2105';
      case 'personal_sign':if(reject)throw Object.assign(new Error('Declined'),{code:4001});return wallet.signMessage({message:p.params[0]});
      case 'eth_signTypedData_v4':if(reject)throw Object.assign(new Error('Declined'),{code:4001});return '0x'+'1'.repeat(130);
      case 'eth_blockNumber':return '0x10';
      case 'eth_getBalance':return '0xde0b6b3a7640000';
      case 'eth_call':return '0x12d687';
      case 'eth_estimateGas':return '0x5208';
      default:throw new Error('Financial transaction methods are disabled in the browser fixture.');
    }
  }
};
window.addEventListener('eip6963:requestProvider',()=>{
  if(fixtureParams.has('noextension'))return;
  for(const [id,name] of [['qa-rabby','Rabby · synthetic test wallet'],['qa-metamask','MetaMask · synthetic test wallet']])window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{uuid:id,name},provider}}));
});
const brokerFixture=new URLSearchParams(location.search).has('broker');
const venueRequests=[];
window.fixtureReconcileFound=false;
window.fixtureBrokerRequests=[];
const original=window.fetch.bind(window);
window.fetch=async(path,options)=>{
  if(String(path).startsWith('/api/wallet/hardware/')) {
    const p=options?.body?JSON.parse(options.body):{};
    document.querySelector('#fixtureCalls').textContent+=' '+String(path).split('/').at(-1);
    if(String(path).endsWith('/capabilities'))return Response.json({available:true,device:'Ledger',transport:'synthetic-test-only'});
    if(String(path).endsWith('/discover'))return Response.json(fixtureParams.has('nousb')?{devices:[],diagnostic:{code:'usb-not-visible',message:'TEST ONLY: this Mac is not reporting a Ledger USB connection.'}}:{devices:[{id:'a'.repeat(64),name:'Ledger · SYNTHETIC USB DEVICE'}]});
    if(String(path).endsWith('/connect')||String(path).endsWith('/selected'))return Response.json({address:changed?'0x'+'2'.repeat(40):wallet.address,path:"44'/60'/0'/0/0",chainId:8453});
    if(String(path).endsWith('/sign-login'))return reject?Response.json({error:'Device request declined.'},{status:400}):Response.json({signature:await wallet.signMessage({message:p.message})});
    if(String(path).endsWith('/rpc'))return Response.json({result:p.method==='eth_blockNumber'?'0x10':p.method==='eth_getBalance'?'0xde0b6b3a7640000':'0x12d687'});
    if(String(path).endsWith('/disconnect'))return Response.json({connected:false});
    throw new Error('Unsupported hardware fixture request.');
  }
  if(String(path)==='/api/integrations')return Response.json({liveEnabled:false,hyperliquidLiveEnabled:false,walletVerificationAvailable:true});
  if(brokerFixture && String(path).startsWith('/api/robinhood/')) {
    const body=options?.body?JSON.parse(options.body):null;
    window.fixtureBrokerRequests.push({path,body});
    if(String(path)==='/api/robinhood/status')return Response.json({connected:true,accounts:[{id:'synthetic-account',account:'••••0000',name:'Synthetic Agentic account',tradable:true}]});
    if(String(path).startsWith('/api/robinhood/portfolio'))return Response.json({total_value:'1000',currency:'USD',buying_power:{buying_power:'1000'},crypto_buying_power:{buying_power:'1000'}});
    if(String(path)==='/api/robinhood/preview')return Response.json({id:'synthetic-preview',blocked:false,review:{...body,market_data_disclosure:'SYNTHETIC QUOTE · TEST ONLY',order_checks:{}}});
    throw new Error('Broker endpoint is not available in this synthetic fixture.');
  }
  const url=new URL(path,location.origin),body=options?.body?JSON.parse(options.body):{};
  if(url.pathname==='/api/integrations/hyperliquid/requests'){const network=url.searchParams.get('network')||'testnet';return Response.json({network,requests:venueRequests.filter(x=>x.network===network&&['reserved','submitting','uncertain'].includes(x.state))});}
  if(url.pathname==='/api/integrations/hyperliquid/reserve'){if(venueRequests.some(x=>x.network===body.network&&['reserved','submitting','uncertain'].includes(x.state)))return Response.json({error:'Reconcile first.'},{status:409});venueRequests.push({...body,state:'reserved'});return Response.json({request:venueRequests.at(-1)});}
  if(url.pathname==='/api/integrations/hyperliquid/submitting'){const item=venueRequests.find(x=>x.clientOrderId===body.clientOrderId);if(!item||item.state!=='reserved')return Response.json({error:'Not reserved.'},{status:409});item.state='submitting';return Response.json({request:item});}
  if(url.pathname==='/api/integrations/hyperliquid/release'){const item=venueRequests.find(x=>x.clientOrderId===body.clientOrderId);if(!item||item.state!=='reserved')return Response.json({error:'Cannot release after signing.'},{status:409});item.state='released';return Response.json({request:item});}
  if(url.pathname==='/api/integrations/hyperliquid/uncertain'){const item=venueRequests.find(x=>x.clientOrderId===body.clientOrderId);if(item)item.state='uncertain';return Response.json({request:item});}
  if(url.pathname==='/api/integrations/hyperliquid/reconcile'){const item=venueRequests.find(x=>x.clientOrderId===body.clientOrderId);if(item&&window.fixtureReconcileFound){item.state='acknowledged';item.venueState='resting';item.venueOrderId='123';return Response.json({found:true,request:item});}if(item)item.state='uncertain';return Response.json({found:false,request:item});}
  if(url.pathname==='/api/integrations/hyperliquid'&&options?.method==='POST')return Response.json({error:'No other order routes exist in the browser fixture.'},{status:404});
  if(url.pathname==='/api/integrations/hyperliquid'){
    const network=new URL(path,location.origin).searchParams.get('network');
    return Response.json({network,address:wallet.address,perps:{marginSummary:{accountValue:'1000'},withdrawable:'1000',assetPositions:[]},spot:{balances:[]},orders:[],fills:[],meta:{universe:[{name:'BTC',szDecimals:5},{name:'ETH',szDecimals:4},{name:'SOL',szDecimals:2}]},observedAt:Date.now()/1000});
  }
  return original(path,options);
};
await import('../web/funding-ui.mjs');
