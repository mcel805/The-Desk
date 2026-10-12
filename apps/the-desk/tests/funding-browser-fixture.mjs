// Isolated browser acceptance fixture. No private user key or transaction method.
import {privateKeyToAccount} from 'viem/accounts';
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
      case 'eth_blockNumber':return '0x10';
      case 'eth_getBalance':return '0xde0b6b3a7640000';
      case 'eth_call':return '0x12d687';
      case 'eth_estimateGas':return '0x5208';
      default:throw new Error('Financial transaction methods are disabled in the browser fixture.');
    }
  }
};
window.addEventListener('eip6963:requestProvider',()=>{
  for(const [id,name] of [['qa-rabby','Rabby · synthetic test wallet'],['qa-metamask','MetaMask · synthetic test wallet']])window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{uuid:id,name},provider}}));
});
const brokerFixture=new URLSearchParams(location.search).has('broker');
window.fixtureBrokerRequests=[];
const fixtureHLRequests=[];
const original=window.fetch.bind(window);
window.fetch=async(path,options)=>{
  if(brokerFixture && String(path)==='/api/integrations')return Response.json({liveEnabled:true,walletVerificationAvailable:true});
  if(brokerFixture && String(path).startsWith('/api/robinhood/')) {
    const body=options?.body?JSON.parse(options.body):null;
    window.fixtureBrokerRequests.push({path,body});
    if(String(path)==='/api/robinhood/status')return Response.json({connected:true,accounts:[{id:'synthetic-account',account:'••••0000',name:'Synthetic Agentic account',tradable:true}]});
    if(String(path).startsWith('/api/robinhood/portfolio'))return Response.json({total_value:'1000',currency:'USD',buying_power:{buying_power:'1000'},crypto_buying_power:{buying_power:'1000'}});
    if(String(path)==='/api/robinhood/preview')return Response.json({id:'synthetic-preview',blocked:false,review:{...body,market_data_disclosure:'SYNTHETIC QUOTE · TEST ONLY',order_checks:{}}});
    if(String(path)==='/api/robinhood/submit')return Response.json({message:'TEST ONLY · mock submit recorded. No broker call.'});
    throw new Error('Broker endpoint is not available in this synthetic fixture.');
  }
  if(String(path)==='/api/integrations/hyperliquid/requests')return Response.json({network:new URL(path,location.origin).searchParams.get('network')||'testnet',requests:fixtureHLRequests});
  if(String(path)==='/api/integrations/hyperliquid/reserve'){const body=JSON.parse(options.body);fixtureHLRequests.push({network:body.network,clientOrderId:body.clientOrderId,intent:body.intent,state:'reserved'});return Response.json({request:fixtureHLRequests.at(-1)});}
  if(String(path)==='/api/integrations/hyperliquid/submitting'){const body=JSON.parse(options.body);const item=fixtureHLRequests.find(x=>x.clientOrderId===body.clientOrderId);if(item)item.state='submitting';return Response.json({request:item});}
  if(String(path)==='/api/integrations/hyperliquid/uncertain'){const body=JSON.parse(options.body);const item=fixtureHLRequests.find(x=>x.clientOrderId===body.clientOrderId);if(item)item.state='uncertain';return Response.json({request:item});}
  if(String(path)==='/api/integrations/hyperliquid/release'){const body=JSON.parse(options.body);const index=fixtureHLRequests.findIndex(x=>x.clientOrderId===body.clientOrderId);const item=fixtureHLRequests.splice(index,1)[0];return Response.json({request:item});}
  if(String(path)==='/api/integrations/hyperliquid/acknowledge'){const body=JSON.parse(options.body);const item=fixtureHLRequests.find(x=>x.clientOrderId===body.clientOrderId);if(item)item.state='acknowledged';return Response.json({request:item});}
  if(String(path)==='/api/integrations/hyperliquid/reconcile'){const body=JSON.parse(options.body);const item=fixtureHLRequests.find(x=>x.clientOrderId===body.clientOrderId);if(item){item.state='acknowledged';item.venueState='open';item.venueOrderId='synthetic-oid';}return Response.json({found:!!item,request:item});}
  if(String(path).startsWith('/api/integrations/hyperliquid')){
    const network=new URL(path,location.origin).searchParams.get('network');
    return Response.json({network,address:wallet.address,perps:{marginSummary:{accountValue:'1000'},withdrawable:'1000',assetPositions:[]},spot:{balances:[]},orders:[],fills:[],meta:{universe:[{name:'BTC',szDecimals:5},{name:'ETH',szDecimals:4},{name:'SOL',szDecimals:2}]},observedAt:Date.now()/1000});
  }
  return original(path,options);
};
await import('../web/funding-ui.mjs');
