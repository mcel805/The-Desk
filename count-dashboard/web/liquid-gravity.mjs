// Market Gravity [YinYangAlgorithms] Pine v6 calculation port for Count Desk.
// Source: https://www.tradingview.com/script/BYdeirvp-Market-Gravity-YinYangAlgorithms/
// Copyright (c) YinYangAlgorithms. Licensed under Mozilla Public License 2.0.
// This is a JavaScript translation of the published source model, not its Pine
// runtime. Drawings are rendered by Quant Lab's chart adapter.

const SECONDS={"1m":60,"2m":120,"3m":180,"5m":300,"15m":900,"30m":1800,"1h":3600,"2h":7200,"4h":14400,"1d":86400,"1w":604800};
const DEFAULTS={pivotLeft:5,pivotRight:5,clusterATR:.15,sweepBufferATR:.05,maxAgeBars:1500,maxStoredLevels:40,maxTargetDistanceATR:12,useSwingLiquidity:true,useEqualHighLow:true,useMajorSwings:true,usePreviousDay:true,usePreviousWeek:true,useRepeatedRejections:true,equalToleranceATR:.15,majorSwingATR:2.5,rejectionMinSeparationBars:8,rejectionWickRatio:.3,recentPivotMemory:30,independentTouchMinSeparationBars:8,clusterZonePaddingATR:.02,isolatedZoneHalfATR:.05,maxZoneWidthATR:.5,atrLength:14,fastEMALength:21,slowEMALength:55,volumeLength:50,approachingATR:.75,accessibilityKATR:2,swingFreshnessHalfLifeBars:150,clusterFreshnessHalfLifeBars:250,previousDayFreshnessHalfLifeBars:300,previousWeekFreshnessHalfLifeBars:500,activeLiquidityStrengthThreshold:40,rejectionWindowBars:2,acceptanceCloseCount:2,lifecycleEventDisplayBars:3,projectionBars:35,displayLevels:3,lineHistoryBars:500,showGlow:true,showTable:true,textSizePercent:150,showLifecycleEvents:true,labelCollisionMode:'Auto',labelCollisionThresholdATR:.6,rankMarkerSpacingBars:18,lifecycleLabelGapBars:18};
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
const addSources=(old,names)=>[...old,...names.filter(name=>!old.includes(name))];

