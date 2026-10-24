// Two-minute public histories use the same server aggregation as Spider evidence.
// All existing native symbol metadata and live streams remain delegated.
import {canonicalFrame} from './spider-model.mjs';
export class SpiderIntervalProvider {
 constructor(delegate,prefix){this.delegate=delegate;this.prefix=prefix;this.serverHistory=false;}
 info(){const info=this.delegate.info();return {...info,supportedTimeframes:[...new Set([...(info.supportedTimeframes||[]),'2'])]};}
 listSymbols(...args){return this.delegate.listSymbols(...args);}
 searchSymbols(...args){return this.delegate.searchSymbols?.(...args)||this.delegate.listSymbols(...args);}
 getSymbolInfo(...args){return this.delegate.getSymbolInfo(...args);}
 async getBars(symbol,tf,range={}){
  if(!this.serverHistory&&String(tf)!=='2'&&tf!=='2m')return this.delegate.getBars(symbol,tf,range);
  const bars=await this.read(symbol,range,canonicalFrame(tf));
  // Existing Pine studies and panning can request history older than the server's
  // bounded recent window. Preserve the original adapter for that SAME source.
  if(canonicalFrame(tf)!=='2m'&&(!bars.length||(range.from!==undefined&&bars[0].time>range.from)))return this.delegate.getBars(symbol,tf==='1D'?'D':tf,range);
  return bars;
 }

 async read(symbol,range={},tf='2m'){const q=new URLSearchParams({instrument:this.prefix+':'+symbol,timeframe:tf,limit:String(Math.min(600,range.limit||600))});const r=await fetch('/api/spider/bars?'+q);const d=await r.json();if(!r.ok)throw Error(d.error||'Two-minute history unavailable');return d.bars.filter(b=>(range.from===undefined||b.time>=range.from)&&(range.to===undefined||b.time<=range.to));}
 subscribe(symbol,tf,listener){
  if(!this.serverHistory&&String(tf)!=='2'&&tf!=='2m')return this.delegate.subscribe(symbol,tf,listener);
  let stopped=false,timer,last=0;const poll=async()=>{try{const bars=await this.read(symbol,{},canonicalFrame(tf));if(!stopped)for(const b of bars)if(b.time>=last){listener(b);last=b.time;}}catch{}finally{if(!stopped)timer=setTimeout(poll,5000);}};void poll();return ()=>{stopped=true;clearTimeout(timer);};
 }
}

export class BinanceProvider {
 info(){return {name:'binance',displayName:'Binance · spot USDT reference',supportedTimeframes:['1','2','3','5','15','30','60','240','D'],capabilities:{enumerate:true,stream:true,symbolInfo:true}};}
 async listSymbols(){return ['BTCUSDT','ETHUSDT','SOLUSDT'].map(ticker=>({ticker,description:ticker+' · Binance spot USDT reference',type:'crypto'}));}
 async getSymbolInfo(symbol){const r=await fetch('/api/spider/symbol?'+new URLSearchParams({instrument:'binance:'+symbol})),s=await r.json();if(!r.ok)throw Error(s.error||'Binance metadata unavailable');return {ticker:symbol,tickerid:'BINANCE:'+symbol,prefix:'BINANCE',description:symbol+' · Binance spot USDT reference',type:'crypto',currency:s.quoteCurrency,basecurrency:s.baseCurrency,mintick:s.tick,pricescale:Math.round(1/s.tick),timezone:'Etc/UTC',session:'24x7'};}
 async getBars(symbol,tf,range={}){const q=new URLSearchParams({instrument:'binance:'+symbol,timeframe:canonicalFrame(tf),limit:String(Math.min(600,range.limit||600))}),r=await fetch('/api/spider/bars?'+q),d=await r.json();if(!r.ok)throw Error(d.error||'Binance data unavailable');return d.bars.filter(b=>(range.from===undefined||b.time>=range.from)&&(range.to===undefined||b.time<=range.to));}
 subscribe(symbol,tf,listener){let done=false,timer,last=0;const poll=async()=>{try{const bars=await this.getBars(symbol,tf,{limit:4});if(!done)for(const b of bars)if(b.time>=last){listener(b);last=b.time;}}catch{}finally{if(!done)timer=setTimeout(poll,5000);}};void poll();return ()=>{done=true;clearTimeout(timer);};}
}
