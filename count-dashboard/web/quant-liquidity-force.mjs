// Liquidity Force combines the confirmed Liquidity map with matched Liquid Gravity
// pools. Gravity stays a relative attraction measure; this overlay makes no odds claim.
// The profile calculation below adapts the user-authorized LuxAlgo Clusters Volume
// Profile source. Preserve its attribution and CC BY-NC-SA 4.0 terms when distributing.
// © LuxAlgo — https://creativecommons.org/licenses/by-nc-sa/4.0/
import {completedBars,confirmedLiquidityLevels} from './quant-premium-overlays.mjs';
import {liquidityConvergenceGroups} from './liquidity-convergence.js';
import {buildLiquidGravity} from './liquid-gravity.mjs';

const intervalMs={"1m":60_000,"2m":120_000,"3m":180_000,"5m":300_000,"15m":900_000,"30m":1_800_000,"45m":2_700_000,"1h":3_600_000,"2h":7_200_000,"3h":10_800_000,"4h":14_400_000,"6h":21_600_000,"8h":28_800_000,"12h":43_200_000,"1d":86_400_000,"1w":604_800_000};
const palette=['#2196f3','#f44336','#4caf50','#ff9800','#9c27b0','#00bcd4','#ffeb3b','#e91e63','#795548','#607d8b'];
const mapColor=level=>level.kind==='INT'?(level.side==='HIGH'?'#ff9800':'#00d5e8'):(level.side==='HIGH'?'#f23645':'#089981');
const gravityRank=['Primary','Secondary','Tertiary'];

function drawLine(add,start,end,price,color,width=1,lineStyle='solid'){
  if(![start,end,price].every(Number.isFinite)||end<=start)return false;
  add('trendline',{paneId:'price',anchors:[{time:start,price},{time:end,price}],style:{lineColor:color,lineWidth:width,lineStyle}});
  return true;
}

function selectedLiquidity(series,chartTimeframe,chartCutoff){
  const selected=[];
  for(const item of series){
    const timeframe=String(item.timeframe).toUpperCase(),bars=item.bars;
    if(!intervalMs[timeframe.toLowerCase()]||bars.length<29)continue;
    const levels=confirmedLiquidityLevels(bars,timeframe.toLowerCase());
    for(const side of ['HIGH','LOW']){
      const scoped=levels.filter(level=>level.side===side&&level.breakIndex<0);
      const external=scoped.filter(level=>level.kind==='EXT').slice(-3);
      const internal=scoped.filter(level=>level.kind==='INT').slice(-1);
      for(const level of [...external,...internal])selected.push({...level,id:`${timeframe}|${level.kind}|${side}|${level.time}|${level.price}`,timeframe,side,bars,atr:level.atr,active:true});
    }
  }
  return selected.filter(level=>level.confirmedTime<=chartCutoff&&level.timeframe!=='UNSUPPORTED'&&
    (level.timeframe===String(chartTimeframe).toUpperCase()||['30M','1H'].includes(level.timeframe)));
}

function matchedGravityLevels(levels,series,asOfSeconds){
  const poolMatches=[];
  for(const item of series){
    const timeframe=String(item.timeframe).toUpperCase(),timeframeLevels=levels.filter(level=>level.timeframe===timeframe);
    if(!timeframeLevels.length)continue;
    const bars=item.bars.map(bar=>({...bar,time:bar.time/1000}));
    try{
      const result=buildLiquidGravity(bars,timeframe.toLowerCase(),{asOf:asOfSeconds});
      for(const side of ['upper','lower'])for(const pool of result[side]){
        const levelSide=side==='upper'?'HIGH':'LOW';
        const matches=timeframeLevels.filter(level=>level.side===levelSide).map(level=>({level,distance:Math.abs(level.price-pool.price)}))
          .filter(match=>match.level.price>=pool.zoneLow&&match.level.price<=pool.zoneHigh||match.distance<=pool.poolATR*(result.settings.clusterATR??0.15))
          .sort((a,b)=>a.distance-b.distance||b.level.confirmedTime-a.level.confirmedTime);
        if(matches.length)poolMatches.push({...matches[0],pool,timeframe,side});
      }
    }catch(error){
      if(!/at least 24 completed bars/.test(error.message))throw error;
    }
  }
  const bestByLevel=new Map();
  for(const match of poolMatches){const prior=bestByLevel.get(match.level.id);if(!prior||match.pool.gravity>prior.pool.gravity)bestByLevel.set(match.level.id,match);}
  const ranks={HIGH:[],LOW:[]};
  for(const match of bestByLevel.values())ranks[match.level.side].push(match);
  for(const side of ['HIGH','LOW'])ranks[side].sort((a,b)=>b.pool.gravity-a.pool.gravity||a.distance-b.distance).splice(3);
  for(const side of ['HIGH','LOW'])ranks[side].forEach((item,index)=>{item.rank=index+1;item.rankName=gravityRank[index];});
  return {ranks,poolMatches:bestByLevel.size};
}

