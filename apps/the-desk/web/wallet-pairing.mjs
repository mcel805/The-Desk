/** Extension-free mobile pairing. No project ID, no relay connection. */
export class WalletPairing {
  constructor({load,projectId,origin,onURI=()=>{}}){Object.assign(this,{load,projectId,origin,onURI});this.provider=null;this.generation=0;this.cancelPending=null;}
  async init(){
    if(!/^[a-f0-9]{32}$/i.test(this.projectId||''))throw new Error('Mobile pairing needs this app’s WalletConnect project ID. Ledger USB and installed wallets remain available.');
    const {EthereumProvider}=await this.load();
    return EthereumProvider.init({projectId:this.projectId,metadata:{name:'The Desk',description:'Connect your wallet to The Desk on Base',url:this.origin,icons:[]},showQrModal:false,optionalChains:[8453],optionalMethods:['personal_sign','eth_signTypedData_v4','wallet_switchEthereumChain'],optionalEvents:['accountsChanged','chainChanged'],rpcMap:{8453:'https://mainnet.base.org'}});
  }
  async connect(){
    const generation=++this.generation;
    const cancelled=new Promise((_,reject)=>{this.cancelPending=()=>reject(Object.assign(new Error('Pairing cancelled.'),{code:4001}));});
    let provider,listener;
    const work=(async()=>{
      provider=await this.init();
      if(generation!==this.generation){await provider.disconnect().catch(()=>{});throw new Error('Pairing cancelled.');}
      listener=uri=>{if(generation===this.generation)this.onURI(uri);};provider.on('display_uri',listener);
      if(!provider.session)await provider.connect();
      if(generation!==this.generation){await provider.disconnect().catch(()=>{});throw new Error('Pairing cancelled.');}
      provider.kind='walletconnect';this.provider=provider;return provider;
    })();
    try{return await Promise.race([work,cancelled]);}
    finally{if(generation===this.generation)this.cancelPending=null;if(provider&&listener)provider.removeListener('display_uri',listener);}
  }
  async restore(){const provider=await this.init();if(!provider.session)return null;provider.kind='walletconnect';this.provider=provider;return provider;}
  async disconnect(){this.generation++;this.cancelPending?.();this.cancelPending=null;const provider=this.provider;this.provider=null;if(provider)await provider.disconnect();}
}
