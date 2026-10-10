import {DEFAULT_CANDLES,loadCandles} from './chart-candle-style.mjs';
// Independent reconstruction of documented TTP volume concepts. No parity claim.
export const METHOD='taper.volume.v1';
export const MODES=['Volume','RelativeVolume','Density','RelativeDensity','Range','RelativeRange','VolumePerSecond'];
export const COLORS={higher:'#006400',lower:'#8b0000',equal:'#777777',strongChurn:'#ffff00',weakChurn:'#ffa500',strongClimax:'#00bfff',weakClimax:'#0000ff',strongClimaxChurn:'#ff00ff',weakClimaxChurn:'#9400d3',highDensity:'#00ff7f',extremeDensity:'#ff69b4',wideRange:'#00bfff',extremeWideRange:'#00bfff',narrowRange:'#ffff00',extremeNarrowRange:'#ff00ff',highVPS:'#00bfff',extremeVPS:'#ff00ff',low:'#ffffff',extreme:'#ffff00',major:'#8b008b',minor:'#0000ff'};
const DAY=86400000,mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
const ms=tf=>({ '1m':60000,'5m':300000,'15m':900000,'30m':1800000,'1h':3600000,'4h':14400000,'1d':DAY }[tf]);
const referenceCache=new Map(),pendingReferences=new Map();
export function referenceBars(source){return referenceCache.get(source.provider+':'+source.symbol+':'+source.timeframe)?.bars||[];}
// Narrow matching windows keep intraday RVOL history bounded instead of requesting
// 21,600 full minute bars. Reload once per UTC hour; never mix market identities.
export async function loadVolumeReferences(source,anchor){
 const key=source.provider+':'+source.symbol+':'+source.timeframe,duration=ms(source.timeframe),bucket=Math.floor(anchor/3600000)*3600000;
 if(duration!==60000)return referenceBars(source);
 if(referenceCache.get(key)?.bucket===bucket)return referenceBars(source);
 if(pendingReferences.has(key))return pendingReferences.get(key);
 const Provider=window.Vela?.[{coinbase:'CoinbaseProvider',binance:'BinanceProvider',hyperliquid:'HyperliquidProvider'}[source.provider]];if(!Provider)return [];
 const work=(async()=>{const provider=new Provider(),history=[];
  for(let day=1;day<=15;day++){const from=bucket-day*DAY-120*duration,to=bucket-day*DAY+60*duration;try{const bars=await provider.getBars(source.symbol,'1m',{from,to,limit:180});history.push(...bars.filter(b=>b.time>=from&&b.time<to&&b.time<anchor));}catch{/* Partial historical coverage remains explicit through sample counts. */}}
  const bars=[...new Map(history.map(b=>[b.time,b])).values()].sort((a,b)=>a.time-b.time);referenceCache.set(key,{bucket,bars});return bars;
 })();pendingReferences.set(key,work);try{return await work;}finally{pendingReferences.delete(key);}
}
export function mergeVolumeHistory(source,bars,cutoff){const all=new Map(referenceBars(source).map(b=>[b.time,b]));for(const b of bars)all.set(b.time,b);return [...all.values()].filter(b=>b.time<=cutoff).sort((a,b)=>a.time-b.time).slice(-5000);}
export function analyzeVolume(input,timeframe='1m',asof=Date.now(),options={}){
 const duration=ms(timeframe);if(!duration)throw new Error('Unsupported volume timeframe');
 const mode=options.mode||'Volume';if(!MODES.includes(mode))throw new Error('Unknown volume mode');
 const bars=input.filter(b=>b.time+duration<=asof).map(b=>({...b}));
 let prior=-1;for(const b of bars){if(![b.time,b.open,b.high,b.low,b.close].every(Number.isFinite)||b.time<=prior||b.time%duration||b.high<Math.max(b.open,b.low,b.close)||b.low>Math.min(b.open,b.close)||b.low<=0)throw new Error('Invalid volume OHLC history');prior=b.time;}
 const rows=[],slots=new Map();let lastStrongC=-100,lastStrongH=-100,highLine=null,lowLine=null,dayKey=null,dayActual=0,dayExpected=0,daySeen=0,dayKnown=0;
 for(let i=0;i<bars.length;i++){
  const b=bars[i],range=b.high-b.low,valid=typeof b.volume==='number'&&Number.isFinite(b.volume)&&b.volume>=0,v=valid?b.volume:null,density=v!==null&&range>0?v/range:null;
  const key=duration<DAY?b.time%DAY:0,history=slots.get(key)||[],refs=history.slice(-15),base=mean(refs.map(x=>x.volume)),baseD=mean(refs.map(x=>x.density).filter(x=>x!==null)),baseR=mean(refs.map(x=>x.range));
  const rv=refs.length>=3&&base>0&&v!==null?v/base*100:null,rd=refs.length>=3&&baseD>0&&density!==null?density/baseD*100:null,rr=refs.length>=3&&baseR>0?range/baseR*100:null;
  const values={Volume:v,RelativeVolume:rv,Density:density,RelativeDensity:rd,Range:range,RelativeRange:rr,VolumePerSecond:v===null?null:v/(duration/1000)},value=values[mode];
  const c=value!==null?value*range:null,h=value!==null&&range>0?value/range:null;
  const candidates=rows.slice(-15),recent=rows.slice(-6),full=candidates.length===15&&candidates.every(x=>x.value!==null),max=(xs,k)=>Math.max(...xs.map(x=>x[k]??-Infinity));
  const strongC=full&&c>0&&c>=max(candidates,'climax'),strongH=full&&h>0&&h>=max(candidates,'churn');
  const weakC=full&&!strongC&&i-lastStrongC<16&&c>0&&c>=max(recent,'climax'),weakH=full&&!strongH&&i-lastStrongH<16&&h>0&&h>=max(recent,'churn');
  if(strongC)lastStrongC=i;if(strongH)lastStrongH=i;
  const window=[...rows.slice(-19).map(x=>x.value),value],sma=window.length===20&&window.every(x=>x!==null)?mean(window):null,sigma=sma===null?null:Math.sqrt(mean(window.map(x=>(x-sma)**2))),bands=sma===null?null:[1,2,3].map(n=>sma+n*sigma);
  const prev=rows.at(-1),prev2=rows.at(-2),low=value!==null&&sma!==null&&prev?.value!==null&&prev2?.value!==null&&prev2&&value<=prev.value&&value<=prev2.value&&value<sma*.8;
  let kind=value===null?'unavailable':strongC&&strongH?'strongClimaxChurn':strongC?'strongClimax':strongH?'strongChurn':weakC&&weakH?'weakClimaxChurn':weakC?'weakClimax':weakH?'weakChurn':low?'low':prev?.value!=null&&value>prev.value?'higher':prev?.value!=null&&value<prev.value?'lower':'equal';
  if(['Density','RelativeDensity','VolumePerSecond'].includes(mode)&&value!==null){const ordinary=prev?.value!=null&&value>prev.value?'higher':prev?.value!=null&&value<prev.value?'lower':'equal';kind=full&&value>0&&value>=max(candidates,'value')?(mode==='VolumePerSecond'?'extremeVPS':'extremeDensity'):full&&value>0&&value>=max(recent,'value')?(mode==='VolumePerSecond'?'highVPS':'highDensity'):low?'low':ordinary;}
  if(['Range','RelativeRange'].includes(mode)&&value!==null){const min=xs=>Math.min(...xs.map(x=>x.value??Infinity));kind=full&&value<min(candidates)?'extremeNarrowRange':full&&value>max(candidates,'value')?'extremeWideRange':full&&value<min(recent)?'narrowRange':full&&value>max(recent,'value')?'wideRange':prev?.value!=null&&value>prev.value?'higher':prev?.value!=null&&value<prev.value?'lower':'equal';}
  const above2=value!==null&&prev2?.value!=null&&prev?.value!=null&&value>prev.value&&value>prev2.value,high16=full&&value!==null&&value>=max(candidates,'value');
  const extreme=bands&&high16&&value>bands[2],major=!extreme&&bands&&((high16&&value>bands[0])||(above2&&value>bands[1])),minor=!extreme&&!major&&bands&&above2&&value>bands[0];
  const volumeMode=['Volume','RelativeVolume'].includes(mode),spike=volumeMode?(extreme?'extreme':major?'major':minor?'minor':null):null,closeLocation=range>0?(b.close-b.low)/range:.5,side=spike?(closeLocation>=.5?'high':'low'):null;
  if(spike==='extreme'){const line={time:b.time,price:side==='high'?b.high:b.low};if(side==='high')highLine=line;else lowLine=line;}
  const result=range>0?Math.abs(b.close-b.open)/range:0,proxy=v===null?null:v*(b.close>b.open?1:b.close<b.open?-1:0);
  const sequence=prev&&prev.climaxSignal&&(strongH||weakH)?'CLIMAX_THEN_CHURN':null;
  const row={...b,volume:v,range,density,rvol:rv,relativeDensity:rd,relativeRange:rr,referenceCount:refs.length,baseline:base,value,climax:c,churn:h,climaxSignal:volumeMode&&(strongC||weakC),churnSignal:volumeMode&&(strongH||weakH),kind,color:COLORS[kind]||'#777777',spike,spikeSide:side,sma,sigma,bands,closeLocation,bodyFraction:result,deltaProxy:proxy,effortResult:v!==null&&sma!==null&&mode==='Volume'&&v>sma*1.5&&result<.3?'HIGH_EFFORT_SMALL_BODY':'NONE',sequence:volumeMode?sequence:null,insideBar:prev?b.high<=prev.high&&b.low>=prev.low:false,outsideBody:prev?b.open>prev.high||b.open<prev.low||b.close>prev.high||b.close<prev.low:false,ready:full&&sma!==null};rows.push(row);
  const day=Math.floor(b.time/DAY);if(day!==dayKey){dayKey=day;dayActual=dayExpected=daySeen=dayKnown=0;}daySeen++;if(rv!==null){dayKnown++;dayActual+=v;dayExpected+=base;}
  if(valid){history.push({volume:v,density,range});if(history.length>15)history.shift();slots.set(key,history);}
 }
 // Confirm volume/price divergence only after two subsequent bars; timestamp knowledge.
 const divergences=[],lastPivot={high:null,low:null};
 for(let i=2;i<rows.length-2;i++)for(const side of ['high','low']){const b=rows[i],group=rows.slice(i-2,i+3),peers=group.filter((_,j)=>j!==2),isPivot=group.every((x,j)=>!j||x.time-group[j-1].time===duration)&&peers.every(x=>side==='high'?b.high>x.high:b.low<x.low);if(!isPivot||b.volume===null)continue;const previous=lastPivot[side];if(previous&&b.time-previous.time<=60*duration&&(side==='high'?b.high>previous.high:b.low<previous.low)&&b.volume<previous.volume*.8)divergences.push({direction:side==='high'?'BEARISH':'BULLISH',anchorTime:b.time,confirmedAt:rows[i+2].time+duration,price:b[side],volume:b.volume,priorVolume:previous.volume,measurement:'confirmed price pivot with at least 20% lower raw volume'});lastPivot[side]=b;}
 const follow=[];for(let i=Math.max(0,rows.length-12);i<rows.length;i++){const b=rows[i];if(!b.climaxSignal&&!b.spike)continue;const after=rows.slice(i+1,i+3),up=b.closeLocation>=.5;follow.push({anchorTime:b.time,high:b.high,low:b.low,direction:up?'UP':'DOWN',knownAt:after.length===2?after[1].time+duration:null,state:after.length<2?'PENDING':after.some(x=>up?x.close>b.high:x.close<b.low)?'CONTINUATION':after.some(x=>up?x.close<b.low:x.close>b.high)?'OPPOSITE_BREAK':'UNRESOLVED'});}
 const latest=rows.at(-1)||null,cadenceGaps=bars.slice(-20).reduce((s,b,i,a)=>s+(i>0&&b.time-a[i-1].time!==duration?1:0),0);
 const status=!latest||latest.volume===null?'unavailable':cadenceGaps?'gapped':!latest.ready?'warming_up':'available';
 return {method:METHOD,mode,timeframe,cutoff:latest?.time??null,status,rows,latest,divergences:divergences.slice(-6),followThrough:follow,extremeLines:{high:highLine,low:lowLine},sessionRvol:daySeen&&daySeen===dayKnown&&dayExpected>0?dayActual/dayExpected*100:null,sessionCoverage:{observedBars:daySeen,matchedBars:dayKnown,fullSessionStartCovered:bars.some(b=>b.time===dayKey*DAY)},semantics:'OHLCV measurements; candle-sign delta is a proxy, not bid/ask delta. Effort/result is a hypothesis. UTC same-time baseline uses 3–15 prior observed days. Session RVOL covers supplied matched bars only. No institutional identity, order-book depth or calibrated edge.',reconstruction:'Documented 2015/2017 concepts; exact proprietary 2017 thresholds and all legacy defaults are unverified.'};
}