function gravityBalance(ranks){
  const weights=[1,.65,.4],pull=items=>items.reduce((sum,item,index)=>sum+item.pool.gravity*weights[index],0);
  const upperPull=pull(ranks.HIGH),lowerPull=pull(ranks.LOW),total=upperPull+lowerPull;
  const gravity=total?(upperPull-lowerPull)/total*100:0;
  return {upperPull,lowerPull,gravity,bullishPressure:total?upperPull/total*100:50,bearishPressure:total?lowerPull/total*100:50,
    direction:gravity>0?'Positive':gravity<0?'Negative':'Balanced'};
}

function drawGravityFlow(ranks,bars,timeframe,balance,add){
  const duration=intervalMs[String(timeframe).toLowerCase()],last=bars.at(-1);
  if(!duration||!last)return 0;
  const future=35;
  for(const side of ['HIGH','LOW'])for(const item of ranks[side]){
    const upper=side==='HIGH',color=upper?'#00E5A8':'#FF4664',level=item.level;
    const end=last.time+duration*18;
    drawLine(add,level.confirmedTime,end,level.price,color,item.rank===1?2:1,'dashed');
    add('text',{paneId:'price',anchors:[{time:end,price:level.price}],text:{value:`● ${Math.round(item.pool.gravity)}  ${item.rankName} · ${item.pool.state}\n${level.price.toFixed(2)}`,color,size:item.rank===1?'small':'tiny',hAlign:'right',vAlign:upper?'top':'bottom'},style:{lineColor:'transparent',lineWidth:0,lineStyle:'solid'}});
  }
  const curve=(item,upper)=>{
    if(!item)return null;
    const target=item.level.price,delta=target-last.close,sign=upper?1:-1,atr=item.pool.poolATR||item.level.atr||0;
    const points=[{x:0,y:last.close},{x:.1,y:last.close+delta*.1},{x:.32,y:last.close+delta*.32+sign*atr*.16},
      {x:.66,y:last.close+delta*.66+sign*atr*.12},{x:1,y:target}];
    for(let i=0;i<points.length-1;i++)add('trendline',{paneId:'price',anchors:[
      {time:last.time+duration*future*points[i].x,price:points[i].y},
      {time:last.time+duration*future*points[i+1].x,price:points[i+1].y}],
      style:{lineColor:upper?'#00C8FF':'#FF4664',lineWidth:2,lineStyle:'dashed'}});
    return points;
  };
  for(const [side,upper] of [['HIGH',true],['LOW',false]]){
    const points=curve(ranks[side][0],upper);if(!points)continue;
    const lead=upper?balance.gravity>=0:balance.gravity<0,pressure=Math.round(upper?balance.bullishPressure:balance.bearishPressure);
    const value=[`${lead?'GRAVITY FLOW':'OPPOSING GRAVITY'} ${upper?'↑':'↓'}`,
      `${upper?'Bull':'Bear'} Pressure ${pressure}%`,`${balance.direction} Gravity ${balance.gravity>0?'+':''}${Math.round(balance.gravity)}`].join('\n');
    const mid=points[2];add('text',{paneId:'price',anchors:[{time:last.time+duration*future*mid.x,price:mid.y},
      ],text:{value,color:lead?(upper?'#00C8FF':'#FF4664'):'#36B9D0',size:'tiny',hAlign:'left',vAlign:upper?'top':'bottom'},
      style:{lineColor:'transparent',lineWidth:0,lineStyle:'solid'}});
  }
  return (ranks.HIGH.length+ranks.LOW.length)*2+10;
}

