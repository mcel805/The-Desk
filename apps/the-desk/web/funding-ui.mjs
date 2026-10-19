import {WalletController,discoverWallets,restoreWalletSession,shortAddress,BASE,USDC} from './wallet-model.mjs';
import {exchangeFor,limitOrder,orderResult} from './vendor/hyperliquid-wallet.js';
import {HardwareProvider} from './hardware-wallet.mjs';
import {WalletPairing} from './wallet-pairing.mjs';
const transports=()=>import('./vendor/wallet-transports.js');
const qrRenderer=()=>import('./vendor/wallet-qr.js');

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=s=>document.querySelector(s);
async function api(path,payload) {
  const response=await fetch(path,{method:payload===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:payload===undefined?{}:{'Content-Type':'application/json'},body:payload===undefined?undefined:JSON.stringify(payload)});
  const result=await response.json();if(!response.ok) throw new Error(result.error||'Connection unavailable.');return result;
}
const drawer=document.createElement('dialog');drawer.id='fundingDrawer';drawer.setAttribute('aria-labelledby','fundingTitle');
drawer.innerHTML=`<header class="funding-heading"><button id="walletBack" class="wallet-icon-button" aria-label="Back to wallet options" hidden>‹</button><div><span class="funding-eyebrow">THE DESK</span><h2 id="fundingTitle">Connect a wallet</h2></div><span class="wallet-network"><i></i>Base</span><button id="fundingClose" class="wallet-icon-button" aria-label="Close wallet and funding">×</button></header>
<div id="walletConnection">
  <div id="walletChoices"><p class="wallet-intro">Your wallet. Your keys.</p><div id="installedWallets"></div>
  <button class="wallet-choice" id="chooseLedger"><span class="wallet-logo ledger-logo">⌘</span><span><strong>Ledger</strong><small>Connect directly by USB · no extension</small></span><span class="wallet-chevron">›</span></button>
  <button class="wallet-choice" id="chooseMobile"><span class="wallet-logo wc-logo">⌁</span><span><strong>WalletConnect</strong><small id="mobileAvailability">Mobile wallet pairing</small></span><span class="wallet-chevron">›</span></button>
  <button class="wallet-choice" id="chooseBrowser"><span class="wallet-logo rabby-logo">R</span><span><strong>Rabby & browser wallets</strong><small id="browserAvailability">Checking installed wallets…</small></span><span class="wallet-chevron">›</span></button>
  <details class="wallet-help"><summary>Which wallet should I use?</summary><p>Ledger connects over USB on this Mac. Rabby runs in its own extension or wallet app. WalletConnect pairs a compatible mobile wallet without an extension.</p><p>Base also offers a passkey account through Coinbase Wallet. That creates a separate account; it does not connect your Ledger.</p><a href="https://docs.cdp.coinbase.com/coinbase-wallet/overview" target="_blank" rel="noopener noreferrer">About Base passkey accounts ↗</a></details><p class="wallet-footnote">Connecting verifies your address. Every supported trade needs a separate review and signature.</p></div>
  <div id="hardwareLogin" hidden><div class="wallet-step-icon ledger-logo">⌘</div><h3>Connect your Ledger</h3><p class="wallet-intro">Unlock it and open Ethereum.</p><p id="hardwareStatus" role="status" class="wallet-message">Ready to check USB.</p><button id="hardwareScan" class="wallet-wide">Try USB again</button><div id="hardwareSelection" hidden><label>Device<select id="hardwareDevices" aria-label="USB hardware device"></select></label><details class="wallet-help"><summary>Choose a different account</summary><div class="two-col"><label>Account layout<select id="hardwareScheme" aria-label="Hardware account layout"><option value="ledger-live">Ledger Live</option><option value="legacy">Legacy Ethereum</option></select></label><label>Account<select id="hardwareIndex" aria-label="Hardware account number">${Array.from({length:20},(_,i)=>`<option value="${i}">Account ${i+1}</option>`).join('')}</select></label></div></details><button id="hardwareConnect" class="primary wallet-wide">Continue with Ledger</button></div><details class="wallet-help" id="hardwareHelp"><summary>Ledger not showing up?</summary><ol><li>Connect one Ledger directly to this Mac with a data-capable USB cable. Try another cable or port, without a hub.</li><li>Unlock with the PIN on Ledger, then open Ethereum.</li><li>If macOS asks to allow the accessory, approve it on your Mac. Close Ledger Live or other wallet apps using USB.</li><li>Select Try USB again. A signature made in another app does not sign you into this Desk.</li></ol><button id="hardwareAlternative">Use another connection</button></details></div>
  <div id="walletLogin" hidden><h3>Browser wallets</h3><div id="browserWalletList"></div><p id="walletInstall" class="wallet-message" hidden>No wallet extension is visible in this browser. Safari and the in-app browser cannot use an extension installed in Chrome.</p><div class="wallet-links"><a href="https://rabby.io/" target="_blank" rel="noopener noreferrer">Get Rabby ↗</a><button id="browserAlternative">Use Ledger or mobile</button></div></div>
  <div id="mobileLogin" hidden><div class="wallet-step-icon wc-logo">⌁</div><h3>Scan to connect</h3><p class="wallet-intro">Use WalletConnect in your mobile wallet.</p><div id="mobileQR" class="wallet-qr" hidden><img id="pairingQR" alt="WalletConnect pairing QR code"><button id="copyPairing">Copy pairing link</button></div><p id="pairingStatus" class="wallet-message" role="status"></p><button id="retryPairing" class="primary wallet-wide" hidden>Try pairing again</button><details id="pairingSetup" class="wallet-help" hidden><summary>Mobile pairing setup</summary><p>This app needs its own Reown project ID before it can create a real QR connection. No pairing QR has been generated.</p><a href="https://dashboard.reown.com/" target="_blank" rel="noopener noreferrer">Open Reown dashboard ↗</a><p>Set DESK_WALLETCONNECT_PROJECT_ID on the Desk server and restart it. Ledger USB works without this service.</p></details><button id="cancelPairing" class="wallet-wide">Cancel pairing</button><a class="wallet-license" href="/vendor/WALLET-NOTICE.txt" target="_blank" rel="noopener noreferrer">WalletConnect · notices</a></div>
</div>
<p id="fundingStatus" role="status" aria-live="polite" hidden></p>
<div id="walletAccount" hidden><div class="funding-identity"><span class="wallet-avatar">◈</span><div><strong id="connectedWallet">Your wallet</strong><p id="walletIdentity" class="muted"></p></div><button id="copyAccount" class="wallet-icon-button" aria-label="Copy wallet address">⧉</button><button id="walletLogout" class="wallet-icon-button" aria-label="Disconnect wallet" title="Disconnect">⏻</button></div><a id="walletExplorer" class="wallet-explorer" target="_blank" rel="noopener noreferrer">View on BaseScan ↗</a>
<nav class="funding-tabs" aria-label="Account connections"><button data-funding-tab="wallet" class="active">Tokens</button><button data-funding-tab="hyperliquid">Hyperliquid</button><button data-funding-tab="robinhood">Robinhood</button></nav>
<section data-funding-panel="wallet"><div class="funding-row"><h3>On Base</h3><button id="refreshWallet" class="wallet-icon-button" aria-label="Refresh balances">↻</button></div><div class="wallet-token"><span class="wallet-logo usdc-logo">$</span><span><strong>USD Coin</strong><small>Native USDC</small></span><strong id="walletUSDC">—</strong></div><div class="wallet-token"><span class="wallet-logo eth-logo">♦</span><span><strong>Ethereum</strong><small>ETH · gas</small></span><strong id="walletETH">—</strong></div><p class="muted" id="balanceAsOf">Refresh to read balances.</p><div class="funding-actions wallet-quick-actions"><button id="receiveWallet">↓<span>Receive</span></button><a href="https://app.uniswap.org/swap?chain=base" target="_blank" rel="noopener noreferrer">⇄<span>Swap ↗</span></a><a href="https://docs.base.org/base-chain/network-information/ecosystem-bridges" target="_blank" rel="noopener noreferrer">↗<span>Bridge ↗</span></a><button id="sendWallet" disabled title="Base transfers are not enabled">↑<span>Send</span></button></div>
<div id="receivePanel" class="funding-card" hidden><div class="funding-row"><h3>Receive on Base</h3><button id="receiveClose" aria-label="Close receive address">×</button></div><div class="wallet-qr"><img id="receiveQR" alt="Your Base wallet receive address"></div><code id="receiveAddress"></code><button id="copyWallet" class="wallet-wide">Copy address</button><p class="muted">Use the Base network. Native USDC contract:</p><code>${USDC}</code><p class="muted">Hyperliquid collateral and Robinhood buying power are separate.</p></div>
<details class="wallet-help"><summary>Activity & connection details</summary><p id="walletActivity" class="muted">No transfers submitted from this Desk.</p><p class="muted">Swaps and bridges open their own apps. Your wallet must connect there separately.</p><p class="funding-runtime" id="fundingRuntime">Checking connection services…</p></details></section>
<section data-funding-panel="hyperliquid" hidden><div class="funding-card"><div class="funding-row"><h3>Hyperliquid account</h3><select id="hlNetwork" aria-label="Hyperliquid network"><option value="testnet">Testnet · no real money</option><option value="mainnet">Mainnet · real money</option></select></div><p>Base is your wallet network. Hyperliquid trades settle on HyperCore using venue collateral.</p><div class="funding-balances"><div><small>Perpetual account value · USD</small><strong id="hlValue">—</strong></div><div><small>Withdrawable collateral · USD</small><strong id="hlAvailable">—</strong></div></div><p id="hlAsOf" class="muted">Refresh to read this wallet’s venue account.</p><div class="funding-actions"><button id="hlRefresh">Refresh account</button><a id="hlFundingLink" href="https://app.hyperliquid-testnet.xyz/" target="_blank" rel="noopener noreferrer">Deposit / withdraw at venue ↗</a></div></div>
<form id="hlOrder" class="funding-card"><h3>Wallet-signed limit order</h3><div class="two-col"><label>Market<select name="coin"><option>BTC</option><option>ETH</option><option>SOL</option></select></label><label>Side<select name="side"><option value="buy">Buy / Long</option><option value="sell">Sell / Short</option></select></label></div><div class="two-col"><label>Quantity · coin<input name="quantity" inputmode="decimal" required placeholder="Enter quantity"></label><label>Limit price · USD<input name="price" inputmode="decimal" required placeholder="Enter limit price"></label></div><label class="funding-checkbox"><input name="reduceOnly" type="checkbox">Reduce only</label><p class="muted">Good till cancelled. Uses the venue’s current leverage and margin settings. Review them in Hyperliquid before trading.</p><button class="primary" id="hlReviewButton">Review testnet order</button><p id="hlSignerNotice" class="muted">Your connected signer must support exchange orders. Mainnet orders also require the live runtime flag and typed confirmation.</p></form>
<div class="funding-card"><h3>Working orders</h3><div id="hlOrders" class="muted">No snapshot loaded.</div></div><div class="funding-card"><h3>Positions & recent fills</h3><div id="hlPositions" class="muted">No snapshot loaded.</div><div id="hlFills"></div></div></section>
<section data-funding-panel="robinhood" hidden><div class="funding-card"><div class="funding-row"><h3>Robinhood</h3><button id="rhConnect" class="primary">Sign in to Robinhood</button><button id="rhDisconnect" hidden>Disconnect</button></div><p id="rhStatus">Sign in with your Base wallet, then connect through Robinhood’s hosted consent screen.</p><label>Brokerage account<select id="rhAccounts" aria-label="Robinhood account"></select></label><button id="rhRefresh">Refresh account</button><dl id="rhPortfolio"></dl><a href="https://robinhood.com/" target="_blank" rel="noopener noreferrer">Fund account / open Robinhood ↗</a><p class="muted">External trading uses the eligible Agentic account. Account funds remain at Robinhood.</p></div>
<div id="rhOrder" class="funding-card"><h3>Robinhood order preview</h3><p class="muted">Order submission is disabled in this paper runtime. Account status and portfolio data remain read-only.</p></div>
<div class="funding-card"><h3>Options & futures</h3><p>Use Robinhood’s own interface for options and futures. This Desk ticket does not yet support options. No futures order tool is verified for the official MCP connection.</p><a href="https://robinhood.com/" target="_blank" rel="noopener noreferrer">Open Robinhood ↗</a></div></section></div>
`;
document.body.append(drawer);
const hlPanel=document.createElement('div');hlPanel.id='hlRequestsPanel';hlPanel.className='funding-card';hlPanel.hidden=true;hlPanel.innerHTML='<h3>Pending venue requests</h3><p class="muted">An unresolved request blocks another order for this wallet and network until the venue confirms its state.</p><div id="hlRequests"></div>';document.querySelector('[data-funding-panel="hyperliquid"]').insertBefore(hlPanel,$('#hlOrder'));
const hlReview=document.createElement('dialog');hlReview.id='hlOrderReview';hlReview.className='funding-review';hlReview.innerHTML='<h3 id="hlReviewTitle">Review Hyperliquid order</h3><div id="hlReviewDetails"></div><p id="hlReviewNote"></p><label id="hlLiveConfirmationLabel" hidden>Type PLACE LIVE ORDER<input id="hlLiveConfirmation" autocomplete="off"></label><div class="funding-actions"><button id="hlReviewCancel">Cancel</button><button id="hlConfirmOrder" class="primary">Confirm and sign</button></div>';document.body.append(hlReview);
let wallets=[],config={},hl=null,hlRequests=[],rh=null,operation=false,connectionView='choices',pairing=null,pairingURI='',pairingAttempt=0;
let qrRequest=0,connectionEpoch=0;
const hardware=new HardwareProvider(api);
const controller=new WalletController(api,()=>{
  $('#walletButton').textContent=shortAddress(controller.session?.address);$('#walletButton').classList.toggle('connected',!!controller.session?.authenticated);
  $('#connectedWallet').textContent=shortAddress(controller.session?.address);
  const signedIn=!!controller.session?.authenticated;drawer.dataset.connected=String(signedIn);$('#walletAccount').hidden=!signedIn;$('#fundingTitle').textContent=signedIn?'Your wallet':'Connect a wallet';$('#walletBack').hidden=signedIn||connectionView==='choices';$('#walletExplorer').href=signedIn?'https://basescan.org/address/'+controller.session.address:'https://basescan.org/';
  $('#walletIdentity').textContent=controller.session?.authenticated?`Signed in on Base · ${controller.provider?.kind==='ledger-usb'?'Ledger USB · keys stay on your device':controller.provider?.kind==='walletconnect'?'Mobile wallet':'Browser wallet'}`:'Sign in on Base with your USB hardware wallet. No browser extension required.';
  $('#walletLogout').hidden=!controller.session?.authenticated;
  window.dispatchEvent(new CustomEvent('desk:wallet-context',{detail:{authenticated:!!controller.session?.authenticated,address:controller.session?.authenticated?controller.session.address:null}}));
  $('#walletConnection').hidden=!!controller.session?.authenticated;
  $('#hardwareScan').disabled=controller.busy||operation;
  $('#hardwareConnect').disabled=controller.busy||operation;
  renderHLRequests();
  document.querySelectorAll('[data-wallet-id]').forEach(b=>b.disabled=controller.busy||operation);
  if(!controller.session?.authenticated){hl=null;rh=null;hlRequests=[];renderHLRequests();$('#walletETH').textContent='—';$('#walletUSDC').textContent='—';$('#balanceAsOf').textContent='Connect a wallet to read balances.';$('#receivePanel').hidden=true;$('#receiveAddress').textContent='';$('#receiveQR').removeAttribute('src');$('#hlValue').textContent='—';$('#hlAvailable').textContent='—';$('#hlOrders').textContent='No snapshot loaded.';$('#hlPositions').textContent='No snapshot loaded.';$('#hlFills').textContent='';$('#hlAsOf').textContent='No snapshot for this wallet.';$('#rhStatus').textContent='Sign in with your Base wallet, then connect through Robinhood’s hosted consent screen.';$('#walletActivity').textContent='No transfer submitted from this page in this session.';$('#rhAccounts').innerHTML='';$('#rhPortfolio').innerHTML='';$('#rhDisconnect').hidden=true;$('#rhConnect').hidden=false;}
  if(controller.error)status(controller.error,true);
});
function status(message,error=false){$('#fundingStatus').hidden=!message;$('#fundingStatus').textContent=message;$('#fundingStatus').classList.toggle('error',error);}
function setConnectionView(view){connectionEpoch++;connectionView=view;for(const [id,name] of [['walletChoices','choices'],['hardwareLogin','ledger'],['walletLogin','browser'],['mobileLogin','mobile']])$('#'+id).hidden=view!==name;$('#walletBack').hidden=view==='choices'||!!controller.session?.authenticated;status('');}
function lockControls(){for(const id of ['hardwareScan','hardwareConnect','hardwareDevices','hardwareScheme','hardwareIndex','chooseLedger','chooseMobile','chooseBrowser','walletBack'])$('#'+id).disabled=operation||controller.busy;document.querySelectorAll('[data-wallet-id]').forEach(b=>b.disabled=operation||controller.busy);}
async function run(fn){if(operation)return;operation=true;lockControls();try{await fn();}catch(e){status(e.code===4001?'Wallet request declined.':e.message,true);}finally{operation=false;lockControls();}}
async function cancelPairing(){++pairingAttempt;qrRequest++;pairingURI='';$('#mobileQR').hidden=true;$('#pairingQR').removeAttribute('src');await pairing?.disconnect().catch(()=>{});}
$('#walletButton').onclick=()=>{if(!controller.session?.authenticated&&!operation)setConnectionView('choices');drawer.showModal();};
$('#fundingClose').onclick=()=>drawer.close();drawer.addEventListener('close',()=>{connectionEpoch++;if(controller.busy)void controller.invalidate('Sign-in cancelled.');if(connectionView==='mobile'&&!controller.session?.authenticated)void cancelPairing();});
$('#walletBack').onclick=async()=>{await cancelPairing();setConnectionView('choices');};
drawer.addEventListener('click',e=>{if(e.target===drawer){const r=drawer.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)drawer.close();}});
document.querySelectorAll('[data-funding-tab]').forEach(button=>button.onclick=()=>{drawer.dataset.panel=button.dataset.fundingTab;document.querySelectorAll('[data-funding-tab]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-current',b===button?'page':'false');});document.querySelectorAll('[data-funding-panel]').forEach(p=>p.hidden=p.dataset.fundingPanel!==button.dataset.fundingTab);});
function walletRows(items){return items.map(x=>`<button class="wallet-choice" data-wallet-id="${esc(x.id)}"><span class="wallet-logo ${x.provider.isRabby||x.rdns==='io.rabby'?'rabby-logo':'browser-logo'}">${x.provider.isRabby||x.rdns==='io.rabby'?'R':'◈'}</span><span><strong>${esc(x.name)}</strong><small>Detected in this browser</small></span><span class="wallet-detected">●</span></button>`).join('');}
function bindWalletRows(){document.querySelectorAll('[data-wallet-id]').forEach(button=>button.onclick=()=>run(async()=>{const chosen=wallets.find(x=>x.id===button.dataset.walletId);if(!chosen)throw new Error('Wallet is no longer available.');status('Approve the sign-in message in '+chosen.name+'.');await controller.login(chosen.provider);sessionStorage.setItem('desk-wallet-provider',chosen.id);status('');await refreshBalances();await loadHLRequests();}));lockControls();}
discoverWallets(window,items=>{wallets=items;$('#installedWallets').innerHTML=walletRows(items);$('#browserWalletList').innerHTML=walletRows(items);$('#walletInstall').hidden=items.length>0;$('#browserAvailability').textContent=items.length?'Choose an installed wallet':'Extension needed in this browser';bindWalletRows();const chosen=items.find(x=>x.id===sessionStorage.getItem('desk-wallet-provider'));if(chosen&&!controller.provider)controller.bind(chosen.provider);});
$('#chooseBrowser').onclick=()=>setConnectionView('browser');
$('#browserAlternative').onclick=$('#hardwareAlternative').onclick=()=>setConnectionView('choices');
async function scanHardware(){
  $('#hardwareStatus').textContent='Checking this Mac for Ledger…';$('#hardwareSelection').hidden=true;$('#hardwareDevices').innerHTML='';
  try{
    const {devices,diagnostic}=await api('/api/wallet/hardware/discover',{});
    $('#hardwareDevices').innerHTML=devices.map((d,i)=>`<option value="${esc(d.id)}">${esc(d.name)}${devices.length>1?' · '+(i+1):''}</option>`).join('');
    $('#hardwareSelection').hidden=!devices.length;$('#hardwareScan').hidden=devices.length>0;$('#hardwareHelp').open=!devices.length;
    $('#hardwareStatus').textContent=devices.length?'Ledger detected. Continue to confirm your address.':diagnostic?.message||'This Mac is not reporting a Ledger USB connection. Try a data cable or another port, then retry.';
  }catch(error){$('#hardwareScan').hidden=false;$('#hardwareHelp').open=true;$('#hardwareStatus').textContent=error.message;throw error;}
}
$('#chooseLedger').onclick=()=>{setConnectionView('ledger');void run(scanHardware);};
$('#hardwareScan').onclick=()=>run(scanHardware);
$('#hardwareConnect').onclick=()=>run(async()=>{
  const attempt=connectionEpoch;await controller.invalidate();status('Confirm the selected account address on your Ledger, then approve the Base login message. Reject on the device to cancel.');
  const value=await api('/api/wallet/hardware/connect',{deviceId:$('#hardwareDevices').value,scheme:$('#hardwareScheme').value,index:Number($('#hardwareIndex').value)});
  if(attempt!==connectionEpoch){await api('/api/wallet/hardware/disconnect',{});throw new Error('Sign-in cancelled.');}
  hardware.setAccount(value.address);await controller.login(hardware);sessionStorage.setItem('desk-wallet-provider','ledger-usb');
  $('#hardwareStatus').textContent=`Connected · ${value.path}`;status('');
  await refreshBalances();await loadHLRequests();
});
async function beginPairing(){
  const attempt=++pairingAttempt;$('#retryPairing').hidden=true;$('#mobileQR').hidden=true;$('#pairingSetup').hidden=true;$('#pairingStatus').textContent='Creating a secure pairing…';
  if(!config.walletConnectProjectId){$('#pairingStatus').textContent='Mobile pairing isn’t configured for this Desk yet.';$('#pairingSetup').hidden=false;return;}
  pairing=new WalletPairing({load:transports,projectId:config.walletConnectProjectId,origin:location.origin,onURI:async uri=>{
    const request=++qrRequest;pairingURI=uri;const {qrImage}=await qrRenderer();const image=await qrImage(uri,{width:240,margin:1,errorCorrectionLevel:'M'});
    if(attempt!==pairingAttempt||request!==qrRequest)return;$('#pairingQR').src=image;$('#mobileQR').hidden=false;$('#pairingStatus').textContent='Scan with your wallet and approve the connection.';
  }});
  try{
    const provider=await pairing.connect();if(attempt!==pairingAttempt)return;
    $('#mobileQR').hidden=true;pairingURI='';$('#pairingStatus').textContent='Approve the Base sign-in message in your wallet.';
    await run(async()=>{await controller.login(provider);sessionStorage.setItem('desk-wallet-provider','walletconnect');await refreshBalances();await loadHLRequests();});
    if(!controller.session?.authenticated)$('#retryPairing').hidden=false;
  }catch(error){if(attempt!==pairingAttempt)return;$('#mobileQR').hidden=true;pairingURI='';$('#pairingStatus').textContent=error.message;$('#retryPairing').hidden=false;}
}
$('#chooseMobile').onclick=()=>{setConnectionView('mobile');void beginPairing();};
$('#retryPairing').onclick=async()=>{await cancelPairing();void beginPairing();};
$('#cancelPairing').onclick=async()=>{await cancelPairing();setConnectionView('choices');};
$('#copyPairing').onclick=()=>run(async()=>{if(!pairingURI)throw new Error('Create a new pairing first.');await navigator.clipboard.writeText(pairingURI);$('#pairingStatus').textContent='Pairing link copied. Open it only in your wallet.';});
$('#walletLogout').onclick=()=>run(async()=>{const direct=controller.provider?.kind==='ledger-usb',mobile=controller.provider?.kind==='walletconnect';await controller.invalidate();if(direct)await hardware.disconnect();if(mobile)await pairing?.disconnect();sessionStorage.removeItem('desk-wallet-provider');$('#hardwareSelection').hidden=true;$('#hardwareScan').hidden=false;hlRequests=[];renderHLRequests();setConnectionView('choices');});
async function refreshBalances(){const b=await controller.balances();$('#walletETH').textContent=b.eth;$('#walletUSDC').textContent=b.usdc;$('#balanceAsOf').textContent=`Base block ${BigInt(b.block)} · ${new Date(b.observedAt).toLocaleTimeString()} · Refresh for current balances`;}
$('#refreshWallet').onclick=()=>run(async()=>{await refreshBalances();status('');});
$('#receiveWallet').onclick=()=>run(async()=>{const address=await controller.assertIdentity(),epoch=controller.epoch;const {qrImage}=await qrRenderer();const image=await qrImage('ethereum:'+address+'@8453',{width:220,margin:1});if(epoch!==controller.epoch)return;$('#receiveAddress').textContent=address;$('#receiveQR').src=image;$('#receivePanel').hidden=false;});
$('#receiveClose').onclick=()=>{$('#receivePanel').hidden=true;};
$('#copyAccount').onclick=()=>run(async()=>{await navigator.clipboard.writeText(await controller.assertIdentity());status('Address copied.');});
$('#copyWallet').onclick=()=>run(async()=>{await navigator.clipboard.writeText(await controller.assertIdentity());status('Wallet address copied.');});
function hlNetwork(){return $('#hlNetwork').value;}
function networkChanged(){hl=null;$('#hlReviewButton').textContent=hlNetwork()==='testnet'?'Review testnet order':'Review live order';$('#hlValue').textContent='—';$('#hlAvailable').textContent='—';$('#hlOrders').textContent='Refresh this network to load orders.';$('#hlPositions').textContent='No snapshot loaded.';$('#hlFills').textContent='';$('#hlAsOf').textContent='No snapshot for this network.';$('#hlFundingLink').href=hlNetwork()==='testnet'?'https://app.hyperliquid-testnet.xyz/':'https://app.hyperliquid.xyz/trade';if(hlReview.open)hlReview.close();}
$('#hlNetwork').onchange=()=>{networkChanged();void loadHLRequests();};
function renderHLRequests(){const panel=$('#hlRequestsPanel'),body=$('#hlRequests');panel.hidden=!hlRequests.length;body.innerHTML=hlRequests.map(r=>`<div class="funding-order"><span>${esc(r.network.toUpperCase())} · ${esc(r.intent.side.toUpperCase())} ${esc(r.intent.quantity)} ${esc(r.intent.coin)} @ $${esc(r.intent.price)} · ${esc(r.state)} · ${esc(r.clientOrderId)}</span>${r.state==='reserved'?`<button data-hl-release="${esc(r.clientOrderId)}">Release unsigned</button>`:`<button data-hl-reconcile="${esc(r.clientOrderId)}">Reconcile</button>`}</div>`).join('');document.querySelectorAll('[data-hl-reconcile]').forEach(button=>button.onclick=()=>run(()=>reconcileHL(button.dataset.hlReconcile,hlNetwork())));document.querySelectorAll('[data-hl-release]').forEach(button=>button.onclick=()=>run(async()=>{await api('/api/integrations/hyperliquid/release',{network:hlNetwork(),clientOrderId:button.dataset.hlRelease});await loadHLRequests();status('Unsigned reservation released.');}));const hardwareOnly=controller.provider?.supportsVenueSigning===false;$('#hlReviewButton').disabled=hardwareOnly||hlRequests.length>0||(hlNetwork()==='mainnet'&&!config.hyperliquidLiveEnabled);$('#hlSignerNotice').textContent=hardwareOnly?'Ledger USB supports Base identity and balances. Hardware exchange order signing is unavailable in this connector.':'Your extension signs each order. Mainnet orders also require the live runtime flag and typed confirmation.';}
async function loadHLRequests(){if(!controller.session?.authenticated){hlRequests=[];renderHLRequests();return;}const epoch=controller.epoch,network=hlNetwork(),value=await api('/api/integrations/hyperliquid/requests?network='+network);if(epoch!==controller.epoch||network!==hlNetwork())return;hlRequests=value.requests||[];renderHLRequests();}
async function reconcileHL(clientOrderId,network){if(network!==hlNetwork())throw new Error('Network changed. Review again.');const result=await api('/api/integrations/hyperliquid/reconcile',{network,clientOrderId});status(result.found?'Venue state recorded. Refresh the account snapshot.':'The venue returned no matching order yet; this request remains blocked.',!result.found);await loadHLRequests();if(result.found)await refreshHL();}
function walletRejected(error){return error?.code===4001||/user rejected|denied|declined/i.test(String(error?.message||''));}
$('#hlReviewCancel').onclick=()=>hlReview.close();
$('#hlOrder').onsubmit=e=>{e.preventDefault();void run(async()=>{
  const network=hlNetwork();
  if(controller.provider?.supportsVenueSigning===false)throw new Error('This hardware connector supports Base login and balances; exchange signing is unavailable.');
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
    if(controller.provider?.supportsVenueSigning===false)throw new Error('Hardware exchange order signing is unavailable in this connector.');
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
await run(async()=>{
  config=await api('/api/integrations');
  $('#mobileAvailability').textContent=config.walletConnectProjectId?'Scan a QR code · no extension':'Mobile pairing · setup needed';
  $('#fundingRuntime').textContent=`Hyperliquid Testnet orders available · Mainnet ${config.hyperliquidLiveEnabled?'enabled with typed review':'disabled'} · Base transfers and Robinhood submissions disabled`;
  if(!config.walletVerificationAvailable)status('Wallet verification dependency missing. Install requirements-wallet.txt using the server Python.',true);
  const capability=await api('/api/wallet/hardware/capabilities');
  $('#hardwareStatus').textContent=capability.available?'Local USB connector ready. Connect your Ledger and find USB devices.':capability.error||'Local USB connector unavailable.';

  // Load cookie state without rendering it until this tab restores the wallet
  // provider that originally signed it. Cookies are shared across tabs; the
  // selected provider marker intentionally is not.
  const savedProvider=sessionStorage.getItem('desk-wallet-provider');
  const restoredProvider=await restoreWalletSession(controller,async()=>{
    if(savedProvider==='ledger-usb')return hardware;
    if(savedProvider==='walletconnect'&&config.walletConnectProjectId){
      pairing=new WalletPairing({load:transports,projectId:config.walletConnectProjectId,origin:location.origin});
      return await pairing.restore();
    }
    if(savedProvider&&savedProvider!=='walletconnect')return wallets.find(wallet=>wallet.id===savedProvider)?.provider||null;
    return null;
  });
  if(!restoredProvider){
    sessionStorage.removeItem('desk-wallet-provider');
    if(savedProvider==='walletconnect'&&!config.walletConnectProjectId)$('#mobileAvailability').textContent='Mobile pairing · setup needed';
  }else{
    status(restoredProvider.kind==='ledger-usb'?'Base session restored. Reconnect and unlock Ledger before reading its balances.':'Wallet session restored. Select your extension if it is locked.');
    await loadHLRequests();
    if(location.search.includes('connection=robinhood'))await refreshRH();
  }
});
