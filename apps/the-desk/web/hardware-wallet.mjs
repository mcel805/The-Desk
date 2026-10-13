/** EIP-1193 identity/balance adapter for the Desk's local USB connector. */
import {BASE,validAddress} from './wallet-model.mjs';
export class HardwareProvider {
  constructor(api){this.api=api;this.kind='ledger-usb';this.supportsVenueSigning=false;this.address=null;this.listeners=new Map();}
  on(event,listener){if(!this.listeners.has(event))this.listeners.set(event,new Set());this.listeners.get(event).add(listener);}
  removeListener(event,listener){this.listeners.get(event)?.delete(listener);}
  emit(event,value){this.listeners.get(event)?.forEach(fn=>fn(value));}
  setAccount(address){if(!validAddress(address))throw new Error('Invalid device account.');this.address=address;}
  async selected(){
    try {
      const value=await this.api('/api/wallet/hardware/selected',{});
      if(!validAddress(value.address)||this.address&&value.address.toLowerCase()!==this.address.toLowerCase())throw new Error('Hardware account changed.');
      this.address=value.address;return [value.address];
    } catch(error){this.address=null;this.emit('disconnect',{code:4900,message:error.message});throw Object.assign(error,{code:4900});}
  }
  async request({method,params=[]}) {
    if(method==='eth_chainId')return BASE.chainId;
    if(method==='wallet_switchEthereumChain'&&params?.[0]?.chainId?.toLowerCase()===BASE.chainId)return null;
    if(method==='eth_requestAccounts'||method==='eth_accounts')return this.selected();
    if(method==='personal_sign') {
      const [message,address]=params;
      if(!this.address||address?.toLowerCase()!==this.address.toLowerCase()||typeof message!=='string')throw new Error('Reconnect your selected hardware account.');
      const nonce=message.match(/\nNonce: ([a-f0-9]{32})\n/)?.[1];
      if(!nonce)throw new Error('A Base Desk login challenge is required.');
      return (await this.api('/api/wallet/hardware/sign-login',{nonce,message})).signature;
    }
    if(['eth_blockNumber','eth_getBalance','eth_call'].includes(method))return (await this.api('/api/wallet/hardware/rpc',{method,params})).result;
    throw Object.assign(new Error('This USB connector supports Base sign-in and balance reads. Hardware order and transfer signing is unavailable.'),{code:4200});
  }
  async disconnect(){await this.api('/api/wallet/hardware/disconnect',{});this.address=null;this.emit('disconnect',{code:4900,message:'Hardware wallet disconnected.'});}
}
