// Local read-only data provider. Never talks to IBKR or an order endpoint directly.
export const IBKR_INTERVALS={'1':'1m','1m':'1m','3':'3m','3m':'3m','5':'5m','5m':'5m','15':'15m','15m':'15m','30':'30m','30m':'30m','60':'1h','1h':'1h','240':'4h','4h':'4h'};
export const isIBKR=s=>typeof s==='string'&&s.toLowerCase().startsWith('ibkr:');
export function ibkrLabel(status){
  if(!status)return 'IBKR · unavailable · READ ONLY';
  const mode=status.mode==='DEMO_DATA'?'DEMO DATA · IBKR simulator':'IBKR · '+(status.mode||'UNKNOWN');
  const state=!status.connected?status.phase:status.quote?.stale?'STALE QUOTE':status.history_stale?'STALE BARS':'connected';
  return mode+' · '+state+' · READ ONLY';
}
export function normalizeIBKRBars(rows){
  if(!Array.isArray(rows))throw Error('Invalid IBKR bar response');
  const bars=new Map();
  for(const row of rows){
    const b=Object.fromEntries(['time','open','high','low','close','volume'].map(k=>[k,Number(row[k])]));
    if(!Object.values(b).every(Number.isFinite)||!Number.isInteger(b.time)||b.time<1e12||b.time>1e14||Math.min(b.open,b.high,b.low,b.close)<=0||b.volume<0||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close))throw Error('Invalid IBKR OHLCV bar');
    bars.set(b.time,b);
  }
  return [...bars.values()].sort((a,b)=>a.time-b.time);
}
export class IBKRProvider{
  constructor({fetcher=(...args)=>globalThis.fetch(...args),onStatus=()=>{},schedule=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id),pollMs=1000}={}){Object.assign(this,{fetcher,onStatus,schedule,cancel,pollMs});}
  info(){return {name:'ibkr',displayName:'IBKR · read-only',supportedTimeframes:['1','3','5','15','30','60','240'],capabilities:{enumerate:true,stream:true,symbolInfo:true}};}
  async request(path,signal){
    const r=await this.fetcher('/api/ibkr/'+path,{signal});const data=await r.json();
    if(!r.ok)throw Error(data.error||'IBKR data unavailable');
    if(!data.read_only||data.orders_enabled)throw Error('Invalid IBKR read-only data contract');
    this.lastStatus=data;this.onStatus(data);return data;
  }
  async listSymbols(){
    const status=await this.request('status');
    return status.instrument?[{ticker:status.instrument.slice(5),description:(status.mode==='DEMO_DATA'?'DEMO DATA · ':'')+'Micro E-mini Dow · '+status.instrument.slice(-6)+' · read-only',type:'futures'}]:[];
  }
  async getSymbolInfo(ticker){
    const status=await this.request('status'),c=status.contract;
    if(!c||status.instrument!=='ibkr:'+ticker)throw Error('IBKR contract is not resolved');
    return {ticker,tickerid:'IBKR:'+ticker,prefix:'IBKR',description:(c.synthetic?'DEMO DATA · ':'')+'MYM '+c.expiry+' · '+c.exchange,type:'futures',currency:c.currency,basecurrency:'USD',mintick:c.tick,pricescale:Math.round(1/c.tick),pointvalue:c.multiplier,timezone:'America/Chicago'};
  }
  async read(ticker,timeframe,range={},signal){
    const tf=IBKR_INTERVALS[timeframe];if(!tf)throw Error('IBKR: select an intraday interval from 1m to 4h. Daily bars are not available in this release.');
    const query=new URLSearchParams({instrument:'ibkr:'+ticker,timeframe:tf,limit:String(Math.min(600,Math.max(1,range.limit??600)))});
    if(range.from!==undefined)query.set('from',range.from);if(range.to!==undefined)query.set('to',range.to);
    const data=await this.request('bars?'+query,signal);
    if(data.instrument!=='ibkr:'+ticker||data.timeframe!==tf)throw Error('IBKR contract or interval mismatch');
    return {...data,bars:normalizeIBKRBars(data.bars)};
  }
  async getBars(ticker,timeframe,range={}){return (await this.read(ticker,timeframe,range)).bars;}
  subscribe(ticker,timeframe,onBar){
    let stopped=false,timer,last=0;const controller=new AbortController();
    const poll=async()=>{
      try{
        const data=await this.read(ticker,timeframe,{limit:600},controller.signal);
        if(!stopped&&data.connected&&!data.history_stale){
          for(const bar of data.bars)if(bar.time>=last){last=bar.time;onBar(bar);}
        }
      }catch(e){if(!stopped)this.onStatus({...this.lastStatus,configured_mode:this.lastStatus?.configured_mode||'unknown',mode:this.lastStatus?.mode||'UNKNOWN',connected:false,history_stale:true,quote:null,phase:'unavailable',message:e.message,instrument:'ibkr:'+ticker,read_only:true,orders_enabled:false});}
      finally{if(!stopped)timer=this.schedule(poll,this.pollMs);}
    };
    poll();return ()=>{stopped=true;controller.abort();if(timer!==undefined)this.cancel(timer);};
  }
}
