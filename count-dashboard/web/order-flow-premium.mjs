// Count Desk order-flow research primitives. OHLCV estimates and executed-price
// levels are separate inputs; neither path manufactures aggressor volume.
const finite = value => typeof value === 'number' && Number.isFinite(value);
const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function checkedBars(bars) {
  if (!Array.isArray(bars) || !bars.length) throw new Error('No closed bars are available.');
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    if (![bar.time,bar.open,bar.high,bar.low,bar.close].every(finite) ||
        bar.high < bar.low || bar.open < bar.low || bar.open > bar.high ||
        bar.close < bar.low || bar.close > bar.high ||
        (i && bar.time <= bars[i-1].time)) throw new Error('Bars need ordered timestamps and valid OHLC prices.');
    if (bar.volume != null && (!finite(bar.volume) || bar.volume < 0)) throw new Error('Bar volume must be finite and nonnegative.');
  }
  return bars;
}

function valueArea(rows, fraction) {
  if (!finite(fraction) || fraction < .5 || fraction > .95) throw new Error('Value area must be 50–95%.');
  const total=rows.reduce((sum,row)=>sum+row.volume,0);
  if (!(total>0)) return {poc:null,val:null,vah:null,captured:0};
  const poc=rows.reduce((best,row,index)=>row.volume>rows[best].volume?index:best,0);
  let left=poc,right=poc,captured=rows[poc].volume;
  while (captured < total*fraction-1e-10 && (left>0 || right<rows.length-1)) {
    const below=left>0?rows[left-1].volume:-1,above=right<rows.length-1?rows[right+1].volume:-1;
    if (above>below) captured+=rows[++right].volume;
    else captured+=rows[--left].volume;
  }
  return {poc:rows[poc].price,val:rows[left].low,vah:rows[right].high,captured};
}

export function selectProfileWindow(bars,{window='rolling',lookback=160}={}) {
  checkedBars(bars);
  if (window==='rolling') return bars.slice(-Math.max(1,Math.floor(lookback)));
  if (window==='session') {
    const key=new Date(bars.at(-1).time).toISOString().slice(0,10);
    return bars.filter(bar=>new Date(bar.time).toISOString().slice(0,10)===key);
  }
  throw new Error('Profile window must be rolling or UTC day session.');
}

export function candleVolumeProfile(bars,{rows=32,valueAreaFraction=.7}={}) {
  checkedBars(bars);
  if (!Number.isInteger(rows) || rows<8 || rows>128) throw new Error('Profile rows must be 8–128.');
  const known=bars.filter(bar=>bar.volume!=null),missing=bars.length-known.length;
  const total=known.reduce((sum,bar)=>sum+bar.volume,0);
  if (!(total>0)) return {status:'unavailable',reason:'No positive reported candle volume.',rows:[],totalVolume:total,missingVolumeBars:missing,method:'OHLCV range estimate'};
  const low=Math.min(...known.map(bar=>bar.low)),high=Math.max(...known.map(bar=>bar.high));
  const step=(high-low)/rows || Math.max(Math.abs(low)*1e-9,1e-9);
  const result=Array.from({length:rows},(_,index)=>({low:low+index*step,high:low+(index+1)*step,price:low+(index+.5)*step,volume:0}));
  for (const bar of known) {
    if (!bar.volume) continue;
    if (bar.high===bar.low) {
      result[Math.max(0,Math.min(rows-1,Math.floor((bar.close-low)/step)))].volume+=bar.volume;
      continue;
    }
    let allocations=[],weight=0;
    for (let index=0;index<rows;index++) {
      const overlap=Math.max(0,Math.min(bar.high,result[index].high)-Math.max(bar.low,result[index].low));
      if (overlap>0) {allocations.push([index,overlap]);weight+=overlap;}
    }
    if (!weight) throw new Error('Bar range did not intersect any profile row.');
    for (const [index,overlap] of allocations) result[index].volume+=bar.volume*overlap/weight;
  }
  const allocated=result.reduce((sum,row)=>sum+row.volume,0);
  if (Math.abs(allocated-total)>Math.max(1e-7,total*1e-10)) throw new Error('Profile volume conservation failed.');
  return {status:missing?'partial':'ready',reason:missing?`${missing} bars lack reported volume.`:'',rows:result,
    ...valueArea(result,valueAreaFraction),totalVolume:total,allocatedVolume:allocated,missingVolumeBars:missing,
    firstBar:bars[0].time,lastBar:bars.at(-1).time,method:'OHLCV bar volume allocated by price-range overlap; estimated, not traded volume at price'};
}

function utcAnchor(time,anchor) {
  const date=new Date(time);
  if (anchor==='day') return Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate());
  if (anchor==='week') return Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()-(date.getUTCDay()+6)%7);
  if (anchor==='month') return Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),1);
  throw new Error('VWAP anchor must be day, week, or month.');
}

