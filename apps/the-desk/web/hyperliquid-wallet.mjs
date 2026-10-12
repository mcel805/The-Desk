import {ExchangeClient,HttpTransport} from '@nktkas/hyperliquid';
import {createWalletClient,custom} from 'viem';
import {base} from 'viem/chains';

export function limitOrder({coin,side,price,quantity,reduceOnly=false,cloid},meta) {
  const asset=meta?.universe?.findIndex(x=>x.name===coin);
  if(asset===undefined || asset<0 || !['buy','sell'].includes(side)) throw new Error('Select a supported market and side.');
  const item=meta.universe[asset];
  for(const [label,v] of [['Price',price],['Quantity',quantity]]) if(typeof v!=='string' || !/^\d+(\.\d+)?$/.test(v) || !(Number(v)>0) || !Number.isFinite(Number(v))) throw new Error(`${label} must be a positive decimal.`);
  const decimals=v=>(v.split('.')[1]||'').replace(/0+$/,'').length;
  if(decimals(quantity)>item.szDecimals) throw new Error(`Quantity allows ${item.szDecimals} decimals.`);
  const significant=price.replace('.','').replace(/^0+/,'').replace(/0+$/,'').length;
  if(decimals(price)>Math.max(0,6-item.szDecimals) || (decimals(price)>0 && significant>5)) throw new Error('Price does not match Hyperliquid tick precision.');
  if(!/^0x[0-9a-f]{32}$/i.test(cloid)) throw new Error('Order identifier is invalid.');
  return {a:asset,b:side==='buy',p:price,s:quantity,r:!!reduceOnly,t:{limit:{tif:'Gtc'}},c:cloid};
}
export function exchangeFor(provider,address,testnet=true,transport) {
  const wallet=createWalletClient({account:address,chain:base,transport:custom(provider)});
  return new ExchangeClient({wallet,transport:transport||new HttpTransport({isTestnet:testnet,timeout:15000})});
}
export function orderResult(response) {
  if(response?.status!=='ok') throw new Error(typeof response?.response==='string'?response.response:'Exchange did not accept this request.');
  const statuses=response.response?.data?.statuses;
  if(!Array.isArray(statuses) || statuses.length!==1) throw new Error('Unknown exchange response. Reconcile orders before retrying.');
  const value=statuses[0];
  if(value.error) throw new Error(value.error);
  if(value.resting) return {state:'resting',oid:value.resting.oid};
  if(value.filled) return {state:'filled',oid:value.filled.oid,size:value.filled.totalSz,price:value.filled.avgPx};
  throw new Error('Unknown order status. Reconcile orders before retrying.');
}
