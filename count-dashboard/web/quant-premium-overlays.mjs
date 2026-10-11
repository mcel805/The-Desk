import {liquidityConvergenceGroups} from './liquidity-convergence.js';
import {advanceSmartFibSwing,confirmedAlternatingSwings,smartFibSwingAtTime} from './smart-fib-engine.mjs';

const intervalMs={"1m":60_000,"2m":120_000,"3m":180_000,"5m":300_000,"15m":900_000,"30m":1_800_000,"1h":3_600_000,"2h":7_200_000,"4h":14_400_000,"1d":86_400_000,"1w":604_800_000};
export const quantPremiumItems={
  'wave-court':{name:'Wave Court',kind:'indicator',image:'elliott-wave-color.png',description:'Seven-frame sourced Elliott candidates with three confirmed chart degrees. Hard impulse rules gate labels; missing higher counts stay unresolved. Independent Quant Lab method, not Pine parity.'},
  'liquidity-force':{name:'Liquidity Force',kind:'indicator',image:'liquidity-color.png',description:'Raw or converged chart / 30m / 1h Liquidity levels with up to three matched Liquid Gravity ranks per side and an optional selectable-timeframe cluster volume profile. Gravity is relative, not probability.'},
  liquidity:{name:'Liquidity',kind:'indicator',image:'liquidity-color.png',description:'Confirmed swing-price levels with 30m / 1h context and descriptive convergence.'},
  'volume-profile':{name:'Volume Profile',kind:'indicator',image:'volume-profile-color.png',description:'Reported candle volume allocated across price rows. POC and 70% value area are range estimates.'},
  tpo:{name:'TPO',kind:'indicator',image:'volume-profile-color.png',description:'UTC session letters show which price rows each completed time block touched. No volume claim.'},
  vwap:{name:'VWAP',kind:'indicator',image:'volume-profile-color.png',description:'UTC day anchored HLC3 × reported candle volume, with a volume weighted deviation band.'},
  footprint:{name:'Footprint',kind:'indicator',image:'volume-profile-color.png',description:'Executed bid and ask volume at price on the latest complete Coinbase Exchange bar. Maker side is inverted to aggressor.',requiresExecutionFeed:true},
  'volume-bubbles':{name:'Volume Bubbles',kind:'indicator',image:'volume-profile-color.png',description:'Executed size clusters on the latest complete Coinbase Exchange bar. Availability requires full trade pagination and volume reconciliation.',requiresExecutionFeed:true},
  'ttp-volume-analyst':{name:'TTP RelativeVolume',kind:'indicator',image:'volume-profile-color.png',description:'Lower indicator pane with relative-volume columns, same-time average, and optional colored bars or price symbols. Loads supplemental public history. Descriptive only.'},
  'liquid-gravity':{name:'Liquid Gravity',kind:'indicator',image:'liquidity-color.png',description:'Ranks OHLC-inferred liquidity pools by structure, distance, freshness, trend, and regime. Relative attraction score; not an order-book feed or probability.'},
  'smart-fib':{name:'Smart Fib',kind:'tool',image:'fibonacci-color.png',description:'Hover a confirmed 1h swing to preview retracements; lock it to track the latest extreme.'},
  'smart-ote':{name:'Smart Money Fibonacci OTE',kind:'indicator',image:'fibonacci-color.png',description:'Confirmed structure shifts, colored retracement levels, and a directional OTE zone. Descriptive only.'},
};

export function completedBars(bars,timeframe,asOf=Date.now()) {
  const duration=intervalMs[String(timeframe).toLowerCase()];
  if(!duration)throw new Error(`Unsupported chart interval: ${timeframe}`);
  return bars.filter(bar=>Number.isFinite(bar.time)&&bar.time+duration<=asOf);
}

function meanTrueRange(bars){
  const recent=bars.slice(-14);
  return recent.reduce((sum,bar,index)=>{
    const prior=index?recent[index-1].close:bar.close;
    return sum+Math.max(bar.high-bar.low,Math.abs(bar.high-prior),Math.abs(bar.low-prior));
  },0)/Math.max(1,recent.length);
}

