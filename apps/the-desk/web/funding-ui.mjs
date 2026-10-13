import {WalletController,discoverWallets,shortAddress,BASE,USDC} from './wallet-model.mjs';
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
<div class="funding-actions"><button id="receiveWallet">Receive</button><button id="sendWallet" disabled>Send unavailable</button><a href="https://app.uniswap.org/" target="_blank" rel="noopener noreferrer">Swap on Uniswap ↗</a><a href="https://docs.base.org/base-chain/network-information/ecosystem-bridges" target="_blank" rel="noopener noreferrer">Bridge to Base ↗</a></div>
<div id="receivePanel" class="funding-card" hidden><h3>Receive on Base</h3><p>Use the Base network. Native USDC contract:</p><code>${USDC}</code><p>Your wallet address</p><code id="receiveAddress"></code><button id="copyWallet">Copy address</button><p class="muted">This funds your wallet. Hyperliquid collateral and Robinhood buying power are separate.</p></div>
<div class="funding-card"><h3>Base transfers</h3><p class="muted">Transfers are disabled in this paper runtime. Use the connected wallet’s own interface when funding is approved.</p></div>
<div class="funding-card"><h3>Wallet activity</h3><p id="walletActivity" class="muted">No transfer submitted from this page in this session.</p><p class="muted">Rabby or MetaMask holds your keys and provides its transaction simulation. Swaps, bridges and full wallet history open their provider interfaces.</p></div></section>
<section data-funding-panel="hyperliquid" hidden><div class="funding-card"><div class="funding-row"><h3>Hyperliquid account</h3><select id="hlNetwork" aria-label="Hyperliquid network"><option value="testnet">Testnet · no real money</option><option value="mainnet">Mainnet · real money</option></select></div><p>Base is your wallet network. Hyperliquid trades settle on HyperCore using venue collateral.</p><div class="funding-balances"><div><small>Perpetual account value · USD</small><strong id="hlValue">—</strong></div><div><small>Withdrawable collateral · USD</small><strong id="hlAvailable">—</strong></div></div><p id="hlAsOf" class="muted">Refresh to read this wallet’s venue account.</p><div class="funding-actions"><button id="hlRefresh">Refresh account</button><a id="hlFundingLink" href="https://app.hyperliquid-testnet.xyz/" target="_blank" rel="noopener noreferrer">Deposit / withdraw at venue ↗</a></div></div>
<form id="hlOrder" class="funding-card"><h3>Wallet-signed limit order</h3><div class="two-col"><label>Market<select name="coin"><option>BTC</option><option>ETH</option><option>SOL</option></select></label><label>Side<select name="side"><option value="buy">Buy / Long</option><option value="sell">Sell / Short</option></select></label></div><div class="two-col"><label>Quantity · coin<input name="quantity" inputmode="decimal" required placeholder="Enter quantity"></label><label>Limit price · USD<input name="price" inputmode="decimal" required placeholder="Enter limit price"></label></div><label class="funding-checkbox"><input name="reduceOnly" type="checkbox">Reduce only</label><p class="muted">Good till cancelled. Uses the venue’s current leverage and margin settings. Review them in Hyperliquid before trading.</p><button class="primary" id="hlReviewButton">Review testnet order</button><p class="muted">Your extension signs each order. Mainnet orders also require the live runtime flag and typed confirmation.</p></form>
<div class="funding-card"><h3>Working orders</h3><div id="hlOrders" class="muted">No snapshot loaded.</div></div><div class="funding-card"><h3>Positions & recent fills</h3><div id="hlPositions" class="muted">No snapshot loaded.</div><div id="hlFills"></div></div></section>
<section data-funding-panel="robinhood" hidden><div class="funding-card"><div class="funding-row"><h3>Robinhood</h3><button id="rhConnect" class="primary">Sign in to Robinhood</button><button id="rhDisconnect" hidden>Disconnect</button></div><p id="rhStatus">Sign in with your Base wallet, then connect through Robinhood’s hosted consent screen.</p><label>Brokerage account<select id="rhAccounts" aria-label="Robinhood account"></select></label><button id="rhRefresh">Refresh account</button><dl id="rhPortfolio"></dl><a href="https://robinhood.com/" target="_blank" rel="noopener noreferrer">Fund account / open Robinhood ↗</a><p class="muted">External trading uses the eligible Agentic account. Account funds remain at Robinhood.</p></div>
<div id="rhOrder" class="funding-card"><h3>Robinhood order preview</h3><p class="muted">Order submission is disabled in this paper runtime. Account status and portfolio data remain read-only.</p></div>
<div class="funding-card"><h3>Options & futures</h3><p>Use Robinhood’s own interface for options and futures. This Desk ticket does not yet support options. No futures order tool is verified for the official MCP connection.</p><a href="https://robinhood.com/" target="_blank" rel="noopener noreferrer">Open Robinhood ↗</a></div></section>
`;
document.body.append(drawer);
const hlPanel=document.createElement('div');hlPanel.id='hlRequestsPanel';hlPanel.className='funding-card';hlPanel.hidden=true;hlPanel.innerHTML='<h3>Pending venue requests</h3><p class="muted">An unresolved request blocks another order for this wallet and network until the venue confirms its state.</p><div id="hlRequests"></div>';document.querySelector('[data-funding-panel="hyperliquid"]').insertBefore(hlPanel,$('#hlOrder'));
const hlReview=document.createElement('dialog');hlReview.id='hlOrderReview';hlReview.className='funding-review';hlReview.innerHTML='<h3 id="hlReviewTitle">Review Hyperliquid order</h3><div id="hlReviewDetails"></div><p id="hlReviewNote"></p><label id="hlLiveConfirmationLabel" hidden>Type PLACE LIVE ORDER<input id="hlLiveConfirmation" autocomplete="off"></label><div class="funding-actions"><button id="hlReviewCancel">Cancel</button><button id="hlConfirmOrder" class="primary">Confirm and sign</button></div>';document.body.append(hlReview);
let wallets=[],config={},hl=null,hlRequests=[],rh=null,operation=false;
const controller=new WalletController(api,()=>{
  $('#walletButton').textContent=shortAddress(controller.session?.address);
  $('#connectedWallet').textContent=controller.session?.authenticated?controller.session.address:'Connect your wallet';
  $('#walletIdentity').textContent=controller.session?.authenticated?'Signed in on Base · keys stay in your wallet':'Sign in on Base with Rabby or MetaMask.';
  $('#walletLogout').hidden=!controller.session?.authenticated;
  $('#walletConnect').disabled=controller.busy || !wallets.length;
  if(!controller.session?.authenticated){hl=null;rh=null;hlRequests=[];renderHLRequests();$('#walletETH').textContent='—';$('#walletUSDC').textContent='—';$('#balanceAsOf').textContent='Connect a wallet to read balances.';$('#receivePanel').hidden=true;$('#receiveAddress').textContent='';$('#hlValue').textContent='—';$('#hlAvailable').textContent='—';$('#hlOrders').textContent='No snapshot loaded.';$('#hlPositions').textContent='No snapshot loaded.';$('#hlFills').textContent='';$('#hlAsOf').textContent='No snapshot for this wallet.';$('#rhStatus').textContent='Sign in with your Base wallet, then connect through Robinhood’s hosted consent screen.';$('#walletActivity').textContent='No transfer submitted from this page in this session.';$('#rhAccounts').innerHTML='';$('#rhPortfolio').innerHTML='';$('#rhDisconnect').hidden=true;$('#rhConnect').hidden=false;}
  if(controller.error)status(controller.error,true);
});
function status(message,error=false){$('#fundingStatus').textContent=message;$('#fundingStatus').classList.toggle('error',error);}
async function run(fn){if(operation) return;operation=true;try{await fn();}catch(e){status(e.code===4001?'Wallet request declined.':e.message,true);}finally{operation=false;}}
$('#walletButton').onclick=()=>{drawer.showModal();};
$('#fundingClose').onclick=()=>drawer.close();
drawer.addEventListener('click',e=>{if(e.target===drawer){const r=drawer.getBoundingClientRect();if(e.clientX<r.left || e.clientX>r.right || e.clientY<r.top || e.clientY>r.bottom)drawer.close();}});
document.querySelectorAll('[data-funding-tab]').forEach(button=>button.onclick=()=>{document.querySelectorAll('[data-funding-tab]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-current',b===button?'page':'false');});document.querySelectorAll('[data-funding-panel]').forEach(p=>p.hidden=p.dataset.fundingPanel!==button.dataset.fundingTab);});
discoverWallets(window,items=>{wallets=items;const value=$('#walletProviders').value;$('#walletProviders').innerHTML=items.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');if(items.some(x=>x.id===value))$('#walletProviders').value=value;$('#walletInstall').hidden=items.length>0;$('#walletConnect').disabled=!items.length || controller.busy;const last=sessionStorage.getItem('desk-wallet-provider');const chosen=items.find(x=>x.id===last);if(chosen && !controller.provider)controller.bind(chosen.provider);});
$('#walletConnect').onclick=()=>run(async()=>{const chosen=wallets.find(x=>x.id===$('#walletProviders').value);if(!chosen)throw new Error('Select an installed wallet.');status('Review the one-time sign-in message in your wallet.');await controller.login(chosen.provider);sessionStorage.setItem('desk-wallet-provider',chosen.id);status('Signed in. Refresh balances or connect a trading venue.');await refreshBalances();await loadHLRequests();});
$('#walletLogout').onclick=()=>run(async()=>{await controller.invalidate();hlRequests=[];renderHLRequests();status('Disconnected.');});
async function refreshBalances(){const b=await controller.balances();$('#walletETH').textContent=b.eth;$('#walletUSDC').textContent=b.usdc;$('#balanceAsOf').textContent=`Base block ${BigInt(b.block)} · ${new Date(b.observedAt).toLocaleTimeString()} · Refresh for current balances`;}
$('#refreshWallet').onclick=()=>run(refreshBalances);
$('#receiveWallet').onclick=()=>run(async()=>{const address=await controller.assertIdentity();$('#receiveAddress').textContent=address;$('#receivePanel').hidden=false;});
$('#copyWallet').onclick=()=>run(async()=>{await navigator.clipboard.writeText(await controller.assertIdentity());status('Wallet address copied.');});
function hlNetwork(){return $('#hlNetwork').value;}
function networkChanged(){hl=null;$('#hlReviewButton').textContent=hlNetwork()==='testnet'?'Review testnet order':'Review live order';$('#hlValue').textContent='—';$('#hlAvailable').textContent='—';$('#hlOrders').textContent='Refresh this network to load orders.';$('#hlPositions').textContent='No snapshot loaded.';$('#hlFills').textContent='';$('#hlAsOf').textContent='No snapshot for this network.';$('#hlFundingLink').href=hlNetwork()==='testnet'?'https://app.hyperliquid-testnet.xyz/':'https://app.hyperliquid.xyz/trade';if(hlReview.open)hlReview.close();}
$('#hlNetwork').onchange=()=>{networkChanged();void loadHLRequests();};
function renderHLRequests(){const panel=$('#hlRequestsPanel'),body=$('#hlRequests');panel.hidden=!hlRequests.length;body.innerHTML=hlRequests.map(r=>`<div class="funding-order"><span>${esc(r.network.toUpperCase())} · ${esc(r.intent.side.toUpperCase())} ${esc(r.intent.quantity)} ${esc(r.intent.coin)} @ $${esc(r.intent.price)} · ${esc(r.state)} · ${esc(r.clientOrderId)}</span>${r.state==='reserved'?`<button data-hl-release="${esc(r.clientOrderId)}">Release unsigned</button>`:`<button data-hl-reconcile="${esc(r.clientOrderId)}">Reconcile</button>`}</div>`).join('');document.querySelectorAll('[data-hl-reconcile]').forEach(button=>button.onclick=()=>run(()=>reconcileHL(button.dataset.hlReconcile,hlNetwork())));document.querySelectorAll('[data-hl-release]').forEach(button=>button.onclick=()=>run(async()=>{await api('/api/integrations/hyperliquid/release',{network:hlNetwork(),clientOrderId:button.dataset.hlRelease});await loadHLRequests();status('Unsigned reservation released.');}));$('#hlReviewButton').disabled=hlRequests.length>0||(hlNetwork()==='mainnet'&&!config.hyperliquidLiveEnabled);}
async function loadHLRequests(){if(!controller.session?.authenticated){hlRequests=[];renderHLRequests();return;}const epoch=controller.epoch,network=hlNetwork(),value=await api('/api/integrations/hyperliquid/requests?network='+network);if(epoch!==controller.epoch||network!==hlNetwork())return;hlRequests=value.requests||[];renderHLRequests();}
async function reconcileHL(clientOrderId,network){if(network!==hlNetwork())throw new Error('Network changed. Review again.');const result=await api('/api/integrations/hyperliquid/reconcile',{network,clientOrderId});status(result.found?'Venue state recorded. Refresh the account snapshot.':'The venue returned no matching order yet; this request remains blocked.',!result.found);await loadHLRequests();if(result.found)await refreshHL();}
function walletRejected(error){return error?.code===4001||/user rejected|denied|declined/i.test(String(error?.message||''));}
$('#hlReviewCancel').onclick=()=>hlReview.close();
$('#hlOrder').onsubmit=e=>{e.preventDefault();void run(async()=>{
  const network=hlNetwork();
  if(network==='mainnet'&&!config.hyperliquidLiveEnabled)throw new Error('Hyperliquid mainnet orders are disabled in this runtime.');
  await refreshHL();if(!hl||hl.network!==network)throw new Error('Refresh the selected network first.');
  await loadHLRequests();if(hlRequests.length)throw new Error('Reconcile the pending Hyperliquid request before placing another order.');
  const data=Object.fromEntries(new FormData(e.target)),clientOrderId='0x'+crypto.randomUUID().replaceAll('-','');
  const order=limitOrder({...data,reduceOnly:data.reduceOnly==='on',cloid:clientOrderId},hl.meta),address=await controller.assertIdentity();
  const available=Number(hl.perps.withdrawable);if(!data.reduceOnly&&!(available>0))throw new Error('Fund this Hyperliquid account before opening a position.');
  const notional=Number(data.quantity)*Number(data.price),position=hl.perps.assetPositions.find(x=>x.position.coin===data.coin)?.position;
  $('#hlReviewTitle').textContent=network==='testnet'?'Review testnet limit order':'Review LIVE Hyperliquid limit order';
  $('#hlReviewDetails').innerHTML=`<p>${esc(data.side.toUpperCase())} ${esc(data.quantity)} ${esc(data.coin)} @ $${esc(data.price)}</p><p>Notional $${esc(notional.toFixed(2))} · GTC · ${order.r?'Reduce only':'Open / increase position'} · ${esc(network.toUpperCase())}</p><p>Current ${esc(data.coin)} leverage: ${esc(position?.leverage?.value??'Check venue settings')}.</p>`;
  $('#hlReviewNote').textContent='Confirming asks your wallet to sign and submits this limit order to Hyperliquid. A limit order can fill immediately. Fees and margin follow venue settings.';
  $('#hlLiveConfirmationLabel').hidden=network!=='mainnet';$('#hlLiveConfirmation').value='';$('#hlConfirmOrder').disabled=false;hlReview.showModal();
  $('#hlConfirmOrder').onclick=()=>run(async()=>{
    if(network==='mainnet'&&$('#hlLiveConfirmation').value!=='PLACE LIVE ORDER')throw new Error('Type PLACE LIVE ORDER to confirm.');
    if(network!==hlNetwork())throw new Error('Network changed. Review again.');
    await controller.assertIdentity(address);
    $('#hlConfirmOrder').disabled=true;
    await api('/api/integrations/hyperliquid/reserve',{network,clientOrderId,intent:{coin:data.coin,side:data.side,quantity:data.quantity,price:data.price,reduceOnly:order.r}});
    let submissionMarked=false;
    const signingProvider={request:async request=>{const result=await controller.provider.request(request);if(['eth_signTypedData','eth_signTypedData_v4'].includes(request.method)){await api('/api/integrations/hyperliquid/submitting',{network,clientOrderId});submissionMarked=true;}return result;}};
    status('Waiting for wallet signature and Hyperliquid response…');
    try{
      const response=await exchangeFor(signingProvider,address,network==='testnet').order({orders:[order],grouping:'na'});
      const result=orderResult(response);
      status(`Hyperliquid returned ${result.state} · checking official order status…`);
      const verified=await api('/api/integrations/hyperliquid/reconcile',{network,clientOrderId});
      if(verified.found)status(`Official Hyperliquid status: ${verified.request.venueState} · ID ${verified.request.venueOrderId}`);
      else status(`Order result is not confirmed by the venue yet. Reconcile before another order. Reference ${clientOrderId}`,true);
    }catch(error){
      if(!submissionMarked&&walletRejected(error)){await api('/api/integrations/hyperliquid/release',{network,clientOrderId});status('Wallet signature declined. The reservation was released.');}
      else {await api('/api/integrations/hyperliquid/uncertain',{network,clientOrderId,observed:{state:'uncertain'}});status(`Order result is uncertain. Reconcile before another order. Reference ${clientOrderId}`,true);}
    }
    hlReview.close();await loadHLRequests();await refreshHL();
  });
});};
async function refreshHL(){
  const epoch=controller.epoch,network=hlNetwork();await controller.assertIdentity();await loadHLRequests();
  const value=await api('/api/integrations/hyperliquid?network='+network);
  if(epoch!==controller.epoch || network!==hlNetwork())return;
  hl=value;$('#hlValue').textContent=hl.perps.marginSummary?.accountValue??'Unavailable';$('#hlAvailable').textContent=hl.perps.withdrawable??'Unavailable';$('#hlAsOf').textContent=network.toUpperCase()+' · '+new Date(hl.observedAt*1000).toLocaleTimeString();
  $('#hlOrders').innerHTML=hl.orders.length?hl.orders.map(o=>`<div class="funding-order"><span>${esc(o.coin)} · ${esc(o.side)} · ${esc(o.sz)} @ ${esc(o.limitPx)}</span><button data-hl-cancel="${esc(o.oid)}">Cancel</button></div>`).join(''):'No working orders in this snapshot.';
  $('#hlPositions').innerHTML=hl.perps.assetPositions?.length?hl.perps.assetPositions.map(x=>`<p>${esc(x.position.coin)} · size ${esc(x.position.szi)} · ${esc(x.position.leverage?.value)}× ${esc(x.position.leverage?.type)} · entry ${esc(x.position.entryPx)}</p>`).join(''):'No perpetual positions in this snapshot.';
  $('#hlFills').innerHTML='<h4>Recent fills</h4>'+(hl.fills.length?hl.fills.slice(0,10).map(f=>`<p>${esc(f.coin)} · ${esc(f.side)} · ${esc(f.sz)} @ ${esc(f.px)} · ${esc(new Date(f.time).toLocaleString())}</p>`).join(''):'No recent fills in this snapshot.');
  document.querySelectorAll('[data-hl-cancel]').forEach(button=>button.onclick=()=>run(async()=>{
    const snapshot=hl,order=snapshot?.orders.find(item=>String(item.oid)===button.dataset.hlCancel),asset=snapshot?.meta?.universe.findIndex(item=>item.name===order?.coin);
    if(!order||asset<0)throw new Error('Order is no longer in the current snapshot. Refresh and review again.');
    const address=await controller.assertIdentity(),network=snapshot.network;
    if(network==='mainnet'&&!config.hyperliquidLiveEnabled)throw new Error('Hyperliquid mainnet orders are disabled in this runtime.');
    if(!window.confirm(`Cancel ${order.coin} ${order.side} order ${order.oid} on ${network.toUpperCase()}? Your wallet must approve the cancellation.`))return;
    await controller.assertIdentity(address);if(network!==hlNetwork())throw new Error('Network changed. Review again.');
    await exchangeFor(controller.provider,address,network==='testnet').cancel({cancels:[{a:asset,o:order.oid}]});
    status('Cancellation request signed. Refresh orders to confirm its venue status.');await refreshHL();
  }));
}
$('#hlRefresh').onclick=()=>run(refreshHL);
function renderRH(){
  $('#rhConnect').hidden=!!rh?.connected;$('#rhDisconnect').hidden=!rh?.connected;
  $('#rhStatus').textContent=rh?.connected?'Connected through Robinhood · refresh buying power before trading.':'Not connected to Robinhood in this Desk session.';
  const value=$('#rhAccounts').value;$('#rhAccounts').innerHTML=(rh?.accounts||[]).map(a=>`<option value="${esc(a.id)}">${esc(a.name)} ${esc(a.account)} · ${a.tradable?'Trading available':'Read only'}</option>`).join('');
  if(rh?.accounts?.some(a=>a.id===value))$('#rhAccounts').value=value;
  else if(rh?.accounts?.some(a=>a.tradable))$('#rhAccounts').value=rh.accounts.find(a=>a.tradable).id;
}
async function refreshRH(){const epoch=controller.epoch;await controller.assertIdentity();const value=await api('/api/robinhood/status');if(epoch!==controller.epoch)return;rh=value;renderRH();if(rh.connected)await portfolio();}
async function portfolio(){const aid=$('#rhAccounts').value,epoch=controller.epoch;const p=await api('/api/robinhood/portfolio?accountId='+encodeURIComponent(aid));if(epoch!==controller.epoch || aid!==$('#rhAccounts').value)return;$('#rhPortfolio').innerHTML=`<dt>Account value</dt><dd>${esc(p.total_value??'Unavailable')} ${esc(p.currency)}</dd><dt>Stock buying power</dt><dd>${esc(p.buying_power?.buying_power??'Unavailable')}</dd><dt>Crypto buying power</dt><dd>${esc(p.crypto_buying_power?.buying_power??'Unavailable')}</dd><dt>Pending deposits</dt><dd>${esc(p.pending_deposits??'Unavailable')}</dd>`;}
$('#rhAccounts').onchange=()=>run(async()=>{renderRH();await portfolio();});
$('#rhConnect').onclick=()=>run(async()=>{await controller.assertIdentity();status('Opening Robinhood’s consent screen…');const result=await api('/api/robinhood/connect',{});location.assign(result.url);});
$('#rhDisconnect').onclick=()=>run(async()=>{await api('/api/robinhood/disconnect',{});rh=null;renderRH();$('#rhPortfolio').innerHTML='';status('Robinhood disconnected from this Desk session. Revoke access in Robinhood to remove the provider grant.');});
$('#rhRefresh').onclick=()=>run(refreshRH);
await run(async()=>{config=await api('/api/integrations');$('#fundingRuntime').textContent=`Hyperliquid Testnet orders available · Mainnet ${config.hyperliquidLiveEnabled?'enabled with typed review':'disabled'} · Base transfers and Robinhood submissions disabled`;if(!config.walletVerificationAvailable)status('Wallet verification dependency missing. Install requirements-wallet.txt using the server Python.',true);await controller.restore();if(controller.session?.authenticated){status('Wallet session restored. Select your extension if it is locked.');await loadHLRequests();if(location.search.includes('connection=robinhood'))await refreshRH();}});