export function volumeBarColor(bar,inputs={}) {
 if(inputs.colorMode==='Signals')return bar.kind==='low'&&!inputs.showLow?COLORS.lower:bar.color;
 const palette=bar.close>=bar.open?'upColor':'downColor';
 return /^#[0-9a-f]{6}$/i.test(inputs[palette])?inputs[palette]:(palette==='upColor'?DEFAULT_CANDLES.upFill:DEFAULT_CANDLES.downFill);
}

export function registerTaperVolume(){
 const api=window.Vela;if(api.nativeIndicatorTypes().includes('taper-volume'))return;
 api.registerNativeIndicator({type:'taper-volume',title:"Taper's Volume",shortTitle:"Taper's Volume",paneHint:'new',overlay:false,
  inputsSchema:()=>[{key:'mode',title:'Calculation mode',type:'string',defval:'Volume',options:MODES},{key:'provider',title:'Volume source',type:'string',defval:'coinbase',options:['coinbase','binance','hyperliquid']},{key:'ticker',title:'Volume symbol',type:'string',defval:'BTC-USD'},{key:'colorMode',title:'Volume bar colors',type:'string',defval:'Candles',options:['Candles','Signals']},{key:'upColor',title:'Rising candle body color',type:'color',defval:DEFAULT_CANDLES.upFill},{key:'downColor',title:'Falling candle body color',type:'color',defval:DEFAULT_CANDLES.downFill},{key:'showLow',title:'Color low volume',type:'bool',defval:false},{key:'outlines',title:'Signal candle outlines',type:'bool',defval:false},{key:'spikes',title:'Spike markers and current extreme lines',type:'bool',defval:true},{key:'bands',title:'SMA and standard deviation bands',type:'bool',defval:true}],defaultInputs:()=>{const s=loadCandles(globalThis.localStorage);return {mode:'Volume',provider:'coinbase',ticker:'BTC-USD',colorMode:'Candles',upColor:s.upFill,downColor:s.downFill,showLow:false,outlines:false,spikes:true,bands:true};},
  create:()=>({ctx:null,inputs:{},start(ctx,inputs){this.ctx=ctx;this.inputs=inputs;this.compute();},onBars(){this.compute();},onViewport(){},setInputs(inputs){this.inputs=inputs;this.compute();},suspend(){},resume(){this.compute();},stop(){this.ctx=null;},compute(){
   const ctx=this.ctx;if(!ctx)return;const source={provider:this.inputs.provider,symbol:this.inputs.ticker,timeframe:ctx.timeframe},visible=ctx.bars(),cutoff=visible.at(-1)?.time;if(cutoff==null)return;const r=analyzeVolume(mergeVolumeHistory(source,visible,cutoff),ctx.timeframe,Date.now(),this.inputs),visibleTimes=new Set(visible.map(b=>b.time)),rows=r.rows.filter(b=>visibleTimes.has(b.time)),transparent='rgba(0,0,0,0)',p=k=>rows.map(b=>({time:b.time,value:b[k]}));
   const series=[{id:'tv-volume',title:MODES.includes(this.inputs.mode)?this.inputs.mode:'Volume',kind:'columns',paneId:'',points:rows.map(b=>({time:b.time,value:b.value,color:volumeBarColor(b,this.inputs)})),style:{color:'#777',width:1,base:0,lineStyle:'solid'}},{id:'tv-density',title:'Density · normalized backdrop',kind:'line',paneId:'',points:rows.map(b=>({time:b.time,value:b.density!==null&&b.volume!==null&&b.range>0?b.density*b.range:null})),visible:false,style:{color:'#777',width:1,lineStyle:'solid'}}];
   // Density is available as its own mode; do not rescale it into a false volume backdrop.
   series.pop();
   if(this.inputs.bands!==false){series.push({id:'tv-sma',title:'SMA 20',kind:'line',paneId:'',points:p('sma'),style:{color:'#fff',width:1,lineStyle:'dotted'}});for(let n=0;n<3;n++)series.push({id:'tv-sd-'+n,title:'SMA + '+(n+1)+'σ',kind:'line',paneId:'',points:rows.map(b=>({time:b.time,value:b.bands?.[n]??null})),style:{color:'#7b6a96',width:1,lineStyle:'dotted'}});}
   if((this.inputs.mode||'Volume').startsWith('Relative'))series.push({id:'tv-100',title:'100% reference',kind:'line',paneId:'',points:rows.map(b=>({time:b.time,value:b.value===null?null:100})),style:{color:'#4b0082',width:1,lineStyle:'solid'}});
   if(this.inputs.outlines===true)series.push({id:'tv-outlines',title:'Volume signal outlines',kind:'candle',paneId:'',overlay:true,bars:rows,style:{up:transparent,down:transparent,wickUp:transparent,wickDown:transparent,borderUp:transparent,borderDown:transparent},barColors:rows.map(b=>b.kind.startsWith('strong')||b.kind.startsWith('weak')?{color:transparent,wickColor:transparent,borderColor:b.color}:null)});
   const lines=[];if(this.inputs.spikes!==false){series.push({id:'tv-spikes',title:'Volume spikes',kind:'markers',paneId:'',overlay:true,markers:rows.filter(b=>b.spike).map(b=>({time:b.time,position:b.spikeSide==='high'?'aboveBar':'belowBar',shape:b.spike==='extreme'?'diamond':b.spike==='major'?(b.spikeSide==='high'?'triangleDown':'triangleUp'):'cross',color:COLORS[b.spike],size:'tiny'}))});for(const side of ['high','low']){const l=r.extremeLines[side];if(l)lines.push({id:'tv-extreme-'+side,paneId:'',xloc:'bar_time',x1:l.time,y1:l.price,x2:r.cutoff,y2:l.price,extend:'right',color:side==='high'?'#00ff00':'#ff0000',invisible:false,width:1,style:'solid',arrowLeft:false,arrowRight:false,overlay:true});}}
   ctx.emit({series,lines});ctx.setStatus('idle');this.latestSummary={status:r.status,kind:r.latest?.kind,cutoff:r.cutoff,rvol:r.latest?.rvol};
  }})});
}
