import {selectProfileWindow,candleVolumeProfile,candleTPO,candleVWAP,executedBubbles} from './order-flow-premium.mjs';

const style=(color,width=1)=>({lineColor:color,lineWidth:width,lineStyle:'solid'});
function line(add,start,end,price,color,width=1){
  if(end>start&&Number.isFinite(price))add('trendline',{paneId:'price',anchors:[{time:start,price},{time:end,price}],style:style(color,width)});
}

// Drawings deliberately consume the same calculation reports as Chart Workspace.
// Candle volume at price remains an OHLCV range estimate, never an execution footprint.
export function renderQuantOrderFlow(id,bars,timeframe,add){
  if(!Array.isArray(bars)||bars.length<2)throw new Error('At least two completed chart bars are required.');
  const last=bars.at(-1).time;
  if(id==='volume-profile'){
    const sample=selectProfileWindow(bars,{window:'rolling',lookback:160});
    const report=candleVolumeProfile(sample,{rows:32});
    if(report.status==='unavailable')throw new Error(report.reason);
    const start=sample[0].time,end=sample.at(-1).time;
    if(!(end>start))throw new Error('Volume Profile needs two completed bars in its window.');
    const width=Math.min((end-start)*.24,(end-sample.at(-2).time)*16);
    const peak=Math.max(...report.rows.map(row=>row.volume));
    let count=0;
    for(const row of report.rows){
      if(row.volume<=0)continue;
      const color=row.price===report.poc?'#f4c966':'#5aa9b5';
      add('box',{paneId:'price',anchors:[{time:end-width*row.volume/peak,price:row.high},{time:end,price:row.low}],style:{lineColor:'transparent',lineWidth:0,lineStyle:'solid',fillColor:`${color}55`}});count++;
    }
    line(add,start,end,report.poc,'#f4c966',2);
    line(add,start,end,report.val,'#a8c9d0');line(add,start,end,report.vah,'#a8c9d0');
    return {status:`${report.status} · ${sample.length} rolling bars · ${report.totalVolume.toLocaleString()} reported volume units · ${report.missingVolumeBars} missing-volume bars · OHLCV range estimate`,count,cutoff:end};
  }
  if(id==='tpo'){
    const minutes=({'1m':30,'5m':30,'15m':30,'30m':30,'1h':60,'4h':240})[timeframe];
    if(!minutes)throw new Error('TPO needs intraday chart bars.');
    const report=candleTPO(bars,{blockMinutes:minutes,rows:24});
    if(report.status!=='ready')throw new Error(report.reason);
    // Quant Lab's multi-chart layouts are too narrow for one text label per row.
    // Encode the number of touched time blocks as width; Chart Workspace retains letters.
    const width=Math.min((report.lastBar-report.firstBar)*.24,minutes*60_000*4);
    const peak=Math.max(...report.rows.map(row=>row.volume));
    let count=0;
    for(const row of report.rows){
      if(!row.volume)continue;
      add('box',{paneId:'price',anchors:[{time:report.firstBar,price:row.high},{time:report.firstBar+width*row.volume/peak,price:row.low}],style:{lineColor:'transparent',lineWidth:0,lineStyle:'solid',fillColor:row.price===report.poc?'#f4c96677':'#aa8fea55'}});count++;
    }
    line(add,report.firstBar,report.lastBar,report.poc,'#f4c966',2);
    line(add,report.firstBar,report.lastBar,report.val,'#8ab6ca');line(add,report.firstBar,report.lastBar,report.vah,'#8ab6ca');
    return {status:`UTC day · ${report.blocks.length} ${minutes}m time blocks · ${count} price rows · TPO count by width · OHLC range presence, no volume claim`,count,cutoff:report.lastBar};
  }
  if(id==='vwap'){
    const report=candleVWAP(bars,{anchor:'day',source:'hlc3',multipliers:[1]});
    if(report.status==='unavailable')throw new Error('VWAP needs positive reported candle volume.');
    const points=report.points.slice(-120);let count=0;
    for(let index=1;index<points.length;index++){
      const a=points[index-1],b=points[index];
      if(a.vwap==null||b.vwap==null||a.anchorStart!==b.anchorStart)continue;
      for(const [p,q,color] of [[a.vwap,b.vwap,'#e8c969'],[a.bands[0].upper,b.bands[0].upper,'#7aa9d1'],[a.bands[0].lower,b.bands[0].lower,'#7aa9d1']]){
        add('trendline',{paneId:'price',anchors:[{time:a.time,price:p},{time:b.time,price:q}],style:style(color)});count++;
      }
    }
    if(!count)throw new Error('VWAP needs two consecutive completed bars with reported volume in one UTC day.');
    return {status:`${report.status} · UTC day HLC3 VWAP ±1σ · ${report.missingVolumeBars} missing-volume bars · reported candle volume`,count,cutoff:last};
  }
  throw new Error('This study needs an approved side aware execution feed.');
}

