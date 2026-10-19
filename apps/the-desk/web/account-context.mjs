export const brokerBase='/api/robinhood/workspace';
export const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function brokerAPI(path,payload){
 const r=await fetch(brokerBase+path,{method:payload===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:payload===undefined?{}:{'Content-Type':'application/json'},body:payload===undefined?undefined:JSON.stringify(payload)});
 const data=await r.json();if(!r.ok)throw Error(data.error||'Robinhood unavailable');return data;
}
export function brokerMoney(v){if(v===null||v===undefined||v===''||!Number.isFinite(Number(v)))return 'Unavailable';return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v));}
export function portfolioMetrics(source){
 const p=source?.data||source?.payload||{};
 return {balance:p.cash,equity:p.total_value,unrealized:null,buyingPower:p.buying_power?.buying_power,cryptoBuyingPower:p.crypto_buying_power?.buying_power};
}
export function isVerified(status,now=Date.now()/1000){return status?.connected===true&&Number.isFinite(status.observedAt)&&now-status.observedAt>=0&&now-status.observedAt<60;}
export function accountOptions(paper,selected,status,wallet){
 const esc=escapeHTML,valid=isVerified(status);
 let html='<optgroup label="Paper accounts">'+paper.map(a=>`<option value="${esc(a.id)}">Paper · ${esc(a.name)} · SIM</option>`).join('')+'</optgroup>';
 html+='<optgroup label="Robinhood">'+(status.accounts?.length?status.accounts.map(a=>`<option value="rh:${esc(a.id)}">${valid?'●':'○'} Robinhood · ${esc(a.name)} ${esc(a.account)} · ${valid?(a.tradable?'connected':'connected · read only'):'unverified'}</option>`).join(''):'<option value="connect:robinhood">○ Robinhood · connect account…</option>')+'</optgroup>';
 html+='<optgroup label="Wallet / exchanges"><option value="connect:wallet">'+(wallet?.authenticated?'● Wallet · '+esc(wallet.address?.slice(0,6)+'…'+wallet.address?.slice(-4))+' · identity verified':'○ Wallet · connect…')+'</option><option disabled>Hyperliquid · public data / wallet setup</option><option disabled>Binance · account not configured</option><option disabled>Coinbase · public data / account not configured</option></optgroup><optgroup label="Brokerages"><option disabled>Interactive Brokers · coming soon</option></optgroup>';
 return html;
}
// Exact, explicitly displayed reference mapping. A perpetual chart is never a
// Robinhood perpetual or an instruction to route a derivative order.
export function feedChoices(asset,hlCoins,coinbaseProducts){
 if(!asset)return [];
 if(asset.kind==='equity')return [{instrument:'robinhood:'+asset.symbol,label:'Robinhood · equity · regular session'}];
 const base=asset.symbol.replace(/-USD$/,'');const choices=[];
 if(hlCoins.has(base))choices.push({instrument:'hyperliquid:'+base,label:'Hyperliquid perpetual · reference only; Robinhood spot ticket'});
 if(coinbaseProducts.has(asset.symbol))choices.push({instrument:'coinbase:'+asset.symbol,label:'Coinbase spot · reference only; Robinhood spot ticket'});
 if(!choices.length)choices.push({instrument:'robinhood:'+asset.symbol,label:'Robinhood quotes · historical chart unavailable'});
 return choices;
}
export function assetMatchesChart(asset,instrument){
 if(!asset)return false;
 if(asset.kind==='equity')return instrument==='robinhood:'+asset.symbol;
 return instrument==='coinbase:'+asset.symbol||instrument==='hyperliquid:'+asset.symbol.replace(/-USD$/,'')||instrument==='robinhood:'+asset.symbol;
}
export class RobinhoodProvider{
 constructor(account){this.account=account;}
 info(){return {name:'robinhood',displayName:'Robinhood',requiresApiKey:false,supportedTimeframes:['1','3','5','15','30','60','240','D'],capabilities:{enumerate:false,stream:true,symbolInfo:true}};}
 async getSymbolInfo(ticker){return {ticker,tickerid:'ROBINHOOD:'+ticker,prefix:'ROBINHOOD',description:ticker+' · Robinhood',type:ticker.endsWith('-USD')?'crypto':'stock',currency:'USD',mintick:.01,pricescale:100,timezone:'America/New_York',session:ticker.endsWith('-USD')?'24x7':'0930-1600'};}
 async getBars(ticker,timeframe,range={}){
  if(ticker.endsWith('-USD'))return [];
  if(!this.account())return [];
  const q=new URLSearchParams({accountId:this.account(),symbol:ticker,timeframe,limit:range.limit||600});
  for(const k of ['from','to'])if(range[k]!=null)q.set(k,range[k]);
  return (await brokerAPI('/markets/bars?'+q)).bars;
 }
 subscribe(ticker,tf,emit){let ended=false,timer;const poll=async()=>{try{const bars=await this.getBars(ticker,tf,{limit:2});if(!ended)bars.forEach(emit);}catch{}if(!ended)timer=setTimeout(poll,15000);};timer=setTimeout(poll,15000);return ()=>{ended=true;clearTimeout(timer);};}
}
