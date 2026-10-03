import {executedFootprint} from './order-flow-premium.mjs';

const intervals={"1m":60_000,"5m":300_000,"15m":900_000,"1h":3_600_000,"4h":14_400_000,"1d":86_400_000};
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function jsonResponse(fetchImpl,url,label){
  const response=await fetchImpl(url,{signal:AbortSignal.timeout(12_000),headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error(`${label} returned HTTP ${response.status}.`);
  const data=await response.json();
  return {response,data};
}

// Coinbase documents trade.side as the *maker* side. A sell maker was lifted
// by an aggressive buyer (ask volume); a buy maker was hit (bid volume).
export function buildCoinbaseFootprint(trades,{bar,tickSize,product,baseCurrency,pages,coveredBeforeStart}){
  if(!coveredBeforeStart)throw new Error('Coinbase trade pagination did not cover the full closed bar.');
  if(!finite(tickSize)||tickSize<=0||!finite(bar?.volume)||bar.volume<=0)throw new Error('Coinbase requires a verified price increment and positive candle volume.');
  const interval=intervals[bar.timeframe];
  if(!interval||!finite(bar.time))throw new Error('Unsupported Coinbase footprint bar interval.');
  const end=bar.time+interval,seen=new Set(),levels=new Map();
  for(const trade of trades){
    const time=Date.parse(trade.time),id=String(trade.trade_id);
    if(!Number.isFinite(time)||!id||id==='undefined')throw new Error('Coinbase trade identity or timestamp is missing.');
    if(time<bar.time||time>=end)continue;
    if(seen.has(id))throw new Error('Coinbase trade pagination repeated an execution.');
    seen.add(id);
    const price=Number(trade.price),size=Number(trade.size);
    if(!finite(price)||price<=0||!finite(size)||size<=0||!['buy','sell'].includes(trade.side))
      throw new Error('Coinbase trade price, size, or maker side is invalid.');
    const tick=Math.round(price/tickSize);
    if(Math.abs(price-tick*tickSize)>tickSize*1e-6)throw new Error('Coinbase trade price disagrees with product quote increment.');
    const cell=levels.get(tick)||{price:tick*tickSize,bidVolume:0,askVolume:0};
    if(trade.side==='sell')cell.askVolume+=size;
    else cell.bidVolume+=size;
    levels.set(tick,cell);
  }
  if(!levels.size)throw new Error('Coinbase returned no executions inside this completed bar.');
  const rows=[...levels.values()].sort((a,b)=>a.price-b.price);
  const footprints=executedFootprint([{time:bar.time,levels:rows}],{tickSize});
  const executedVolume=footprints[0].totalVolume;
  const difference=Math.abs(executedVolume-bar.volume);
  if(difference>Math.max(1e-7,bar.volume*1e-4))
    throw new Error(`Coinbase execution volume (${executedVolume.toPrecision(8)}) does not reconcile with its candle (${bar.volume.toPrecision(8)}).`);
  return {authority:'executed_trades',sideConvention:'aggressor_at_bid_ask',complete:true,
    source:'Coinbase Exchange public trades',product,unit:baseCurrency,tickSize,
    usage:'local personal or internal research only',terms:'https://www.coinbase.com/legal/market_data',
    bars:[{time:bar.time,levels:rows}],footprints,
    coverage:{from:bar.time,to:end,pages,trades:seen.size,executedVolume,candleVolume:bar.volume,difference}};
}

export async function fetchCoinbaseFootprint(product,bar,{fetchImpl=fetch,maxPages=25,pauseMs=120}={}){
  if(!/^[A-Z0-9]+-[A-Z0-9]+$/.test(product))throw new Error('Coinbase footprint needs an exact Exchange product ID.');
  if(!Number.isInteger(maxPages)||maxPages<1||maxPages>50)throw new Error('Coinbase pagination limit must be 1–50 pages.');
  const interval=intervals[bar?.timeframe];
  if(!interval||!finite(bar.time)||!finite(bar.volume)||bar.volume<=0)throw new Error('A completed Coinbase OHLCV bar is required.');
  if(bar.time+interval>Date.now())throw new Error('Coinbase Footprint only uses a completed candle.');
  const base=`https://api.exchange.coinbase.com/products/${encodeURIComponent(product)}`;
  const metadata=(await jsonResponse(fetchImpl,base,'Coinbase product metadata')).data;
  const tickSize=Number(metadata?.quote_increment);
  if(metadata?.id!==product||metadata?.status!=='online'||!metadata?.base_currency||!finite(tickSize)||tickSize<=0)
    throw new Error('Coinbase product identity, status, or price increment could not be verified.');
  const trades=[],seenCursors=new Set();let after='',coveredBeforeStart=false,pages=0;
  for(;pages<maxPages;pages++){
    const url=new URL(`${base}/trades`);url.searchParams.set('limit','1000');
    if(after)url.searchParams.set('after',after);
    const {response,data}=await jsonResponse(fetchImpl,url.toString(),'Coinbase trades');
    if(!Array.isArray(data)||!data.length)throw new Error('Coinbase returned an empty trade page before coverage was proven.');
    let previous=Infinity;
    for(const trade of data){
      const stamp=Date.parse(trade?.time);
      if(!Number.isFinite(stamp)||stamp>previous)throw new Error('Coinbase trade page was not in newest-first order.');
      previous=stamp;
    }
    trades.push(...data);
    if(previous<bar.time){coveredBeforeStart=true;pages++;break;}
    const cursor=response.headers?.get?.('CB-AFTER')||String(data.at(-1).trade_id||'');
    if(!cursor||seenCursors.has(cursor))throw new Error('Coinbase trade pagination cursor did not advance.');
    seenCursors.add(cursor);after=cursor;
    if(pauseMs&&pages+1<maxPages)await delay(pauseMs);
  }
  return buildCoinbaseFootprint(trades,{bar,tickSize,product,baseCurrency:metadata.base_currency,pages,coveredBeforeStart});
}
