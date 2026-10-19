// A provider can fail soft with [] during a temporary history outage. Keep the
// original request identity and bounds while giving that empty read two retries.
export async function requiredSecondaryHistory(fetchSeries,symbol,timeframe,range,{delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)),stopped=()=>false}={}){
 for(let attempt=0;attempt<3;attempt++){
  if(stopped())throw Error('Secondary history request cancelled.');
  const bars=await fetchSeries?.(symbol,timeframe,range)||[];
  if(bars.length)return bars;
  if(attempt<2)await delay(attempt===0?300:900);
 }
 throw Error('Required secondary data unavailable: '+symbol+' '+timeframe+' — no candles returned after 3 attempts. Reload chart to retry.');
}
