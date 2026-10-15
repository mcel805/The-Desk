export const BASE = {chainId:'0x2105', chainName:'Base', nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:['https://mainnet.base.org'],blockExplorerUrls:['https://basescan.org']};
export const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const validAddress = value => /^0x[0-9a-fA-F]{40}$/.test(value || '');
export const shortAddress = value => validAddress(value) ? value.slice(0,6)+'…'+value.slice(-4) : 'Connect wallet';

export function units(value, decimals) {
  if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value)) throw new Error('Enter a positive decimal amount.');
  const [whole, fraction=''] = value.split('.');
  if (fraction.length > decimals) throw new Error(`Use at most ${decimals} decimal places.`);
  const result = BigInt(whole)*10n**BigInt(decimals)+BigInt(fraction.padEnd(decimals,'0') || '0');
  if (result <= 0n || result >= 2n**256n) throw new Error('Amount is outside the supported range.');
  return result;
}
export function formatUnits(value, decimals) {
  const n=BigInt(value), scale=10n**BigInt(decimals);
  return `${n/scale}.${(n%scale).toString().padStart(decimals,'0')}`.replace(/\.?0+$/,'');
}
export function transferRequest({from,to,asset,amount}) {
  if (!validAddress(from) || !validAddress(to) || /^0x0{40}$/i.test(to)) throw new Error('A valid nonzero recipient address is required.');
  if (asset==='ETH') return {from,to,value:'0x'+units(amount,18).toString(16),chainId:BASE.chainId};
  if (asset!=='USDC') throw new Error('Only Base ETH and native USDC are supported.');
  return {from,to:USDC,value:'0x0',chainId:BASE.chainId,data:'0xa9059cbb'+to.slice(2).toLowerCase().padStart(64,'0')+units(amount,6).toString(16).padStart(64,'0')};
}

// EIP-6963 lets Rabby and MetaMask coexist. Extension identities are labels,
// never authority: every account and network is re-read from the selected provider.
export function discoverWallets(win, onChange) {
  const found=new Map();
  const add=event=>{
    const item=event.detail;
    if (!item?.provider?.request || typeof item.info?.uuid!=='string') return;
    found.set(item.info.uuid,{id:item.info.uuid,name:String(item.info.name||'Browser wallet'),rdns:String(item.info.rdns||''),provider:item.provider});
    onChange([...found.values()]);
  };
  win.addEventListener('eip6963:announceProvider',add);
  win.dispatchEvent(new Event('eip6963:requestProvider'));
  // Legacy extensions may not announce. Preserve all distinct providers.
  const legacy=win.ethereum?.providers || (win.ethereum ? [win.ethereum] : []);
  legacy.forEach((p,i)=>{if(p?.request && ![...found.values()].some(x=>x.provider===p)) found.set('legacy-'+i,{id:'legacy-'+i,name:p.isRabby?'Rabby':p.isMetaMask?'MetaMask':'Browser wallet',provider:p});});
  onChange([...found.values()]);
  return ()=>win.removeEventListener('eip6963:announceProvider',add);
}

export class WalletController {
  constructor(api,onChange=()=>{}) {this.api=api;this.onChange=onChange;this.provider=null;this.session=null;this.epoch=0;this.busy=false;this.error='';this.listeners=[];this.revoking=Promise.resolve();}
  emit(){this.onChange(this);}
  async restore(){this.session=await this.api('/api/wallet/session');this.emit();}
  bind(provider){
    this.listeners.forEach(([p,event,fn])=>p.removeListener?.(event,fn));this.listeners=[];this.provider=provider;
    for (const event of ['accountsChanged','chainChanged','disconnect']) {
      const fn=()=>{void this.invalidate('Wallet changed. Sign in again.');};
      provider.on?.(event,fn);this.listeners.push([provider,event,fn]);
    }
  }
  async invalidate(reason='') {
    this.epoch++;this.session=null;this.error=reason;this.emit();
    // Serialize revocation before any subsequent login to avoid revoking a new session.
    this.revoking=this.revoking.catch(()=>{}).then(()=>this.api('/api/wallet/logout',{}));
    await this.revoking;
  }
  async assertIdentity(address=this.session?.address) {
    if (!this.provider || !validAddress(address)) throw new Error('Connect and sign in with your wallet first.');
    const [accounts,chain]=await Promise.all([this.provider.request({method:'eth_accounts'}),this.provider.request({method:'eth_chainId'})]);
    if (accounts?.[0]?.toLowerCase()!==address.toLowerCase() || chain.toLowerCase()!==BASE.chainId) throw new Error('Wallet account or network changed. Sign in again on Base.');
    const server=await this.api('/api/wallet/session');
    if (!server.authenticated || server.address.toLowerCase()!==address.toLowerCase()) throw new Error('Wallet session expired. Sign in again.');
    return address;
  }
  async login(provider) {
    if(this.busy) throw new Error('A wallet request is already pending.');
    this.busy=true;this.error='';
    this.listeners.forEach(([p,event,fn])=>p.removeListener?.(event,fn));this.listeners=[];
    this.provider=provider;this.session=null;
    this.revoking=this.revoking.catch(()=>{}).then(()=>this.api('/api/wallet/logout',{}));
    const epoch=++this.epoch;this.emit();
    try {
      await this.revoking;
      const accounts=await provider.request({method:'eth_requestAccounts'}),address=accounts?.[0];
      if(!validAddress(address)) throw new Error('No wallet account selected.');
      const chain=await provider.request({method:'eth_chainId'});
      if(chain.toLowerCase()!==BASE.chainId) {
        try {await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:BASE.chainId}]});}
        catch(e){if(e.code!==4902) throw e;await provider.request({method:'wallet_addEthereumChain',params:[BASE]});await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:BASE.chainId}]});}
      }
      if((await provider.request({method:'eth_chainId'})).toLowerCase()!==BASE.chainId) throw new Error('Select Base in your wallet.');
      this.bind(provider);
      const c=await this.api('/api/wallet/challenge',{address});
      const signature=await provider.request({method:'personal_sign',params:[c.message,address]});
      if(epoch!==this.epoch) throw new Error('Wallet changed during sign-in.');
      const current=await provider.request({method:'eth_accounts'});
      if(current?.[0]?.toLowerCase()!==address.toLowerCase()) throw new Error('Wallet account changed during sign-in.');
      if((await provider.request({method:'eth_chainId'})).toLowerCase()!==BASE.chainId) throw new Error('Wallet network changed during sign-in.');
      const session=await this.api('/api/wallet/verify',{address,...c,signature});
      if(epoch!==this.epoch) {await this.invalidate();throw new Error('Wallet changed during sign-in.');}
      this.session=session;
    } catch(e){this.error=e.code===4001?'Wallet request declined.':e.message;throw new Error(this.error);}
    finally {this.busy=false;this.emit();}
  }
  async balances() {
    const epoch=this.epoch,address=await this.assertIdentity();
    const block=await this.provider.request({method:'eth_blockNumber'});
    const [eth,usdc]=await Promise.all([
      this.provider.request({method:'eth_getBalance',params:[address,block]}),
      this.provider.request({method:'eth_call',params:[{to:USDC,data:'0x70a08231'+address.slice(2).padStart(64,'0')},block]})
    ]);
    await this.assertIdentity(address);
    if(epoch!==this.epoch) throw new Error('Wallet changed while reading balances.');
    return {eth:formatUnits(eth,18),usdc:formatUnits(usdc,6),block,observedAt:Date.now()};
  }
}
