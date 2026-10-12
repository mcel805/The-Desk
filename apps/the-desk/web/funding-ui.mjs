import {WalletController,discoverWallets,shortAddress,transferRequest,BASE,USDC} from './wallet-model.mjs';
import {exchangeFor,limitOrder,orderResult} from './vendor/hyperliquid-wallet.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=s=>document.querySelector(s);
async function api(path,payload) {
  const response=await fetch(path,{method:payload===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:payload===undefined?{}:{'Content-Type':'application/json'},body:payload===undefined?undefined:JSON.stringify(payload)});
  const result=await response.json();if(!response.ok) throw new Error(result.error||'Connection unavailable.');return result;
}
const drawer=document.createElement('dialog');drawer.id='fundingDrawer';drawer.setAttribute('aria-labelledby','fundingTitle');
drawer.innerHTML=`<div class="funding-heading"><div><span class="funding-eyebrow">THE DESK · ACCOUNTS</span><h2 id="fundingTitle">Wallet & funding</h2></div><button id="fundingClose" aria-label="Close wallet and funding">×</button></div>
<div class="funding-identity"><div><strong id="connectedWallet">Connect your wallet</strong><p id="walletIdentity" class="muted">Sign in on Base with Rabby or MetaMask.</p></div><button id="walletLogout" hidden>Disconnect</button></div>
<div id="walletLogin"><label>Browser wallet<select id="walletProviders" aria-label="Browser wallet"></select></label><button id="walletConnect" class="primary">Connect & sign in</button><p id="walletInstall" hidden>No extension detected. Install <a href="https://rabby.io/" target="_blank" rel="noopener noreferrer">Rabby</a> or <a href="https://metamask.io/" target="_blank" rel="noopener noreferrer">MetaMask</a>, then open The Desk in that browser.</p></div>
<p id="fundingStatus" role="status" aria-live="polite"></p><p class="funding-runtime" id="fundingRuntime">Checking connection services…</p>
<nav class="funding-tabs" aria-label="Account connections"><button data-funding-tab="wallet" class="active">Base wallet</button><button data-funding-tab="hyperliquid">Hyperliquid</button><button data-funding-tab="robinhood">Robinhood</button></nav>
<section data-funding-panel="wallet"><div class="funding-card"><div class="funding-row"><h3>Assets on Base</h3><button id="refreshWallet">Refresh</button></div><div class="funding-balances"><div><small>Native USDC</small><strong id="walletUSDC">—</strong></div><div><small>ETH · gas</small><strong id="walletETH">—</strong></div></div><p class="muted" id="balanceAsOf">Connect a wallet to read balances.</p></div>
<div class="funding-actions"><button id="receiveWallet">Receive</button><button id="sendWallet">Send</button><a href="https://app.uniswap.org/" target="_blank" rel="noopener noreferrer">Swap on Uniswap ↗</a><a href="https://docs.base.org/base-chain/network-information/ecosystem-bridges" target="_blank" rel="noopener noreferrer">Bridge to Base ↗</a></div>
<div id="receivePanel" class="funding-card" hidden><h3>Receive on Base</h3><p>Use the Base network. Native USDC contract:</p><code>${USDC}</code><p>Your wallet address</p><code id="receiveAddress"></code><button id="copyWallet">Copy address</button><p class="muted">This funds your wallet. Hyperliquid collateral and Robinhood buying power are separate.</p></div>
<form id="sendForm" class="funding-card" hidden><h3>Send from Base</h3><div class="two-col"><label>Asset<select name="asset"><option>USDC</option><option>ETH</option></select></label><label>Amount<input name="amount" inputmode="decimal" required placeholder="Enter amount"></label></div><label>Recipient<input name="to" required placeholder="0x…" autocomplete="off"></label><button class="primary">Review transfer</button></form>
<div class="funding-card"><h3>Wallet activity</h3><p id="walletActivity" class="muted">No transfer submitted from this page in this session.</p><p class="muted">Rabby or MetaMask holds your keys and provides its transaction simulation. Swaps, bridges and full wallet history open their provider interfaces.</p></div></section>
<section data-funding-panel="hyperliquid" hidden><div class="funding-card"><div class="funding-row"><h3>Hyperliquid account</h3><select id="hlNetwork" aria-label="Hyperliquid network"><option value="testnet">Testnet · no real money</option><option value="mainnet">Mainnet · real money</option></select></div><p>Base is your wallet network. Hyperliquid trades settle on HyperCore using venue collateral.</p><div class="funding-balances"><div><small>Perpetual account value · USD</small><strong id="hlValue">—</strong></div><div><small>Withdrawable collateral · USD</small><strong id="hlAvailable">—</strong></div></div><p id="hlAsOf" class="muted">Refresh to read this wallet’s venue account.</p><div class="funding-actions"><button id="hlRefresh">Refresh account</button><a id="hlFundingLink" href="https://app.hyperliquid-testnet.xyz/" target="_blank" rel="noopener noreferrer">Deposit / withdraw at venue ↗</a></div></div>
<form id="hlOrder" class="funding-card"><h3>Wallet-signed limit order</h3><div class="two-col"><label>Market<select name="coin"><option>BTC</option><option>ETH</option><option>SOL</option></select></label><label>Side<select name="side"><option value="buy">Buy / Long</option><option value="sell">Sell / Short</option></select></label></div><div class="two-col"><label>Quantity · coin<input name="quantity" inputmode="decimal" required placeholder="Enter quantity"></label><label>Limit price · USD<input name="price" inputmode="decimal" required placeholder="Enter limit price"></label></div><label class="funding-checkbox"><input name="reduceOnly" type="checkbox">Reduce only</label><p class="muted">Good till cancelled. Uses the venue’s current leverage and margin settings. Review them in Hyperliquid before trading.</p><button class="primary" id="hlReviewButton">Review testnet order</button></form>
<div class="funding-card"><h3>Working orders</h3><div id="hlOrders" class="muted">No snapshot loaded.</div></div><div class="funding-card"><h3>Positions & recent fills</h3><div id="hlPositions" class="muted">No snapshot loaded.</div><div id="hlFills"></div></div></section>
<section data-funding-panel="robinhood" hidden><div class="funding-card"><div class="funding-row"><h3>Robinhood</h3><button id="rhConnect" class="primary">Sign in to Robinhood</button><button id="rhDisconnect" hidden>Disconnect</button></div><p id="rhStatus">Sign in with your Base wallet, then connect through Robinhood’s hosted consent screen.</p><label>Brokerage account<select id="rhAccounts" aria-label="Robinhood account"></select></label><button id="rhRefresh">Refresh account</button><dl id="rhPortfolio"></dl><a href="https://robinhood.com/" target="_blank" rel="noopener noreferrer">Fund account / open Robinhood ↗</a><p class="muted">External trading uses the eligible Agentic account. Account funds remain at Robinhood.</p></div>
<form id="rhOrder" class="funding-card"><input type="hidden" name="type" value="limit"><h3>Robinhood limit order</h3><div class="two-col"><label>Asset<select name="asset"><option value="equity">Stock / ETF</option><option value="crypto">Crypto</option></select></label><label>Side<select name="side"><option value="buy">Buy</option><option value="sell">Sell</option></select></label></div><label>Symbol<input name="symbol" required placeholder="e.g. AAPL or BTC"></label><div class="two-col"><label>Quantity<input name="quantity" inputmode="decimal" required placeholder="Enter quantity"></label><label>Limit price · USD<input name="limit_price" inputmode="decimal" required placeholder="Enter limit price"></label></div><label>Stock trading session<select name="market_hours"><option value="regular_hours">Regular hours</option><option value="extended_hours">Extended hours</option><option value="all_day_hours">24 Hour Market</option></select></label><button class="primary" id="rhReviewButton" disabled>Review live order</button></form>
<div class="funding-card"><h3>Options & futures</h3><p>Use Robinhood’s own interface for options and futures. This Desk ticket does not yet support options. No futures order tool is verified for the official MCP connection.</p><a href="https://robinhood.com/" target="_blank" rel="noopener noreferrer">Open Robinhood ↗</a></div></section>
<section id="fundingReview" class="funding-review" hidden><h3 id="reviewTitle">Review</h3><div id="reviewDetails"></div><p id="reviewNote"></p><label id="liveConfirmationLabel" hidden>Type PLACE LIVE ORDER<input id="liveConfirmation" autocomplete="off"></label><div class="funding-actions"><button id="reviewCancel">Cancel</button><button id="reviewConfirm" class="primary">Confirm</button></div></section>`;
document.body.append(drawer);
const hlPanel=document.createElement('div');hlPanel.id='hlRequestsPanel';hlPanel.className='funding-card';hlPanel.hidden=true;hlPanel.innerHTML='<h3>Pending venue requests</h3><p class="muted">An unresolved request blocks another order for this wallet and network until the venue confirms its state.</p><div id="hlRequests"></div>';document.querySelector('[data-funding-panel="hyperliquid"]').insertBefore(hlPanel,$('#hlOrder'));
let wallets=[],config={},hl=null,hlRequests=[],rh=null,pending=null,operation=false,sending=false;
const controller=new WalletController(api,()=>{
  $('#walletButton').textContent=shortAddress(controller.session?.address);
  $('#connectedWallet').textContent=controller.session?.authenticated?controller.session.address:'Connect your wallet';
  $('#walletIdentity').textContent=controller.session?.authenticated?'Signed in on Base · keys stay in your wallet':'Sign in on Base with Rabby or MetaMask.';
  $('#walletLogout').hidden=!controller.session?.authenticated;
  $('#walletConnect').disabled=controller.busy || !wallets.length;
  if(!controller.session?.authenticated){hl=null;rh=null;pending=null;$('#fundingReview').hidden=true;$('#walletETH').textContent='—';$('#walletUSDC').textContent='—';$('#balanceAsOf').textContent='Connect a wallet to read balances.';$('#receivePanel').hidden=true;$('#receiveAddress').textContent='';$('#sendForm').hidden=true;$('#hlValue').textContent='—';$('#hlAvailable').textContent='—';$('#hlOrders').textContent='No snapshot loaded.';$('#hlPositions').textContent='No snapshot loaded.';$('#hlFills').textContent='';$('#hlAsOf').textContent='No snapshot for this wallet.';$('#rhStatus').textContent='Sign in with your Base wallet, then connect through Robinhood’s hosted consent screen.';$('#walletActivity').textContent='No transfer submitted from this page in this session.';$('#rhAccounts').innerHTML='';$('#rhPortfolio').innerHTML='';$('#rhDisconnect').hidden=true;$('#rhConnect').hidden=false;$('#rhReviewButton').disabled=true;}
  if(controller.error)status(controller.error,true);
});
function status(message,error=false){$('#fundingStatus').textContent=message;$('#fundingStatus').classList.toggle('error',error);}
async function run(fn){if(operation || sending) return;operation=true;try{await fn();}catch(e){status(e.code===4001?'Wallet request declined.':e.message,true);}finally{operation=false;}}
$('#walletButton').onclick=()=>{drawer.showModal();};
$('#fundingClose').onclick=()=>drawer.close();
drawer.addEventListener('click',e=>{if(e.target===drawer){const r=drawer.getBoundingClientRect();if(e.clientX<r.left || e.clientX>r.right || e.clientY<r.top || e.clientY>r.bottom)drawer.close();}});
document.querySelectorAll('[data-funding-tab]').forEach(button=>button.onclick=()=>{document.querySelectorAll('[data-funding-tab]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-current',b===button?'page':'false');});document.querySelectorAll('[data-funding-panel]').forEach(p=>p.hidden=p.dataset.fundingPanel!==button.dataset.fundingTab);pending=null;$('#fundingReview').hidden=true;});
discoverWallets(window,items=>{wallets=items;const value=$('#walletProviders').value;$('#walletProviders').innerHTML=items.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');if(items.some(x=>x.id===value))$('#walletProviders').value=value;$('#walletInstall').hidden=items.length>0;$('#walletConnect').disabled=!items.length || controller.busy;const last=sessionStorage.getItem('desk-wallet-provider');const chosen=items.find(x=>x.id===last);if(chosen && !controller.provider)controller.bind(chosen.provider);});
$('#walletConnect').onclick=()=>run(async()=>{const chosen=wallets.find(x=>x.id===$('#walletProviders').value);if(!chosen)throw new Error('Select an installed wallet.');status('Review the one-time sign-in message in your wallet.');await controller.login(chosen.provider);sessionStorage.setItem('desk-wallet-provider',chosen.id);status('Signed in. Refresh balances or connect a trading venue.');await refreshBalances();await loadHLRequests();});
$('#walletLogout').onclick=()=>run(async()=>{await controller.invalidate();hlRequests=[];renderHLRequests();status('Disconnected.');});
async function refreshBalances(){const b=await controller.balances();$('#walletETH').textContent=b.eth;$('#walletUSDC').textContent=b.usdc;$('#balanceAsOf').textContent=`Base block ${BigInt(b.block)} · ${new Date(b.observedAt).toLocaleTimeString()} · Refresh for current balances`;}
$('#refreshWallet').onclick=()=>run(refreshBalances);
$('#receiveWallet').onclick=()=>run(async()=>{const address=await controller.assertIdentity();$('#receiveAddress').textContent=address;$('#receivePanel').hidden=false;$('#sendForm').hidden=true;});
$('#copyWallet').onclick=()=>run(async()=>{await navigator.clipboard.writeText(await controller.assertIdentity());status('Wallet address copied.');});
$('#sendWallet').onclick=()=>run(async()=>{await controller.assertIdentity();$('#sendForm').hidden=false;$('#receivePanel').hidden=true;});
function review(title,details,note,execute,live=false){pending={execute,epoch:controller.epoch,live};$('#reviewTitle').textContent=title;$('#reviewDetails').innerHTML=details;$('#reviewNote').textContent=note;$('#liveConfirmationLabel').hidden=!live;$('#liveConfirmation').value='';$('#reviewConfirm').disabled=false;$('#reviewConfirm').textContent=live?'Confirm live request':'Confirm in wallet';$('#fundingReview').hidden=false;$('#fundingReview').scrollIntoView({block:'nearest'});}
$('#reviewCancel').onclick=()=>{if(!sending){pending=null;$('#fundingReview').hidden=true;}};
$('#reviewConfirm').onclick=()=>run(async()=>{
  const p=pending;if(!p || p.epoch!==controller.epoch)throw new Error('Wallet or review changed. Review again.');
  if(p.live && $('#liveConfirmation').value!=='PLACE LIVE ORDER')throw new Error('Type PLACE LIVE ORDER to confirm.');
  $('#reviewConfirm').disabled=true;sending=true;
  try {await controller.assertIdentity();await p.execute();}
  finally {sending=false;pending=null;$('#fundingReview').hidden=true;}
});
$('#sendForm').onsubmit=e=>{e.preventDefault();void run(async()=>{
  if(!config.liveEnabled)throw new Error('Base transfers are disabled in this runtime. Live setup is documented in the funding plan.');
  const fields=Object.fromEntries(new FormData(e.target)),from=await controller.assertIdentity(),tx=transferRequest({from,...fields});
  const gas=await controller.provider.request({method:'eth_estimateGas',params:[tx]});
  review('Send '+esc(fields.amount)+' '+esc(fields.asset)+' on Base',`<p>Recipient</p><code>${esc(fields.to)}</code><p>Estimated gas units: ${BigInt(gas)}. Your wallet shows the final fee.</p>`,'Review the network, recipient, amount and fee in your extension.',async()=>{
    await controller.assertIdentity(from);
    const hash=await controller.provider.request({method:'eth_sendTransaction',params:[tx]});
    $('#walletActivity').innerHTML=`Submitted · receipt pending · <a href="https://basescan.org/tx/${encodeURIComponent(hash)}" target="_blank" rel="noopener noreferrer">View transaction ↗</a>`;
    status('Transfer submitted. Check the receipt for success; submission does not prove settlement.');
  },true);
});};
function hlNetwork(){return $('#hlNetwork').value;}
function networkChanged(){hl=null;pending=null;$('#fundingReview').hidden=true;$('#hlValue').textContent='—';$('#hlAvailable').textContent='—';$('#hlOrders').textContent='Refresh this network to load orders.';$('#hlPositions').textContent='No snapshot loaded.';$('#hlFills').textContent='';$('#hlAsOf').textContent='No snapshot for this network.';$('#hlFundingLink').href=hlNetwork()==='testnet'?'https://app.hyperliquid-testnet.xyz/':'https://app.hyperliquid.xyz/trade';$('#hlReviewButton').textContent=hlNetwork()==='testnet'?'Review testnet order':'Review live order';}
$('#hlNetwork').onchange=()=>{networkChanged();void loadHLRequests();};
function renderHLRequests(){const panel=$('#hlRequestsPanel'),body=$('#hlRequests');panel.hidden=!hlRequests.length;body.innerHTML=hlRequests.map(r=>`<div class="funding-order"><span>${esc(r.network.toUpperCase())} · ${esc(r.intent.side.toUpperCase())} ${esc(r.intent.quantity)} ${esc(r.intent.coin)} @ $${esc(r.intent.price)} · ${esc(r.state)} · ${esc(r.clientOrderId)}</span><button data-hl-reconcile="${esc(r.clientOrderId)}">Reconcile</button></div>`).join('');document.querySelectorAll('[data-hl-reconcile]').forEach(button=>button.onclick=()=>run(()=>reconcileHL(button.dataset.hlReconcile,hlNetwork())));$('#hlReviewButton').disabled=hlRequests.length>0;}
async function loadHLRequests(){if(!controller.session?.authenticated){hlRequests=[];renderHLRequests();return;}const epoch=controller.epoch,network=hlNetwork(),value=await api('/api/integrations/hyperliquid/requests?network='+network);if(epoch!==controller.epoch||network!==hlNetwork())return;hlRequests=value.requests||[];renderHLRequests();}
async function reconcileHL(clientOrderId,network){if(network!==hlNetwork())throw new Error('Network changed. Review again.');const result=await api('/api/integrations/hyperliquid/reconcile',{network,clientOrderId});status(result.found?'Venue state recorded. Refresh the account snapshot.':'The venue returned no matching order yet; this request remains blocked.',!result.found);await loadHLRequests();if(result.found)await refreshHL();}
async function refreshHL(){
  const epoch=controller.epoch,network=hlNetwork();await controller.assertIdentity();await loadHLRequests();
  const value=await api('/api/integrations/hyperliquid?network='+network);
  if(epoch!==controller.epoch || network!==hlNetwork())return;
  hl=value;$('#hlValue').textContent=hl.perps.marginSummary?.accountValue??'Unavailable';$('#hlAvailable').textContent=hl.perps.withdrawable??'Unavailable';$('#hlAsOf').textContent=network.toUpperCase()+' · '+new Date(hl.observedAt*1000).toLocaleTimeString();
  $('#hlOrders').innerHTML=hl.orders.length?hl.orders.map(o=>`<div class="funding-order"><span>${esc(o.coin)} · ${esc(o.side)} · ${esc(o.sz)} @ ${esc(o.limitPx)}</span><button data-hl-cancel="${esc(o.oid)}">Cancel</button></div>`).join(''):'No working orders in this snapshot.';
  $('#hlPositions').innerHTML=hl.perps.assetPositions?.length?hl.perps.assetPositions.map(x=>`<p>${esc(x.position.coin)} · size ${esc(x.position.szi)} · ${esc(x.position.leverage?.value)}× ${esc(x.position.leverage?.type)} · entry ${esc(x.position.entryPx)}</p>`).join(''):'No perpetual positions in this snapshot.';
  $('#hlFills').innerHTML='<h4>Recent fills</h4>'+(hl.fills.length?hl.fills.slice(0,10).map(f=>`<p>${esc(f.coin)} · ${esc(f.side)} · ${esc(f.sz)} @ ${esc(f.px)} · ${esc(new Date(f.time).toLocaleString())}</p>`).join(''):'No recent fills in this snapshot.');
  document.querySelectorAll('[data-hl-cancel]').forEach(b=>b.onclick=()=>run(async()=>{
    if(network==='mainnet' && !config.liveEnabled)throw new Error('Mainnet order routing is disabled.');
    const snapshot=hl,order=snapshot.orders.find(o=>String(o.oid)===b.dataset.hlCancel),asset=snapshot.meta.universe.findIndex(x=>x.name===order?.coin);
    if(asset<0)throw new Error('Market is unavailable. Refresh orders.');
    const address=await controller.assertIdentity();
    review('Cancel '+order.coin+' order',`<p>Order ${esc(order.oid)} · ${esc(network.toUpperCase())}</p>`,'Your wallet signs this cancellation.',async()=>{await controller.assertIdentity(address);if(hlNetwork()!==network)throw new Error('Network changed. Review again.');await exchangeFor(controller.provider,address,network==='testnet').cancel({cancels:[{a:asset,o:order.oid}]});status('Cancellation request sent. Refresh orders to reconcile.');await refreshHL();},network==='mainnet');
  }));
}
$('#hlRefresh').onclick=()=>run(refreshHL);
function walletRejected(error){return error?.code===4001||/user rejected|denied|declined/i.test(String(error?.message||''));}
function definiteExchangeRejection(response){const statuses=response?.response?.data?.statuses;return !!response&&(response.status!=='ok'||Array.isArray(statuses)&&statuses.length===1&&!!statuses[0]?.error);}
$('#hlOrder').onsubmit=e=>{e.preventDefault();void run(async()=>{
  const network=hlNetwork();if(network==='mainnet' && !config.liveEnabled)throw new Error('Mainnet order routing is disabled in this runtime.');
  await refreshHL();if(!hl || hl.network!==network)throw new Error('Refresh the selected network first.');
  await loadHLRequests();if(hlRequests.length)throw new Error('Reconcile the pending Hyperliquid request before placing another order.');
  const data=Object.fromEntries(new FormData(e.target)),cloid='0x'+crypto.randomUUID().replaceAll('-',''),order=limitOrder({...data,reduceOnly:data.reduceOnly==='on',cloid},hl.meta),address=await controller.assertIdentity();
  const cap=Number(hl.perps.withdrawable);if(!data.reduceOnly && !(cap>0))throw new Error('Fund this Hyperliquid account before opening a position.');
  const notional=Number(data.quantity)*Number(data.price);
  review(network==='testnet'?'Testnet limit order':'LIVE Hyperliquid limit order',`<p>${esc(data.side.toUpperCase())} ${esc(data.quantity)} ${esc(data.coin)} @ $${esc(data.price)}</p><p>Notional $${esc(notional.toFixed(2))} · GTC · ${order.r?'Reduce only':'Open / increase position'} · ${esc(network.toUpperCase())}</p><p>Existing ${esc(data.coin)} position leverage: ${esc(hl.perps.assetPositions.find(x=>x.position.coin===data.coin)?.position.leverage?.value??'Check venue settings')}.</p>`,'Signing submits this order to Hyperliquid. A limit order may fill immediately. Fees and margin are determined by the venue.',async()=>{
    await controller.assertIdentity(address);if(hlNetwork()!==network)throw new Error('Network changed. Review again.');
    await api('/api/integrations/hyperliquid/reserve',{network,clientOrderId:cloid,intent:{coin:data.coin,side:data.side,quantity:data.quantity,price:data.price,reduceOnly:order.r}});
    let response=null,submissionMarked=false;
    const signingProvider={request:async request=>{const result=await controller.provider.request(request);if(['eth_signTypedData','eth_signTypedData_v4'].includes(request.method)){await api('/api/integrations/hyperliquid/submitting',{network,clientOrderId:cloid});submissionMarked=true;}return result;}};
    status('Waiting for wallet signature and exchange response…');
    try{
      response=await exchangeFor(signingProvider,address,network==='testnet').order({orders:[order],grouping:'na'});
      const result=orderResult(response);await api('/api/integrations/hyperliquid/acknowledge',{network,clientOrderId:cloid,state:result.state,venueOrderId:String(result.oid),observed:{state:result.state,venueOrderId:String(result.oid)}});status(`${network.toUpperCase()} order ${result.state} · ID ${result.oid}`);
    }catch(error){
      if(!submissionMarked&&walletRejected(error)){await api('/api/integrations/hyperliquid/release',{network,clientOrderId:cloid});status('Wallet signature declined. The order reservation was released.');return;}
      if(definiteExchangeRejection(response))await api('/api/integrations/hyperliquid/acknowledge',{network,clientOrderId:cloid,state:'rejected',observed:{state:'rejected'}});
      else await api('/api/integrations/hyperliquid/uncertain',{network,clientOrderId:cloid,observed:{state:'uncertain'}});
      status('Order not confirmed. Reconcile the request before placing another order. Reference '+cloid,true);await loadHLRequests();return;
    }
    await loadHLRequests();await refreshHL();
  },network==='mainnet');
});};
function renderRH(){
  $('#rhConnect').hidden=!!rh?.connected;$('#rhDisconnect').hidden=!rh?.connected;
  $('#rhStatus').textContent=rh?.connected?'Connected through Robinhood · refresh buying power before trading.':'Not connected to Robinhood in this Desk session.';
  const value=$('#rhAccounts').value;$('#rhAccounts').innerHTML=(rh?.accounts||[]).map(a=>`<option value="${esc(a.id)}">${esc(a.name)} ${esc(a.account)} · ${a.tradable?'Trading available':'Read only'}</option>`).join('');
  if(rh?.accounts?.some(a=>a.id===value))$('#rhAccounts').value=value;
  else if(rh?.accounts?.some(a=>a.tradable))$('#rhAccounts').value=rh.accounts.find(a=>a.tradable).id;
  $('#rhReviewButton').disabled=!(config.liveEnabled && rh?.connected && rh.accounts.some(a=>a.id===$('#rhAccounts').value && a.tradable));
}
async function refreshRH(){const epoch=controller.epoch;await controller.assertIdentity();const value=await api('/api/robinhood/status');if(epoch!==controller.epoch)return;rh=value;renderRH();if(rh.connected)await portfolio();}
async function portfolio(){const aid=$('#rhAccounts').value,epoch=controller.epoch;const p=await api('/api/robinhood/portfolio?accountId='+encodeURIComponent(aid));if(epoch!==controller.epoch || aid!==$('#rhAccounts').value)return;$('#rhPortfolio').innerHTML=`<dt>Account value</dt><dd>${esc(p.total_value??'Unavailable')} ${esc(p.currency)}</dd><dt>Stock buying power</dt><dd>${esc(p.buying_power?.buying_power??'Unavailable')}</dd><dt>Crypto buying power</dt><dd>${esc(p.crypto_buying_power?.buying_power??'Unavailable')}</dd><dt>Pending deposits</dt><dd>${esc(p.pending_deposits??'Unavailable')}</dd>`;}
$('#rhAccounts').onchange=()=>run(async()=>{pending=null;$('#fundingReview').hidden=true;renderRH();await portfolio();});
$('#rhConnect').onclick=()=>run(async()=>{await controller.assertIdentity();status('Opening Robinhood’s consent screen…');const result=await api('/api/robinhood/connect',{});location.assign(result.url);});
$('#rhDisconnect').onclick=()=>run(async()=>{await api('/api/robinhood/disconnect',{});rh=null;renderRH();$('#rhPortfolio').innerHTML='';status('Robinhood disconnected from this Desk session. Revoke access in Robinhood to remove the provider grant.');});
$('#rhRefresh').onclick=()=>run(refreshRH);
$('#rhOrder').onsubmit=e=>{e.preventDefault();void run(async()=>{
  await controller.assertIdentity();const fields={...Object.fromEntries(new FormData(e.target)),accountId:$('#rhAccounts').value};
  const preview=await api('/api/robinhood/preview',fields);
  const disclosure=preview.review.market_data_disclosure;
  const alerts=preview.review.order_checks || preview.review.errors || preview.review.validation_errors;
  if(preview.blocked){status('Broker review blocked this order: '+JSON.stringify(alerts),true);return;}
  review('LIVE Robinhood limit order',`<p>${esc(fields.side.toUpperCase())} ${esc(fields.quantity)} ${esc(fields.symbol.toUpperCase())} @ $${esc(fields.limit_price)}</p><p>${esc(rh.accounts.find(a=>a.id===fields.accountId)?.name)} · ${esc(rh.accounts.find(a=>a.id===fields.accountId)?.account)}</p>${disclosure?'<p>'+esc(disclosure)+'</p>':''}<pre>${esc(JSON.stringify(preview.review,null,2))}</pre>`,'This preview expires in 30 seconds. Confirmation sends the request to Robinhood; any required Robinhood approval and final order status appear there.',async()=>{if(fields.accountId!==$('#rhAccounts').value)throw new Error('Account changed. Review again.');const result=await api('/api/robinhood/submit',{id:preview.id,confirmation:$('#liveConfirmation').value});status(result.message);},true);
});};
await run(async()=>{config=await api('/api/integrations');$('#fundingRuntime').textContent=config.liveEnabled?'Live requests enabled · each order and transfer requires your review':'Preview runtime · mainnet orders and Base transfers disabled · testnet ticket available';if(!config.walletVerificationAvailable)status('Wallet verification dependency missing. Install requirements-wallet.txt using the server Python.',true);await controller.restore();if(controller.session?.authenticated){status('Wallet session restored. Select your extension if it is locked.');await loadHLRequests();if(location.search.includes('connection=robinhood'))await refreshRH();}});