export function candleVWAP(bars,{anchor='day',source='hlc3',multipliers=[1,2]}={}) {
  checkedBars(bars);
  if (!['hlc3','ohlc4','close'].includes(source)) throw new Error('Unsupported VWAP price source.');
  if (!Array.isArray(multipliers) || multipliers.some(n=>!finite(n)||n<=0||n>10)) throw new Error('VWAP bands need positive multipliers no greater than 10.');
  let current=null,sumV=0,sumPV=0,sumP2V=0,missing=0;
  const points=bars.map(bar=>{
    const key=utcAnchor(bar.time,anchor);
    if(key!==current){current=key;sumV=0;sumPV=0;sumP2V=0;}
    if(bar.volume==null) {
      missing++;
      return {time:bar.time,vwap:null,bands:[],anchorStart:key};
    }
    else if(bar.volume>0){
      const price=source==='hlc3'?(bar.high+bar.low+bar.close)/3:source==='ohlc4'?(bar.open+bar.high+bar.low+bar.close)/4:bar.close;
      sumV+=bar.volume;sumPV+=price*bar.volume;sumP2V+=price*price*bar.volume;
    }
    if(!sumV)return {time:bar.time,vwap:null,bands:[],anchorStart:key};
    const vwap=sumPV/sumV,sigma=Math.sqrt(Math.max(0,sumP2V/sumV-vwap*vwap));
    return {time:bar.time,vwap,sigma,bands:multipliers.map(multiplier=>({multiplier,upper:vwap+multiplier*sigma,lower:vwap-multiplier*sigma})),anchorStart:key};
  });
  return {status:points.some(point=>point.vwap!=null)?(missing?'partial':'ready'):'unavailable',points,missingVolumeBars:missing,
    method:`Candle ${source.toUpperCase()} × reported volume / reported volume; UTC ${anchor} anchor; volume-weighted population deviation`};
}

export function candleTPO(bars,{blockMinutes=30,rows=24,valueAreaFraction=.7}={}) {
  checkedBars(bars);
  if (!Number.isInteger(blockMinutes)||blockMinutes<1||blockMinutes>1440||!Number.isInteger(rows)||rows<8||rows>64) throw new Error('Invalid TPO block or row count.');
  const blockMs=blockMinutes*60_000,session=utcAnchor(bars.at(-1).time,'day');
  const sample=bars.filter(bar=>utcAnchor(bar.time,'day')===session);
  if (sample.length<2) return {status:'unavailable',reason:'A TPO needs at least two closed bars in the UTC session.',rows:[],blocks:[]};
  const spacing=Math.min(...sample.slice(1).map((bar,index)=>bar.time-sample[index].time));
  if (spacing>blockMs) return {status:'unavailable',reason:'Chart bars are wider than the TPO block. Use a shorter chart timeframe.',rows:[],blocks:[]};
  const low=Math.min(...sample.map(bar=>bar.low)),high=Math.max(...sample.map(bar=>bar.high)),step=(high-low)/rows;
  if(!(step>0))return {status:'unavailable',reason:'No session price range.',rows:[],blocks:[]};
  const periods=new Map();
  for(const bar of sample){const time=session+Math.floor((bar.time-session)/blockMs)*blockMs;const block=periods.get(time)||{time,low:bar.low,high:bar.high};block.low=Math.min(block.low,bar.low);block.high=Math.max(block.high,bar.high);periods.set(time,block);}
  const blocks=[...periods.values()].sort((a,b)=>a.time-b.time).map((block,index)=>({...block,letter:letters[index%letters.length],index}));
  const output=Array.from({length:rows},(_,index)=>({low:low+index*step,high:low+(index+1)*step,price:low+(index+.5)*step,volume:0,letters:[]}));
  for(const block of blocks)for(const row of output)if(block.high>=row.low&&block.low<row.high || block.high===high&&row.high===high&&block.low<=high){row.letters.push(block.letter);row.volume++;}
  const area=valueArea(output,valueAreaFraction);
  return {status:'ready',rows:output,blocks,sessionStart:session,firstBar:sample[0].time,lastBar:sample.at(-1).time,...area,
    method:`OHLC price-range presence in ${blockMinutes}-minute UTC blocks; TPO counts time blocks, not traded volume`};
}

// levels must come from an approved, documented execution-price feed. Each cell
// carries nonnegative aggressor-at-bid and aggressor-at-ask volume in source units.
export function executedFootprint(bars,{tickSize}={}) {
  if(!finite(tickSize)||tickSize<=0)throw new Error('Verified positive tick size is required.');
  if(!Array.isArray(bars)||!bars.length)throw new Error('No executed price levels are available.');
  return bars.map(bar=>{
    if(!finite(bar.time)||!Array.isArray(bar.levels)||!bar.levels.length)throw new Error('Each footprint bar needs a time and price levels.');
    const byTick=new Map();
    for(const level of bar.levels){
      if(![level.price,level.bidVolume,level.askVolume].every(finite)||level.bidVolume<0||level.askVolume<0)throw new Error('Footprint level needs observed bid and ask volume.');
      const tick=Math.round(level.price/tickSize);
      if(Math.abs(level.price-tick*tickSize)>tickSize*1e-6)throw new Error('Footprint price does not match tick size.');
      const row=byTick.get(tick)||{price:tick*tickSize,bidVolume:0,askVolume:0};
      row.bidVolume+=level.bidVolume;row.askVolume+=level.askVolume;byTick.set(tick,row);
    }
    const levels=[...byTick.values()].sort((a,b)=>a.price-b.price).map(row=>({...row,volume:row.bidVolume+row.askVolume,delta:row.askVolume-row.bidVolume}));
    return {time:bar.time,levels,totalVolume:levels.reduce((sum,row)=>sum+row.volume,0),delta:levels.reduce((sum,row)=>sum+row.delta,0)};
  });
}

export function executedBubbles(footprints,{minimum=0,hideBelowFraction=.5,maxVisible=100}={}) {
  if(!Array.isArray(footprints))throw new Error('Verified footprints are required for bubbles.');
  const all=footprints.flatMap(bar=>bar.levels.map(row=>({time:bar.time,...row}))).filter(row=>row.volume>0);
  const largest=Math.max(0,...all.map(row=>row.volume));
  return all.filter(row=>row.volume>=minimum&&row.volume>=largest*hideBelowFraction).sort((a,b)=>b.volume-a.volume).slice(0,Math.min(500,Math.max(1,maxVisible)));
}