function renderLiquidity(levels,chartTimeframe,chartCutoff,view,add){
  const duration=intervalMs[String(chartTimeframe).toLowerCase()]||300_000;
  if(view==='Raw Levels'){
    let count=0;
    for(const level of levels){
      const color=mapColor(level),width=['30M','1H'].includes(level.timeframe)?2:1;
      if(drawLine(add,level.confirmedTime,chartCutoff,level.price,color,width,level.kind==='INT'?'dotted':'solid'))count++;
    }
    return {count,groups:0};
  }
  const groups=liquidityConvergenceGroups(levels,String(chartTimeframe).toUpperCase(),{convergenceAtr:0.1,showLocalConvergences:true},chartCutoff)
    .sort((a,b)=>a.low-b.low);
  const represented=new Set(groups.flatMap(group=>group.members.map(level=>level.id)));
  let count=0;
  for(const level of levels){
    if(represented.has(level.id))continue;
    if(drawLine(add,level.confirmedTime,chartCutoff,level.price,mapColor(level),['30M','1H'].includes(level.timeframe)?2:1,level.kind==='INT'?'dotted':'solid'))count++;
  }
  for(const group of groups){
    const color=group.contested?'#d8ae84':'#d8c5f0';
    for(const level of group.members){
      if(level.confirmedTime<group.joinTime&&drawLine(add,level.confirmedTime,group.joinTime,level.price,mapColor(level),1,level.kind==='INT'?'dotted':'solid'))count++;
    }
    if(drawLine(add,group.joinTime,chartCutoff,group.anchor.price,color,3,'solid'))count++;
    add('text',{paneId:'price',anchors:[{time:chartCutoff,price:group.anchor.price}],text:{value:`${group.timeframes.join('+')} · C${group.members.length}${group.contested?' · Contested':''}`,color,size:'tiny',hAlign:'right',vAlign:group.anchor.side==='HIGH'?'top':'bottom'},style:{lineColor:'transparent',lineWidth:0,lineStyle:'solid'}});count++;
  }
  return {count,groups:groups.length};
}

function kmeans(prices,volumes,k=5,iterations=50){
  const min=Math.min(...prices),max=Math.max(...prices),step=(max-min)/(k+1);
  let centroids=Array.from({length:k},(_,i)=>min+(i+1)*step),assignments=Array(prices.length).fill(0);
  for(let iteration=0;iteration<iterations;iteration++){
    for(let i=0;i<prices.length;i++){
      let best=0,distance=Infinity;
      for(let j=0;j<k;j++){const candidate=Math.abs(prices[i]-centroids[j]);if(candidate<distance){distance=candidate;best=j;}}
      assignments[i]=best;
    }
    const sumPV=Array(k).fill(0),sumV=Array(k).fill(0);
    for(let i=0;i<prices.length;i++){const cluster=assignments[i];sumPV[cluster]+=prices[i]*volumes[i];sumV[cluster]+=volumes[i];}
    for(let j=0;j<k;j++)if(sumV[j]>0)centroids[j]=sumPV[j]/sumV[j];
  }
  return assignments;
}