export function renderQuantExecutedOrderFlow(id,payload,add){
  if(payload?.authority!=='executed_trades'||payload?.sideConvention!=='aggressor_at_bid_ask'||payload?.complete!==true||
     !payload?.source||!payload?.unit||!Number.isFinite(payload.tickSize)||!payload?.footprints?.length)
    throw new Error('A complete, side aware execution footprint is required.');
  const bar=payload.footprints.at(-1),duration=payload.coverage?.to-payload.coverage?.from;
  if(!(duration>0)||bar.time!==payload.coverage.from)throw new Error('Execution coverage does not match the chart bar.');
  const low=bar.levels[0]?.price,high=bar.levels.at(-1)?.price;
  if(!Number.isFinite(low)||!Number.isFinite(high))throw new Error('No executed price levels are available.');
  const bucketTicks=Math.max(1,Math.ceil((Math.round((high-low)/payload.tickSize)+1)/24));
  const grouped=new Map();
  for(const level of bar.levels){
    const tick=Math.round(level.price/payload.tickSize),key=Math.floor(tick/bucketTicks);
    const row=grouped.get(key)||{price:(key*bucketTicks+(bucketTicks-1)/2)*payload.tickSize,bidVolume:0,askVolume:0,volume:0,delta:0};
    row.bidVolume+=level.bidVolume;row.askVolume+=level.askVolume;row.volume+=level.volume;row.delta+=level.delta;grouped.set(key,row);
  }
  const rows=[...grouped.values()].sort((a,b)=>a.price-b.price);
  const allocated=rows.reduce((sum,row)=>sum+row.volume,0);
  if(Math.abs(allocated-bar.totalVolume)>Math.max(1e-7,bar.totalVolume*1e-10))throw new Error('Display bucketing lost executed volume.');
  const center=bar.time+duration*.5;
  if(id==='footprint'){
    const peak=Math.max(...rows.flatMap(row=>[row.bidVolume,row.askVolume]));let count=0;
    for(const row of rows){
      const half=bucketTicks*payload.tickSize*.5;
      for(const [volume,start,end,color] of [
        [row.bidVolume,center-duration*.38*row.bidVolume/peak,center,'#dc667477'],
        [row.askVolume,center,center+duration*.38*row.askVolume/peak,'#43b89c77'],
      ]){
        if(!volume)continue;
        add('box',{paneId:'price',anchors:[{time:start,price:row.price+half},{time:end,price:row.price-half}],style:{lineColor:'transparent',lineWidth:0,lineStyle:'solid',fillColor:color}});count++;
      }
    }
    return {count,cutoff:bar.time,rows:bar.levels,status:`${rows.length} chart price buckets (${bucketTicks} ticks each); ladder shows exact ticks · bid ${bar.levels.reduce((n,r)=>n+r.bidVolume,0).toPrecision(7)} / ask ${bar.levels.reduce((n,r)=>n+r.askVolume,0).toPrecision(7)} ${payload.unit} · ${payload.coverage.trades} executions · ${payload.source} · maker side inverted to aggressor · candle volume reconciled`};
  }
  if(id==='volume-bubbles'){
    const clusters=executedBubbles([{time:bar.time,levels:rows}],{hideBelowFraction:.5,maxVisible:24});
    const largest=Math.max(...clusters.map(row=>row.volume),0);
    for(const row of clusters){
      const radius=duration*(.035+.16*Math.sqrt(row.volume/largest));
      const color=row.delta>=0?'#43b89c':'#dc6674';
      add('circle',{paneId:'price',anchors:[{time:center-radius,price:row.price},{time:center+radius,price:row.price}],style:{lineColor:color,lineWidth:1,lineStyle:'solid',fillColor:`${color}66`}});
    }
    return {count:clusters.length,cutoff:bar.time,clusters,status:`${clusters.length} executed-price clusters · ${bucketTicks} ticks per bucket · ${payload.coverage.trades} executions · ${payload.unit} · ${payload.source} · candle volume reconciled`};
  }
  throw new Error('Unknown execution study.');
}
