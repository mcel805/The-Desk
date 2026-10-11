// Quant Lab Wave Court: confirmed OHLC pivots and conservative Elliott candidates.
// This is an independent chart study, not a Pine runtime or a copied count.
import {confirmedLiquidityLevels} from './quant-premium-overlays.mjs';

export const WAVE_COURT_METHOD = 'quant-wave-court.v0.1';
export const WAVE_FRAMES = ['1d','4h','1h','30m','15m','5m','1m'];
const FRAME_WEIGHT = {'1d':16,'4h':8,'1h':4,'30m':2,'15m':1,'5m':0.5,'1m':0.25};
const DEGREE = [
  {name:'major',radius:12,color:'#f4f4f4',labels:['0','I','II','III','IV','V']},
  {name:'intermediate',radius:6,color:'#295bd4',labels:['0','(1)','(2)','(3)','(4)','(5)']},
  {name:'minor',radius:2,color:'#f3a143',labels:['0','1','2','3','4','5']},
];

function finiteBar(bar){return bar&&[bar.time,bar.open,bar.high,bar.low,bar.close].every(Number.isFinite)&&bar.high>=Math.max(bar.open,bar.close,bar.low)&&bar.low<=Math.min(bar.open,bar.close);}
function atr(bars){
  const tail=bars.slice(-15);if(!tail.length)return 0;
  return tail.reduce((sum,bar,index)=>sum+Math.max(bar.high-bar.low,Math.abs(bar.high-(tail[index-1]?.close??bar.close)),Math.abs(bar.low-(tail[index-1]?.close??bar.close))),0)/tail.length;
}
function confirmedTurns(bars,radius){
  const raw=[];
  for(let i=radius;i<bars.length-radius;i++){
    const bar=bars[i];let high=true,low=true;
    for(let j=i-radius;j<=i+radius;j++)if(j!==i){if(bars[j].high>=bar.high)high=false;if(bars[j].low<=bar.low)low=false;}
    if(high!==low)raw.push({index:i,time:bar.time,price:high?bar.high:bar.low,side:high?'HIGH':'LOW',confirmedTime:bars[i+radius].time});
  }
  const turns=[];
  for(const pivot of raw){
    const prior=turns.at(-1);
    if(prior?.side===pivot.side){
      if((pivot.side==='HIGH'&&pivot.price>prior.price)||(pivot.side==='LOW'&&pivot.price<prior.price))turns[turns.length-1]=pivot;
    }else turns.push(pivot);
  }
  return turns;
}
function impulse(points){
  if(points.length!==6)return null;
  const dir=points[0].side==='LOW'?1:-1;
  for(let i=0;i<6;i++)if(points[i].side!==((i%2===0)===(dir===1)?'LOW':'HIGH'))return null;
  const p=points.map(point=>point.price),move=(a,b)=>dir*(p[b]-p[a]);
  const w1=move(0,1),w3=move(2,3),w5=move(4,5);
  if(!(w1>0&&w3>0&&w5>0&&move(0,2)>0&&move(1,3)>0&&move(1,4)>0&&move(3,5)>0))return null;
  if(w3<Math.min(w1,w5))return null;
  const retrace2=Math.abs(p[2]-p[1])/w1,retrace4=Math.abs(p[4]-p[3])/w3;
  const quality=Math.round(Math.max(0,Math.min(100,70+Math.min(10,w3/w1*4)-Math.max(0,retrace2-0.786)*30-Math.max(0,retrace4-0.786)*30)));
  return {direction:dir===1?'UP':'DOWN',points,quality,ruleAudit:'W2 origin, W3 extension, W4 non-overlap, W3 length, W5 extension pass',lastConfirmed:points[5].confirmedTime};
}
function latestCandidate(turns){
  for(let end=turns.length;end>=6;end--){const found=impulse(turns.slice(end-6,end));if(found)return found;}
  return null;
}
function frameRead(timeframe,bars){
  const clean=(bars||[]).filter(finiteBar).sort((a,b)=>a.time-b.time);
  const degrees=DEGREE.map(degree=>({name:degree.name,radius:degree.radius,turns:confirmedTurns(clean,degree.radius)}));
  for(const degree of degrees)degree.candidate=latestCandidate(degree.turns);
  return {timeframe,bars:clean.length,cutoff:clean.at(-1)?.time??null,atr:atr(clean),degrees,
    status:clean.length<40?'insufficient confirmed history':degrees.some(item=>item.candidate)?'candidate':'no rule-qualified five-wave candidate'};
}
export function analyzeWaveCourt(series,chartTimeframe,chartBars){
  const byFrame=new Map(series.map(item=>[item.timeframe,item.bars]));
  byFrame.set(chartTimeframe,chartBars);
  const frames=WAVE_FRAMES.map(timeframe=>frameRead(timeframe,byFrame.get(timeframe)||[]));
  const chart=frames.find(item=>item.timeframe===chartTimeframe);
  const lastPrice=chartBars.at(-1)?.close;
  const levels=[];
  if(Number.isFinite(lastPrice))for(const frame of frames){
    if(frame.bars<35)continue;
    const bars=byFrame.get(frame.timeframe)||[];
    for(const level of confirmedLiquidityLevels(bars,frame.timeframe).filter(item=>item.breakIndex<0&&item.confirmedTime<=bars.at(-1).time)){
      levels.push({timeframe:frame.timeframe,side:level.side,price:level.price,time:level.time,
        confirmedTime:level.confirmedTime,weight:FRAME_WEIGHT[frame.timeframe],kind:level.kind,
        distance:Math.abs(level.price-lastPrice)});
    }
  }
  levels.sort((a,b)=>b.weight-a.weight||a.distance-b.distance);
  const nearest={HIGH:levels.filter(item=>item.side==='HIGH'&&item.price>lastPrice).sort((a,b)=>a.distance-b.distance).slice(0,4),
    LOW:levels.filter(item=>item.side==='LOW'&&item.price<lastPrice).sort((a,b)=>a.distance-b.distance).slice(0,4)};
  return {method:WAVE_COURT_METHOD,chartTimeframe,cutoff:chart?.cutoff??null,frames,chart,levels:nearest,
    note:'Rule-qualified OHLC candidates only. Missing degrees remain unresolved; quality is not trade probability.'};
}
function drawLine(draw,a,b,color,width=1,style='solid'){
  if(!a||!b||b.time<=a.time)return;
  draw('trendline',{paneId:'price',anchors:[{time:a.time,price:a.price},{time:b.time,price:b.price}],style:{lineColor:color,lineWidth:width,lineStyle:style}});
}
export function renderWaveCourtOverlay(read,draw){
  if(!read.chart?.cutoff)throw new Error('Wave Court needs completed bars on this chart.');
  let count=0;
  for(let degreeIndex=0;degreeIndex<DEGREE.length;degreeIndex++){
    const degree=DEGREE[degreeIndex],candidate=read.chart.degrees[degreeIndex]?.candidate;
    if(!candidate)continue;
    const gap=Math.max(read.chart.atr*0.18,Math.abs(candidate.points[5].price-candidate.points[0].price)*0.008);
    candidate.points.forEach((pivot,index)=>{
      const offset=(degreeIndex+1)*gap*(pivot.side==='HIGH'?1:-1);
      draw('text',{paneId:'price',anchors:[{time:pivot.time,price:pivot.price+offset}],text:{value:degree.labels[index],color:degree.color,size:'small',hAlign:'center',vAlign:'middle'},style:{lineColor:'transparent',lineWidth:0,lineStyle:'solid'}});
      if(index)drawLine(draw,candidate.points[index-1],pivot,degree.color,degreeIndex===0?2:1);
      count++;
    });
  }
  return {count,status:count?`${count} endpoints in ${read.chart.degrees.filter(item=>item.candidate).length} qualified degrees`:'No rule-qualified impulse on the selected chart',cutoff:read.cutoff,method:read.method};
}
export function taperEvidence(read,bars,source,game=null){
  return {method:read.method,source:{provider:source.id,symbol:source.market,timeframe:source.timeframe,snapshotAsOf:source.snapshotAsOf,
      completedCutoff:read.cutoff,history:'provider supplied; availability varies'},
    frames:read.frames.map(frame=>({timeframe:frame.timeframe,cutoff:frame.cutoff,bars:frame.bars,status:frame.status,
      degrees:frame.degrees.map(degree=>({degree:degree.name,pivots:degree.turns.length,
        candidate:degree.candidate?{direction:degree.candidate.direction,kind:degree.candidate.kind,invalid:degree.candidate.invalid,quality:degree.candidate.quality,
          lastConfirmed:degree.candidate.lastConfirmed??degree.candidate.points.at(-1)?.time,prices:degree.candidate.points.map(point=>point.price)}:null,alternate:degree.alternate?{kind:degree.alternate.kind,direction:degree.alternate.direction,quality:degree.alternate.quality,invalid:degree.alternate.invalid,prices:degree.alternate.points.map(point=>point.price)}:null}))})),
    levels:read.levels,game:game?{asset:game.asset,accountMode:game.accountMode,instrumentType:game.instrumentType,fieldFresh:game.fieldFresh,fieldCutoff:game.fieldCutoff,fieldVersion:game.range?.version,fieldProvider:game.range?.provider,fieldSymbol:game.range?.symbol,fieldLow:game.range?.low,fieldHigh:game.range?.high,eligibleLevels:[...(game.levels||[])].sort((a,b)=>Math.abs(a.price-bars.at(-1).close)-Math.abs(b.price-bars.at(-1).close)).slice(0,12).map(level=>({id:level.id,side:level.side,price:level.price,status:level.status}))}:null,
    bars:bars.slice(-60).map(bar=>({time:bar.time,open:bar.open,high:bar.high,low:bar.low,close:bar.close,volume:bar.volume??null}))};
}