export function renderLiquidityForceProfile(bars,chartBars,profileTimeframe,chartTimeframe,add,{showDots=true}={}){
  const lookback=200,k=5,iterations=50,rows=20,vpWidth=40,vpOffset=10;
  const sample=bars.slice(-lookback),chartLast=chartBars.at(-1),chartDuration=intervalMs[String(chartTimeframe).toLowerCase()];
  if(sample.length<lookback)return {count:0,status:`Waiting for ${lookback} completed ${profileTimeframe.toUpperCase()} bars.`,cutoff:chartLast?.time};
  if(!chartLast||!chartDuration)return {count:0,status:'A supported chart timeframe is required for profile alignment.',cutoff:chartLast?.time};
  // LuxAlgo seeds and visits source bars newest first (`hl2[0]`, then [1]...).
  const clustered=sample.slice().reverse(),prices=clustered.map(bar=>(bar.high+bar.low)/2),volumes=clustered.map(bar=>Number(bar.volume)||0);
  const totalVolume=volumes.reduce((sum,value)=>sum+value,0);
  if(!(totalVolume>0))return {count:0,status:'Volume Profile unavailable: the selected source bars have no positive reported volume.',cutoff:sample.at(-1).time};
  const assignments=kmeans(prices,volumes,k,iterations),chartRatio=Math.max(1,Math.round(intervalMs[profileTimeframe]/chartDuration));
  const chartEnd=chartLast.time+chartDuration,profileStart=Math.max(chartBars[0]?.time??0,chartEnd-lookback*chartRatio*chartDuration),histogramStart=chartEnd+vpOffset*chartDuration;
  let count=0;
  if(showDots){
    const dotBudget=490;
    let dots=0;
    for(let cluster=0;cluster<k&&dots<dotBudget;cluster++)for(let i=0;i<lookback&&dots<dotBudget;i++)if(assignments[i]===cluster){
      const bar=clustered[i],color=palette[cluster];
      add('text',{paneId:'price',anchors:[{time:bar.time,price:prices[i]}],text:{value:'•',color,size:'small',hAlign:'center',vAlign:'middle'},style:{lineColor:'transparent',lineWidth:0,lineStyle:'solid'}});dots++;count++;
    }
  }
  for(let cluster=0;cluster<k;cluster++){
    const indices=assignments.map((value,index)=>value===cluster?index:-1).filter(index=>index>=0);
    if(!indices.length)continue;
    const clusterBars=indices.map(index=>clustered[index]),low=Math.min(...clusterBars.map(bar=>bar.low)),high=Math.max(...clusterBars.map(bar=>bar.high));
    const total=indices.reduce((sum,index)=>sum+volumes[index],0);let binSize=(high-low)/rows;
    if(binSize===0)binSize=Math.max(Math.abs(low)*1e-8,1e-8);
    const binVolumes=Array(rows).fill(0);
    for(const index of indices){
      const bar=clustered[index],range=Math.max(bar.high-bar.low,1e-12);
      for(let bin=0;bin<rows;bin++){
        const binLow=low+bin*binSize,binHigh=binLow+binSize,overlap=Math.min(bar.high,binHigh)-Math.max(bar.low,binLow);
        if(overlap>0)binVolumes[bin]+=volumes[index]*overlap/range;
      }
    }
    const maximum=Math.max(...binVolumes),pocIndex=binVolumes.indexOf(maximum),color=palette[cluster];
    for(let bin=0;bin<rows;bin++){
      const volume=binVolumes[bin];if(!(volume>0))continue;
      const bottom=low+bin*binSize,top=bottom+binSize,width=vpWidth*volume/maximum,end=histogramStart+width*chartDuration,isPoc=bin===pocIndex;
      add('box',{paneId:'price',anchors:[{time:histogramStart,price:top},{time:end,price:bottom}],style:{lineColor:isPoc?color:'transparent',lineWidth:isPoc?1:0,lineStyle:'solid',fillColor:isPoc?color:`${color}40`}});count++;
      if(isPoc){
        const poc=(top+bottom)/2;
        drawLine(add,profileStart,histogramStart,poc,color,1,'dashed');count++;
        add('text',{paneId:'price',anchors:[{time:profileStart,price:poc}],text:{value:volume.toLocaleString('en-US',{maximumFractionDigits:2}),color,size:'tiny',hAlign:'right',vAlign:'middle'},style:{lineColor:'transparent',lineWidth:0,lineStyle:'solid'}});count++;
        add('text',{paneId:'price',anchors:[{time:end,price:poc}],text:{value:`Total: ${total.toLocaleString('en-US',{maximumFractionDigits:2})}`,color,size:'tiny',hAlign:'left',vAlign:'middle'},style:{lineColor:'transparent',lineWidth:0,lineStyle:'solid'}});count++;
      }
    }
  }
  return {count,status:`${k} clusters · ${lookback} completed ${profileTimeframe.toUpperCase()} bars · ${iterations} K-means passes · OHLC-range volume allocation · reported bar volume`,cutoff:sample.at(-1).time};
}

export function renderLiquidityForce({series,chartTimeframe,chartBars,profileBars,profileTimeframe,settings,asOf,add}){
  const duration=intervalMs[String(chartTimeframe).toLowerCase()],last=chartBars.at(-1);
  if(!duration||!last)throw new Error('Liquidity Force needs completed bars on a supported chart timeframe.');
  const chartCutoff=last.time+duration,levels=selectedLiquidity(series,chartTimeframe,chartCutoff);
  if(!levels.length)throw new Error('Liquidity Force needs at least 29 completed bars on a chart, 30m, or 1h source timeframe.');
  const liquidity=renderLiquidity(levels,chartTimeframe,chartCutoff,settings.view,add);
  const matched=matchedGravityLevels(levels,series,asOf/1000);
  const balance=gravityBalance(matched.ranks),gravityDrawings=drawGravityFlow(matched.ranks,chartBars,chartTimeframe,balance,add);
  const profile=settings.showProfile?renderLiquidityForceProfile(profileBars,chartBars,profileTimeframe,chartTimeframe,add):{count:0,status:'off',cutoff:null};
  const gravityCount=matched.ranks.HIGH.length+matched.ranks.LOW.length;
  const endTime=Number.isFinite(asOf)?asOf:chartCutoff;
  return {count:liquidity.count+gravityDrawings+profile.count,levels:levels.length,groups:liquidity.groups,gravityRanks:gravityCount,matchedPools:matched.poolMatches,
    ranks:matched.ranks,gravity:balance,
    cutoff:chartCutoff,asOf:endTime,profile,method:'Liquidity Force · liquidity-map-v1 + Liquid Gravity OHLC model + LuxAlgo cluster profile',
    status:`${levels.length} active Liquidity levels · ${liquidity.groups} convergence groups · ${gravityCount} matched Gravity ranks · ${profile.status}`};
}