export function confirmedLiquidityLevels(bars,timeframe,{externalPivot=14,internalPivot=5}={}) {
  const duration=intervalMs[String(timeframe).toLowerCase()];
  if(!duration)throw new Error(`Unsupported liquidity interval: ${timeframe}`);
  const atr=meanTrueRange(bars),levels=[];
  for(const [kind,width] of [['EXT',externalPivot],['INT',internalPivot]]) {
    for(let index=width;index<bars.length-width;index++) {
      for(const side of ['HIGH','LOW']) {
        const price=side==='HIGH'?bars[index].high:bars[index].low;
        let pivot=true;
        for(let i=index-width;i<=index+width;i++) if(i!==index && (side==='HIGH'?bars[i].high>=price:bars[i].low<=price)){pivot=false;break;}
        if(!pivot)continue;
        const confirmationIndex=index+width;
        let breakIndex=-1;
        for(let i=confirmationIndex+1;i<bars.length;i++) if(side==='HIGH'?bars[i].close>price:bars[i].close<price){breakIndex=i;break;}
        levels.push({kind,side,price,index,time:bars[index].time,confirmationIndex,
          confirmedTime:bars[confirmationIndex].time+duration,breakIndex,atr,timeframe:String(timeframe).toUpperCase(),bars});
      }
    }
  }
  return levels;
}

function addLine(add,start,end,price,color,style='solid',width=1) {
  if(![start,end,price].every(Number.isFinite)||end<=start)return 0;
  add('trendline',{paneId:'price',anchors:[{time:start,price},{time:end,price}],style:{lineColor:color,lineWidth:width,lineStyle:style}});
  return 1;
}

export function renderLiquidityOverlay(series,chartTimeframe,chartBars,add) {
  const chartEnd=chartBars.at(-1)?.time;
  if(!Number.isFinite(chartEnd))throw new Error('No completed chart bars for Liquidity.');
  const aligned=series.map(item=>({timeframe:item.timeframe,bars:completedBars(item.bars,item.timeframe,chartEnd+(intervalMs[chartTimeframe]||0))}))
    .filter(item=>item.bars.length>=29);
  if(!aligned.some(item=>['30M','1H'].includes(String(item.timeframe).toUpperCase())))
    throw new Error('Liquidity needs completed 30m or 1h source bars.');
  const levels=aligned.flatMap(item=>confirmedLiquidityLevels(item.bars,item.timeframe));
  const selected=[];
  for(const timeframe of new Set(levels.map(level=>level.timeframe)))for(const side of ['HIGH','LOW']){
    const scoped=levels.filter(level=>level.timeframe===timeframe&&level.side===side);
    selected.push(...scoped.filter(level=>level.kind==='EXT'&&level.breakIndex<0).slice(-3));
    selected.push(...scoped.filter(level=>level.kind==='EXT'&&level.breakIndex>=0).slice(-2));
    const internal=scoped.filter(level=>level.kind==='INT').at(-1);if(internal)selected.push(internal);
  }
  const groups=liquidityConvergenceGroups(selected,String(chartTimeframe).toUpperCase(),{convergenceAtr:.1,showLocalConvergences:true},chartEnd)
    .filter(group=>group.joinTime<chartEnd&&group.members.some(level=>['30M','1H',String(chartTimeframe).toUpperCase()].includes(level.timeframe)))
    .sort((a,b)=>a.anchor.price-b.anchor.price);
  const represented=new Set(groups.flatMap(group=>group.members));
  let count=0;
  for(const level of selected){
    if(!['30M','1H',String(chartTimeframe).toUpperCase()].includes(level.timeframe)||represented.has(level))continue;
    const broken=level.breakIndex>=0;
    const end=broken?level.bars[level.breakIndex].time+intervalMs[level.timeframe.toLowerCase()]:chartEnd;
    const color=broken?'#b4b4b4':level.kind==='INT'?(level.side==='HIGH'?'#ff9800':'#00d5e8'):(level.side==='HIGH'?'#f23645':'#089981');
    count+=addLine(add,level.confirmedTime,Math.min(end,chartEnd),level.price,color,broken?'dashed':level.kind==='INT'?'dotted':'solid',level.timeframe==='1H'||level.timeframe==='30M'?2:1);
  }
  groups.forEach((group,index)=>{
    const color=group.contested?'#d8ae84':'#d8c5f0';
    for(const level of group.members){
      if(!['30M','1H',String(chartTimeframe).toUpperCase()].includes(level.timeframe)||level.confirmedTime>=group.joinTime)continue;
      const memberColor=level.kind==='INT'?(level.side==='HIGH'?'#ff9800':'#00d5e8'):(level.side==='HIGH'?'#f23645':'#089981');
      count+=addLine(add,level.confirmedTime,group.joinTime,level.price,memberColor,level.kind==='INT'?'dotted':'solid');
    }
    count+=addLine(add,group.joinTime,chartEnd,group.anchor.price,color,'solid',3);
    add('text',{paneId:'price',anchors:[{time:chartEnd,price:group.anchor.price}],text:{value:`C${index+1}${group.contested?'!':''}`,color,size:'small',hAlign:'right',vAlign:group.anchor.side==='HIGH'?'top':'bottom'},style:{lineColor:'transparent',lineWidth:0,lineStyle:'solid'}});count++;
  });
  return {count,groups:groups.length,cutoff:chartEnd,method:'liquidity-map-v1 v1.0.0'};
}