function rma(values,length){
  const out=Array(values.length).fill(NaN);let seed=[];let value=NaN;
  for(let i=0;i<values.length;i++){
    const x=values[i];if(!Number.isFinite(x))continue;
    if(!Number.isFinite(value)){seed.push(x);if(seed.length===length){value=mean(seed);out[i]=value;}}
    else {value=(value*(length-1)+x)/length;out[i]=value;}
  }
  return out;
}
function ema(values,length){let value=NaN;const a=2/(length+1);return values.map((x,i)=>{value=i===0||!Number.isFinite(value)?x:x*a+value*(1-a);return value;});}
function indicators(bars,cfg){
  const tr=[],plus=[],minus=[];
  for(let i=0;i<bars.length;i++){
    const b=bars[i],p=bars[i-1];tr.push(Math.max(b.high-b.low,Math.abs(b.high-(p?.close??b.close)),Math.abs(b.low-(p?.close??b.close))));
    if(!p){plus.push(0);minus.push(0);continue;}
    const up=b.high-p.high,down=p.low-b.low;plus.push(up>down&&up>0?up:0);minus.push(down>up&&down>0?down:0);
  }
  const atr=rma(tr,cfg.atrLength),pdm=rma(plus,14),mdm=rma(minus,14),tr14=rma(tr,14),dx=bars.map((_,i)=>{const p=tr14[i]?100*pdm[i]/tr14[i]:0,m=tr14[i]?100*mdm[i]/tr14[i]:0;return p+m?100*Math.abs(p-m)/(p+m):0;});
  const adx=rma(dx.map((v,i)=>Number.isFinite(tr14[i])?v:NaN),14),fast=ema(bars.map(x=>x.close),cfg.fastEMALength),slow=ema(bars.map(x=>x.close),cfg.slowEMALength),volAvg=bars.map((_,i)=>mean(bars.slice(Math.max(0,i-cfg.volumeLength+1),i+1).map(x=>Number(x.volume)||0))),atrAvg=bars.map((_,i)=>{const recent=atr.slice(Math.max(0,i-49),i+1);return recent.length===50&&recent.every(Number.isFinite)?mean(recent):NaN;});
  return {atr,adx,fast,slow,volAvg,atrAvg};
}
function poolZone(pool,atr,cfg){
  let lo,hi;if(pool.memberCount<=1){lo=pool.price-atr*cfg.isolatedZoneHalfATR;hi=pool.price+atr*cfg.isolatedZoneHalfATR;}else{lo=pool.memberMin-atr*cfg.clusterZonePaddingATR;hi=pool.memberMax+atr*cfg.clusterZonePaddingATR;}
  const maxWidth=atr*cfg.maxZoneWidthATR;if(maxWidth>0&&hi-lo>maxWidth){const mid=(hi+lo)/2;lo=mid-maxWidth/2;hi=mid+maxWidth/2;}return [lo,hi];
}
function makePool(side,m,barIndex,activeIndex,atr,cfg){
  const p={side,price:m.price,originIndex:barIndex,activeIndex,strength:m.strength,volume:m.volume,sources:m.sources,zoneLow:0,zoneHigh:0,memberMin:m.price,memberMax:m.price,memberCount:1,totalWeight:m.weight,lastTouchIndex:m.countsAsTouch?m.touchIndex:barIndex,poolATR:atr,maxSwingProminence:Number.isFinite(m.swing)?m.swing:0,swingEvidenceCount:Number.isFinite(m.swing)?1:0,volumeEvidenceSum:Number.isFinite(m.structuralVolume)?m.structuralVolume:0,volumeEvidenceCount:Number.isFinite(m.structuralVolume)?1:0,touches:1,lifecycleTouchIndex:-1,state:'Forming',sweepIndex:-1,beyondCloseCount:0,resolutionIndex:-1};
  [p.zoneLow,p.zoneHigh]=poolZone(p,atr,cfg);return p;
}
function addPool(pools,side,m,index,activeIndex,atr,cfg){
  const tolerance=atr*cfg.clusterATR;let target=null,best=Infinity;
  for(const p of pools){if(p.side!==side||!['Forming','Active','Approaching'].includes(p.state))continue;const d=Math.abs(p.price-m.price);if(d<=tolerance&&d<best){best=d;target=p;}}
  if(!target){pools.push(makePool(side,m,index,activeIndex,atr,cfg));}
  else{
    const w=Math.max(m.weight,.01),safeAtr=atr||target.poolATR||0,total=target.totalWeight+w;
    target.price=(target.price*target.totalWeight+m.price*w)/total;target.strength=(target.strength*target.totalWeight+m.strength*w)/total;target.volume=(target.volume*target.totalWeight+m.volume*w)/total;target.poolATR=(target.poolATR*target.totalWeight+safeAtr*w)/total;
    target.originIndex=Math.min(target.originIndex,index);target.activeIndex=Math.min(target.activeIndex,activeIndex);target.memberMin=Math.min(target.memberMin,m.price);target.memberMax=Math.max(target.memberMax,m.price);target.memberCount++;
    if(m.countsAsTouch&&Math.abs(m.touchIndex-target.lastTouchIndex)>=cfg.independentTouchMinSeparationBars){target.touches++;target.lastTouchIndex=m.touchIndex;}
    target.sources=addSources(target.sources,m.sources);if(Number.isFinite(m.swing)){target.maxSwingProminence=Math.max(target.maxSwingProminence,m.swing);target.swingEvidenceCount++;}if(Number.isFinite(m.structuralVolume)){target.volumeEvidenceSum+=m.structuralVolume;target.volumeEvidenceCount++;}
    target.totalWeight=total;[target.zoneLow,target.zoneHigh]=poolZone(target,target.poolATR,cfg);
  }
  while(pools.length>cfg.maxStoredLevels){let oldest=0;for(let i=1;i<pools.length;i++)if(pools[i].activeIndex<pools[oldest].activeIndex)oldest=i;pools.splice(oldest,1);}
}
function contains(pool,name){return pool.sources.includes(name);}
function strength(pool){
  const density=pool.memberCount<=0?0:clamp(.2+.8*(1-Math.exp(-.7*Math.max(pool.memberCount-1,0))));
  const prominence=pool.swingEvidenceCount?clamp(pool.maxSwingProminence):0;
  const touch=pool.touches<=0?0:clamp(.2+.8*(1-Math.exp(-.8*Math.max(pool.touches-1,0))));
  const timeframe=pool.sources.some(x=>x.startsWith('Previous Week'))?1:pool.sources.some(x=>x.startsWith('Previous Day'))?.7:.35;
  const volume=pool.volumeEvidenceCount?clamp(pool.volumeEvidenceSum/pool.volumeEvidenceCount):0;
  return 100*(density*.3+prominence*.25+touch*.2+timeframe*.15+volume*.1);
}
function distanceATR(pool,close,atr){if(!(atr>0))return 0;return close<pool.zoneLow?(pool.zoneLow-close)/atr:close>pool.zoneHigh?(close-pool.zoneHigh)/atr:0;}
function freshness(pool,index,cfg){
  const hasCluster=pool.memberCount>=2||pool.touches>=2||pool.sources.some(x=>['Equal High','Equal Low','Repeated Rejection'].includes(x));
  const base=pool.sources.some(x=>x.startsWith('Previous Week'))?cfg.previousWeekFreshnessHalfLifeBars:pool.sources.some(x=>x.startsWith('Previous Day'))?cfg.previousDayFreshnessHalfLifeBars:hasCluster?cfg.clusterFreshnessHalfLifeBars:cfg.swingFreshnessHalfLifeBars;
  const halfLife=Math.max(1,base*(.75+.75*strength(pool)/100)),age=Math.max(index-pool.activeIndex,0);return Math.exp(-.6931471805599453*age/halfLife);
}
function trendScale(seconds){if(seconds<=300)return 2;if(seconds<900)return 2+.5*Math.log(seconds/300)/Math.log(3);if(seconds<=14400)return 2.5;if(seconds<86400)return 2.5-1.5*Math.log(seconds/14400)/Math.log(6);return 1;}
function gravity(pool,index,bar,atr,trend,regime,seconds,cfg){
  const distance=distanceATR(pool,bar.close,atr),accessibility=1/(1+(distance/cfg.accessibilityKATR)**2),dm=.55+.45*accessibility,fm=.7+.3*freshness(pool,index,cfg),direction=pool.side==='upper'?1:-1;
  const trendMod=clamp(1+.1*trendScale(seconds)*direction*trend,.75,1.25);
  const rangeStructure=pool.sources.some(x=>['Equal High','Equal Low','Repeated Rejection'].includes(x));
  const raw=regime==='Trend Expansion'?1+.1*direction*trend:regime==='Trend'?1+.05*direction*trend:regime==='Range'?(rangeStructure?1.05:1):regime==='Compression'?.92:1;
  const regimeMod=clamp(1+(clamp(raw,.9,1.1)-1)*2,.8,1.2),score=clamp(strength(pool)*dm*fm*trendMod*regimeMod,0,100);
  return {distanceATR:distance,freshness:freshness(pool,index,cfg),liquidityStrength:strength(pool),gravity:score};
}
function processLifecycle(pools,index,bar,atr,cfg){
  for(const p of pools){
    if(index-p.activeIndex>cfg.maxAgeBars){p.state='Retired';p.resolutionIndex=index;continue;}
    const d=distanceATR(p,bar.close,atr),touched=p.side==='upper'?bar.high>=p.zoneLow:bar.low<=p.zoneHigh;
    const swept=p.side==='upper'?bar.high>=p.zoneHigh+atr*cfg.sweepBufferATR:bar.low<=p.zoneLow-atr*cfg.sweepBufferATR;
    const closeBeyond=p.side==='upper'?bar.close>p.zoneHigh:bar.close<p.zoneLow;
    const closeOriginal=p.side==='upper'?bar.close<p.zoneLow:bar.close>p.zoneHigh;
    if(['Forming','Active','Approaching'].includes(p.state)){
      if(swept&&index>=p.activeIndex){p.sweepIndex=index;p.beyondCloseCount=closeBeyond?1:0;if(p.beyondCloseCount>=cfg.acceptanceCloseCount){p.state='Accepted';p.resolutionIndex=index;}else p.state='Sweeping';}
      else {p.state=strength(p)<cfg.activeLiquidityStrengthThreshold?'Forming':d<=cfg.approachingATR?'Approaching':'Active';if(touched&&index>p.activeIndex&&!swept&&(p.lifecycleTouchIndex<0||index-p.lifecycleTouchIndex>=cfg.independentTouchMinSeparationBars)){p.lifecycleTouchIndex=index;p.touches++;}}
    }else if(p.state==='Sweeping'){
      const since=index-p.sweepIndex;p.beyondCloseCount=closeBeyond?p.beyondCloseCount+1:0;
      if(p.beyondCloseCount>=cfg.acceptanceCloseCount){p.state='Accepted';p.resolutionIndex=index;}
      else if(since<=cfg.rejectionWindowBars&&closeOriginal){p.state='Rejected';p.resolutionIndex=index;}
      else if(since>cfg.rejectionWindowBars){p.state='Retired';p.resolutionIndex=index;}
    }else if(['Rejected','Accepted'].includes(p.state)&&p.resolutionIndex>=0&&index-p.resolutionIndex>=cfg.lifecycleEventDisplayBars){p.state='Retired';p.resolutionIndex=index;}
  }
}
function regimeAt(i,bars,ind){const adx=ind.adx[i],atr=ind.atr[i],avg=ind.atrAvg[i];return adx>=25&&atr>avg*1.05?'Trend Expansion':adx>=25?'Trend':atr<avg*.85?'Compression':'Range';}
function getDayKey(time){return new Date(time*1000).toISOString().slice(0,10);}
function getWeekKey(time){const d=new Date(time*1000),weekday=(d.getUTCDay()+6)%7;return Math.floor((Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())/1000-weekday*86400)/604800);}

export function buildLiquidGravity(inputBars,timeframe,{asOf=Date.now()/1000,maxAgeBars=DEFAULTS.maxAgeBars,maxTargetDistanceATR=DEFAULTS.maxTargetDistanceATR,settings={}}={}){
  const tf=String(timeframe).toLowerCase(),duration=SECONDS[tf];if(!duration)throw new Error(`Unsupported Liquid Gravity interval: ${timeframe}`);
  const cfg={...DEFAULTS,...settings,maxAgeBars,maxTargetDistanceATR};
  const bars=inputBars.filter(b=>Number.isFinite(b.time)&&b.time+duration<=asOf&&[b.open,b.high,b.low,b.close].every(Number.isFinite)).map(b=>({...b,volume:Number(b.volume)||0}));
  if(bars.length<Math.max(24,cfg.pivotLeft+cfg.pivotRight+2))throw new Error('Liquid Gravity needs at least 24 completed bars.');
  const ind=indicators(bars,cfg),pools=[],recent={upper:[],lower:[]};let currentDay=null,currentWeek=null,day={high:-Infinity,low:Infinity},week={high:-Infinity,low:Infinity},prevDay=null,prevWeek=null;
  for(let i=0;i<bars.length;i++){
    const bar=bars[i],dayKey=getDayKey(bar.time),weekKey=getWeekKey(bar.time),atr=ind.atr[i]||0;
    if(currentDay!==null&&dayKey!==currentDay){prevDay={...day};day={high:-Infinity,low:Infinity};if(cfg.usePreviousDay&&duration<=86400&&atr>0){addPool(pools,'upper',{price:prevDay.high,strength:.5,volume:.5,swing:NaN,structuralVolume:NaN,sources:['Previous Day High'],weight:1.15,countsAsTouch:false,touchIndex:i},i,i,atr,cfg);addPool(pools,'lower',{price:prevDay.low,strength:.5,volume:.5,swing:NaN,structuralVolume:NaN,sources:['Previous Day Low'],weight:1.15,countsAsTouch:false,touchIndex:i},i,i,atr,cfg);}}
    if(currentWeek!==null&&weekKey!==currentWeek){prevWeek={...week};week={high:-Infinity,low:Infinity};if(cfg.usePreviousWeek&&duration<=604800&&atr>0){addPool(pools,'upper',{price:prevWeek.high,strength:.5,volume:.5,swing:NaN,structuralVolume:NaN,sources:['Previous Week High'],weight:1.15,countsAsTouch:false,touchIndex:i},i,i,atr,cfg);addPool(pools,'lower',{price:prevWeek.low,strength:.5,volume:.5,swing:NaN,structuralVolume:NaN,sources:['Previous Week Low'],weight:1.15,countsAsTouch:false,touchIndex:i},i,i,atr,cfg);}}
    currentDay=dayKey;currentWeek=weekKey;day.high=Math.max(day.high,bar.high);day.low=Math.min(day.low,bar.low);week.high=Math.max(week.high,bar.high);week.low=Math.min(week.low,bar.low);
    const pivotIndex=i-cfg.pivotRight;
    if(pivotIndex>=cfg.pivotLeft&&atr>0){
      for(const side of ['upper','lower']){
        const pbar=bars[pivotIndex],price=side==='upper'?pbar.high:pbar.low,window=bars.slice(pivotIndex-cfg.pivotLeft,pivotIndex+cfg.pivotRight+1);
        const pivot=side==='upper'?window.every((x,j)=>j===cfg.pivotLeft||x.high<price):window.every((x,j)=>j===cfg.pivotLeft||x.low>price);if(!pivot)continue;
        const reference=side==='upper'?Math.min(...window.map(x=>x.low)):Math.max(...window.map(x=>x.high)),raw=(side==='upper'?price-reference:reference-price)/atr,swing=clamp(raw/4),pv=Number(pbar.volume)||0,pva=ind.volAvg[pivotIndex],sv=Number.isFinite(pva)&&pva>0?clamp((pv/pva)/2):NaN;
        const previous=recent[side],eq=previous.filter(x=>Math.abs(pivotIndex-x.index)>=Math.max(1,cfg.pivotRight)&&Math.abs(price-x.price)<=atr*cfg.equalToleranceATR).length,rejections=previous.filter(x=>Math.abs(pivotIndex-x.index)>=cfg.rejectionMinSeparationBars&&Math.abs(price-x.price)<=atr*cfg.equalToleranceATR).length;
        const range=pbar.high-pbar.low,wick=side==='upper'?pbar.high-Math.max(pbar.open,pbar.close):Math.min(pbar.open,pbar.close)-pbar.low,wickRatio=range>0?wick/range:0;
        const major=raw>=cfg.majorSwingATR,isEqual=eq>0,isReject=rejections>0&&wickRatio>=cfg.rejectionWickRatio,sources=[];
        if(cfg.useSwingLiquidity)sources.push(side==='upper'?'Swing High':'Swing Low');if(cfg.useEqualHighLow&&isEqual)sources.push(side==='upper'?'Equal High':'Equal Low');if(cfg.useMajorSwings&&major)sources.push(side==='upper'?'Major Swing High':'Major Swing Low');if(cfg.useRepeatedRejections&&isReject)sources.push('Repeated Rejection');
        if(sources.length)addPool(pools,side,{price,strength:swing,volume:Number.isFinite(sv)?sv:.5,swing,structuralVolume:sv,sources,weight:cfg.useMajorSwings&&major?1.25:1,countsAsTouch:true,touchIndex:pivotIndex},pivotIndex,i,atr,cfg);
        previous.push({price,index:pivotIndex});if(previous.length>cfg.recentPivotMemory)previous.shift();
      }
    }
    processLifecycle(pools,i,bar,atr,cfg);
    for(let j=pools.length-1;j>=0;j--){const p=pools[j],expired=i-p.activeIndex>cfg.maxAgeBars,done=p.state==='Retired'&&p.resolutionIndex>=0&&i-p.resolutionIndex>=cfg.lifecycleEventDisplayBars;if(expired||done)pools.splice(j,1);}
  }
  const i=bars.length-1,last=bars[i],atr=ind.atr[i]||0,trend=atr?clamp((ind.fast[i]-ind.slow[i])/(atr*2),-1,1):0,regime=regimeAt(i,bars,ind),seconds=duration;
  const scored=pools.map(p=>({...p,...gravity(p,i,last,atr,trend,regime,seconds,cfg)}));
  const choose=side=>scored.filter(p=>p.side===side&&['Active','Approaching'].includes(p.state)&&(side==='upper'?p.zoneHigh>=last.close:p.zoneLow<=last.close)&&p.distanceATR<=cfg.maxTargetDistanceATR).sort((a,b)=>b.gravity-a.gravity).slice(0,cfg.displayLevels).map((p,index)=>({...p,rank:index+1,rankName:['Primary Magnet','Secondary','Tertiary'][index]}));
  const upper=choose('upper'),lower=choose('lower'),pull=levels=>levels.reduce((s,p,i)=>s+p.gravity*[1,.65,.4][i],0),upPull=pull(upper),downPull=pull(lower),total=upPull+downPull,bullishPressure=total?upPull/total*100:50,bearishPressure=100-bullishPressure;
  return {upper,lower,regime,timeframe:tf.toUpperCase(),cutoff:last.time,close:last.close,atr,gravity:total?(upPull-downPull)/total*100:0,bullishPressure,bearishPressure,method:'Market Gravity · Pine v6 calculation port · OHLC-inferred liquidity · MPL-2.0',settings:{...cfg},bars,events:scored.filter(p=>['Sweeping','Rejected','Accepted'].includes(p.state))};
}