export function createSmartFibOverlay(chart,bars,draw) {
  const swings=confirmedAlternatingSwings(bars,2);
  let locked=null,current=null;
  const paint=swing=>{
    draw.clear();current=swing;
    if(!swing)return;
    const last=bars.at(-1),start=swing.from.time,end=Math.max(last.time,swing.to.time);
    const upper=Math.max(swing.from.price,swing.to.price),lower=Math.min(swing.from.price,swing.to.price);
    const range=upper-lower,up=swing.from.side==='LOW';
    if(!(range>0)||end<=start)return;
    draw.add('box',{paneId:'price',anchors:[{time:start,price:upper},{time:end,price:lower}],style:{lineColor:'#c9a5ff55',lineWidth:1,lineStyle:'solid',fillColor:'#a879e51c'}});
    for(const [a,b,color] of [[.5,.618,'#8e72b833'],[.618,.786,'#57b6a522']]){
      const pa=up?swing.to.price-range*a:swing.to.price+range*a,pb=up?swing.to.price-range*b:swing.to.price+range*b;
      draw.add('box',{paneId:'price',anchors:[{time:start,price:Math.max(pa,pb)},{time:end,price:Math.min(pa,pb)}],style:{lineColor:color,lineWidth:1,lineStyle:'solid',fillColor:color}});
    }
    for(const [ratio,color] of [[.382,'#5fb5ff'],[.5,'#be91ff'],[.618,'#54dea0'],[.786,'#f2d35e']]){
      const price=up?swing.to.price-range*ratio:swing.to.price+range*ratio;
      addLine(draw.add,start,end,price,color,'solid',2);
      draw.add('text',{paneId:'price',anchors:[{time:end,price}],text:{value:`${(ratio*100).toFixed(1)}%`,color,size:'tiny',hAlign:'right',vAlign:'top'},style:{lineColor:color,lineWidth:1,lineStyle:'solid'}});
    }
  };
  const off=chart.renderer.onCrosshairMove(event=>{
    if(locked||event.paneKind==='study'||event.time==null||!Number.isFinite(Number(event.time)))return;
    const next=smartFibSwingAtTime(swings,event.time);
    if(next?.fromIndex===current?.fromIndex&&next?.toIndex===current?.toIndex)return;
    paint(next);
  });
  return {get locked(){return Boolean(locked);},get swing(){return current;},get swingCount(){return Math.max(0,swings.length-1);},
    lock(){if(!current)return false;locked=current;paint(advanceSmartFibSwing(locked,bars.at(-1)));return true;},
    unlock(){locked=null;paint(null);},clearPreview(){if(!locked)paint(null);},destroy(){off?.();draw.clear();}};
}