export function renderLiquidGravity(result,bars,timeframe,add){
  const duration=SECONDS[String(timeframe).toLowerCase()]||300,last=bars.at(-1),future=result.settings?.projectionBars||35,end=(last.time+duration*future)*1000;
  const drawSide=(levels,side)=>levels.forEach((pool,index)=>{
    const color=side==='upper'?'#00E5A8':'#FF4664',rank=pool.rankName||['Primary Magnet','Secondary Magnet','Tertiary Magnet'][index],y=pool.price;
    const originBar=result.bars?.[pool.originIndex]||bars[pool.originIndex];
    add('trendline',{paneId:'price',anchors:[{time:originBar?.time*1000||pool.originTime*1000||pool.time*1000,price:y},{time:end,price:y}],style:{lineColor:color,lineWidth:index===0?2:1,lineStyle:'dashed'}});
    // Distinct score marker and target text follow TradingView's label hierarchy.
    add('text',{paneId:'price',anchors:[{time:end,price:y}],text:{value:`● ${Math.round(pool.gravity)}   ${rank}${pool.state==='Approaching'?' · Approaching':''}\n${y.toFixed(2)}`,color,size:index===0?'small':'tiny',hAlign:'right',vAlign:side==='upper'?'top':'bottom'},style:{lineColor:'transparent',lineWidth:0,lineStyle:'solid'}});
  });
  drawSide(result.upper,'upper');drawSide(result.lower,'lower');
  const curve=(pool,side)=>{
    if(!pool)return null;const from=last.close,to=pool.price,delta=to-from,sign=side==='upper'?1:-1,points=[{x:0,y:from},{x:.1,y:from+delta*.1},{x:.32,y:from+delta*.32+sign*result.atr*.16},{x:.66,y:from+delta*.66+sign*result.atr*.12},{x:1,y:to}];
    for(let j=0;j<points.length-1;j++)add('trendline',{paneId:'price',anchors:[{time:(last.time+duration*future*points[j].x)*1000,price:points[j].y},{time:(last.time+duration*future*points[j+1].x)*1000,price:points[j+1].y}],style:{lineColor:side==='upper'?'#00C8FF':'#FF4664',lineWidth:2,lineStyle:'dashed'}});return {points};
  };
  const dominant=result.gravity>=0?'upper':'lower',upperPath=curve(result.upper[0],'upper'),lowerPath=curve(result.lower[0],'lower');
  for(const [side,path] of [['upper',upperPath],['lower',lowerPath]]){if(!path)continue;const lead=side===dominant,pressure=Math.round(side==='upper'?result.bullishPressure:result.bearishPressure),mid=path.points[2],lines=[`${lead?'GRAVITY FLOW':'OPPOSING GRAVITY'} ${side==='upper'?'↑':'↓'}`,`${side==='upper'?'Bull':'Bear'} Pressure ${pressure}%`];if(lead&&Math.round(result.gravity)!==0)lines.push(`Gravity ${result.gravity>0?'+':''}${Math.round(result.gravity)}`);add('text',{paneId:'price',anchors:[{time:(last.time+duration*future*mid.x)*1000,price:mid.y}],text:{value:lines.join('\n'),color:lead?(side==='upper'?'#00C8FF':'#FF4664'):'#36B9D0',size:'tiny',hAlign:'left',vAlign:side==='upper'?'top':'bottom'},style:{lineColor:'transparent',lineWidth:0,lineStyle:'solid'}});}
  return {cutoff:result.cutoff,levels:result.upper.length+result.lower.length,method:result.method};
}
