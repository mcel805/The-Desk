const DAY_MS=86_400_000;
const colors={normal:'#b3262d',higher:'#16843b',lower:'#b3262d',churn:'#ffd600',weakChurn:'#f39a20',climax:'#00b7ec',weakClimax:'#1769ff',climaxChurn:'#ff20df',weakClimaxChurn:'#9c27b0',low:'#e8e8e8',minor:'#153ee8',major:'#a90072',extreme:'#ffea00',average:'#9f45d9',sma:'#f0f0f0'};
const number=(value,fallback)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const bool=(value,fallback)=>typeof value==='boolean'?value:fallback;
const avg=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:NaN;
const maxFinite=values=>{const finite=values.filter(Number.isFinite);return finite.length?Math.max(...finite):NaN;};
const stdev=values=>{const mean=avg(values);return values.length>1?Math.sqrt(avg(values.map(value=>(value-mean)**2))):0;};
const timeframeMs=timeframe=>{const value=String(timeframe||'').toLowerCase();const m=value.match(/^(\d+)(m|min|minute|minutes)$/);if(m)return Number(m[1])*60_000;const h=value.match(/^(\d+)(h|hr|hour|hours)$/);if(h)return Number(h[1])*3_600_000;const d=value.match(/^(\d+)(d|day|days)$/);if(d)return Number(d[1])*DAY_MS;const raw=Number(value);return Number.isFinite(raw)&&raw>0?raw*60_000:NaN;};

/** Relative volume against prior completed bars at the same UTC time-of-day. */
export function calculateRelativeVolume(bars,timeframe,{days=20,lowThreshold=80,includeLow=false}={}){
  const interval=timeframeMs(timeframe);
  if(!Number.isFinite(interval))throw new Error(`Unsupported RelativeVolume timeframe: ${timeframe}`);
  const sessionAligned=interval<DAY_MS;
  const observations=[];
  for(let index=0;index<bars.length;index++){
    const bar=bars[index],sameSlot=[];
    for(let j=index-1;j>=0&&sameSlot.length<days;j--){
      const prior=bars[j];
      if(sessionAligned?((prior.time%DAY_MS)===(bar.time%DAY_MS)):true)sameSlot.push(prior);
    }
    const baseline=avg(sameSlot.map(item=>item.volume));
    const range=Math.max(0,bar.high-bar.low),density=range>0?bar.volume/range:0;
    const rangeBase=avg(sameSlot.map(item=>Math.max(0,item.high-item.low)));
    const densityBase=avg(sameSlot.map(item=>{const r=Math.max(0,item.high-item.low);return r>0?item.volume/r:0;}));
    const relativeVolume=baseline>0?bar.volume/baseline*100:NaN;
    const relativeRange=rangeBase>0?range/rangeBase:NaN;
    const relativeDensity=densityBase>0?density/densityBase:NaN;
    const history=observations.slice(Math.max(0,index-20),index).map(item=>item.value).filter(Number.isFinite);
    const fast=avg(history.slice(-5)),slow=avg(history),sigma=stdev(history);
    const prev2=observations.slice(Math.max(0,index-2),index).map(item=>item.value);
    const abovePrev2=prev2.length===2&&relativeVolume>Math.max(...prev2);
    const extremeHigh=history.length>=5&&relativeVolume>Math.max(...history)&&relativeVolume>slow+3*sigma;
    const majorHigh=history.length>=5&&((relativeVolume>Math.max(...history)&&relativeVolume>slow+sigma)||(relativeVolume>slow+2*sigma&&abovePrev2));
    const minorHigh=abovePrev2&&((relativeVolume>fast&&relativeVolume>slow)||(relativeVolume>slow+sigma));
    let spike=extremeHigh?'extreme':majorHigh?'major':minorHigh?'minor':null;
    const closeLocation=range?(bar.close-bar.low)/range:.5;
    const priceHigh=spike&&closeLocation>=0.5;
    const priceSide=spike?(priceHigh?'high':'low'):null;
    const churnValue=relativeRange>0?relativeVolume/relativeRange:NaN;
    const climaxValue=relativeRange>0?relativeVolume*relativeRange:NaN;
    const last16=observations.slice(-16),last7=observations.slice(-7);
    const churn16=maxFinite(last16.map(item=>item.churnValue)),climax16=maxFinite(last16.map(item=>item.climaxValue));
    const churn7=maxFinite(last7.map(item=>item.churnValue)),climax7=maxFinite(last7.map(item=>item.climaxValue));
    const strongChurn=Number.isFinite(churnValue)&&last16.length>=3&&Number.isFinite(churn16)&&churnValue>=churn16;
    const strongClimax=Number.isFinite(climaxValue)&&last16.length>=3&&Number.isFinite(climax16)&&climaxValue>=climax16;
    const weakChurn=!strongChurn&&last7.length>=3&&last16.some(item=>item.strongChurn)&&Number.isFinite(churn7)&&churnValue>=churn7;
    const weakClimax=!strongClimax&&last7.length>=3&&last16.some(item=>item.strongClimax)&&Number.isFinite(climax7)&&climaxValue>=climax7;
    const combined=strongClimax&&strongChurn?'climaxChurn':weakClimax&&weakChurn?'weakClimaxChurn':null;
    const lowest3=observations.length>=2&&relativeVolume<=Math.min(...observations.slice(-2).map(item=>item.value));
    const low=includeLow&&Number.isFinite(relativeVolume)&&lowest3&&relativeVolume<lowThreshold&&relativeVolume<slow;
    const kind=combined||(strongClimax?'climax':weakClimax?'weakClimax':strongChurn?'churn':weakChurn?'weakChurn':low?'low':Number.isFinite(relativeVolume)&&observations.length&&relativeVolume>observations.at(-1).value?'higher':'normal');
    const row={...bar,index,value:relativeVolume,baseline,referenceCount:sameSlot.length,relativeRange,relativeDensity,churnValue,climaxValue,fast,slow,sigma,kind,spike:spike?{level:spike,side:priceSide}:null,strongChurn,strongClimax,closeLocation};
    observations.push(row);
  }
  const sma=observations.map((row,index)=>avg(observations.slice(Math.max(0,index-19),index+1).map(item=>item.value).filter(Number.isFinite)));
  const today=observations.at(-1)?.time;
  const todaySlot=sessionAligned&&today!=null?Math.floor(today/DAY_MS):null;
  const current=observations.filter(row=>todaySlot==null||Math.floor(row.time/DAY_MS)===todaySlot);
  const known=current.filter(row=>Number.isFinite(row.value));
  const cumulative=known.length?avg(known.map(row=>row.value)):NaN;
  return {bars:observations,sma,cumulative,latest:observations.at(-1)||null,days,sourceTimeBasis:'UTC bar-time slot'};
}

const descriptor={
  type:'ttp-relative-volume',title:'TTP Volume Analyst · RelativeVolume',shortTitle:'TTP RelativeVolume',paneHint:'new',overlay:false,
  inputsSchema:()=>[
    {key:'days',title:'Same-time bars · days',type:'int',defval:20,min:3,max:60,step:1,tooltip:'Historical bars at the same UTC time-of-day used for the reference average.'},
    {key:'lowThreshold',title:'Low volume threshold %',type:'int',defval:80,min:10,max:100,step:1},
    {key:'includeLow',title:'Show low volume bars',type:'bool',defval:false},
    {key:'colorVolumeBars',title:'Color RelativeVolume columns',type:'bool',defval:true},
    {key:'colorPriceBars',title:'Color signal candle outlines',type:'bool',defval:true},
    {key:'showSignalSymbols',title:'Show event symbols on price',type:'bool',defval:true},
    {key:'showSpikeSymbols',title:'Show spike symbols on price',type:'bool',defval:true},
    {key:'provider',title:'Public data source',type:'string',defval:'hyperliquid',options:['hyperliquid','binance','coinbase']},
    {key:'ticker',title:'Market symbol',type:'string',defval:'BTC'},
  ],
  defaultInputs:()=>({days:20,lowThreshold:80,includeLow:false,colorVolumeBars:true,colorPriceBars:true,showSignalSymbols:true,showSpikeSymbols:true,provider:'hyperliquid',ticker:'BTC'}),
  create:()=>new RelativeVolumeIndicator(),
};

class RelativeVolumeIndicator{
  ctx=null;inputs={};historyBars=[];requestToken=0;
  start(ctx,inputs){this.ctx=ctx;this.inputs=inputs;this.compute();void this.loadReferenceHistory();}
  onBars(){this.compute();if(this.shouldLoadMore())void this.loadReferenceHistory();}
  onViewport(){}
  setInputs(inputs){const reload=inputs.provider!==this.inputs.provider||inputs.ticker!==this.inputs.ticker||inputs.days!==this.inputs.days;this.inputs=inputs;this.compute();if(reload){this.historyBars=[];void this.loadReferenceHistory();}}
  suspend(){}
  resume(){this.compute();}
  stop(){this.requestToken++;this.ctx=null;}
  shouldLoadMore(){
    const ctx=this.ctx;if(!ctx)return false;
    const interval=timeframeMs(ctx.timeframe),bars=ctx.bars();
    return Number.isFinite(interval)&&bars.length>0&&bars.at(-1).time-bars[0].time<number(this.inputs.days,20)*DAY_MS&&this.historyBars.length<bars.length;
  }
  async loadReferenceHistory(){
    const ctx=this.ctx;if(!ctx)return;
    const interval=timeframeMs(ctx.timeframe),chartBars=ctx.bars();
    if(!Number.isFinite(interval)||!chartBars.length||chartBars.at(-1).time-chartBars[0].time>=number(this.inputs.days,20)*DAY_MS)return;
    const Provider=window.Vela?.[{hyperliquid:'HyperliquidProvider',binance:'BinanceProvider',coinbase:'CoinbaseProvider'}[String(this.inputs.provider||'').toLowerCase()]];
    if(!Provider)return;
    const limit=Math.min(5000,Math.ceil(number(this.inputs.days,20)*DAY_MS/interval)+1);
    const token=++this.requestToken;ctx.setStatus('loading');
    try{
      const rows=await new Provider().getBars(String(this.inputs.ticker||ctx.symbol),ctx.timeframe,{limit});
      if(this.ctx!==ctx||token!==this.requestToken)return;
      this.historyBars=Array.isArray(rows)?rows.filter(bar=>bar&&Number.isFinite(bar.time)&&Number.isFinite(bar.volume)&&bar.volume>=0).sort((a,b)=>a.time-b.time):[];
      this.compute();ctx.setStatus('idle');
    }catch{
      if(this.ctx===ctx&&token===this.requestToken)ctx.setStatus('idle');
    }
  }
  compute(){
    if(!this.ctx)return;
    const interval=timeframeMs(this.ctx.timeframe),now=Date.now();
    const visibleBars=this.ctx.bars().filter(bar=>Number.isFinite(interval)&&bar.time+interval<=now);
    const combined=new Map(this.historyBars.map(bar=>[bar.time,bar]));
    for(const bar of visibleBars)combined.set(bar.time,bar);
    const bars=[...combined.values()].filter(bar=>Number.isFinite(interval)&&bar.time+interval<=now).sort((a,b)=>a.time-b.time);
    if(!visibleBars.length){this.ctx.emit({});return;}
    const full=calculateRelativeVolume(bars,this.ctx.timeframe,{days:number(this.inputs.days,20),lowThreshold:number(this.inputs.lowThreshold,80),includeLow:bool(this.inputs.includeLow,false)});
    const fullIndex=new Map(full.bars.map((row,index)=>[row.time,index]));
    const rows=visibleBars.map(bar=>full.bars[fullIndex.get(bar.time)]).filter(Boolean);
    const visibleSma=rows.map(row=>full.sma[fullIndex.get(row.time)]);
    const colorVolumeBars=bool(this.inputs.colorVolumeBars,true),colorPriceBars=bool(this.inputs.colorPriceBars,true);
    const showSignalSymbols=bool(this.inputs.showSignalSymbols,true),showSpikeSymbols=bool(this.inputs.showSpikeSymbols,true);
    const neutral='#70757d';
    const points=rows.map(row=>({time:row.time,value:Number.isFinite(row.value)?row.value:null,color:colorVolumeBars?(colors[row.kind]||colors.normal):neutral}));
    const avgPoints=rows.map(row=>({time:row.time,value:100}));
    const smaPoints=rows.map((row,index)=>({time:row.time,value:Number.isFinite(visibleSma[index])?visibleSma[index]:null}));
    const visibleTimes=new Set(rows.map(row=>row.time)),priceMarkers=[];
    const eventGlyphs={churn:['diamond',colors.churn],weakChurn:['circle',colors.weakChurn],climax:['square',colors.climax],weakClimax:['triangleUp',colors.weakClimax],climaxChurn:['diamond',colors.climaxChurn],weakClimaxChurn:['square',colors.weakClimaxChurn],low:['cross',colors.low]};
    if(showSignalSymbols)for(const row of rows){const glyph=eventGlyphs[row.kind];if(glyph)priceMarkers.push({time:row.time,position:'inBar',shape:glyph[0],color:glyph[1],size:'tiny'});}
    let highLevel=null,lowLevel=null;
    for(const row of full.bars){
      if(row.spike){
        const shape=row.spike.level==='extreme'?'diamond':row.spike.level==='major'?'triangleDown':'cross';
        if(showSpikeSymbols&&visibleTimes.has(row.time))priceMarkers.push({time:row.time,position:row.spike.side==='high'?'aboveBar':'belowBar',shape,color:colors[row.spike.level],size:row.spike.level==='extreme'?'small':'tiny'});
        if(row.spike.level==='extreme'){if(row.spike.side==='high')highLevel={time:row.time,price:row.high};else lowLevel={time:row.time,price:row.low};}
      }
    }
    const latest=rows.at(-1);
    const series=[
      {id:'ttp-rv-bars',title:'RelativeVolume %',kind:'columns',paneId:'',points,style:{color:colors.normal,width:1,lineStyle:'solid',base:0}},
      {id:'ttp-rv-average',title:'100% · same-time average',kind:'line',paneId:'',points:avgPoints,style:{color:colors.average,width:1,lineStyle:'solid'}},
      {id:'ttp-rv-sma',title:'RelativeVolume SMA 20',kind:'line',paneId:'',points:smaPoints,style:{color:colors.sma,width:1,lineStyle:'dotted'}},
    ];
    const transparent='rgba(0,0,0,0)';
    const candleOutlineColors=rows.map(row=>{
      if(!colorPriceBars)return null;
      const signal=['churn','weakChurn','climax','weakClimax','climaxChurn','weakClimaxChurn','low'].includes(row.kind);
      return signal?{color:transparent,wickColor:transparent,borderColor:colors[row.kind]}:null;
    });
    if(candleOutlineColors.some(Boolean))series.push({id:'ttp-rv-candle-outlines',title:'RelativeVolume candle outlines',kind:'candle',paneId:'',overlay:true,bars:rows,style:{up:transparent,down:transparent,wickUp:transparent,wickDown:transparent,borderUp:transparent,borderDown:transparent},barColors:candleOutlineColors});
    if(priceMarkers.length)series.push({id:'ttp-rv-price-spikes',title:'RelativeVolume spikes',kind:'markers',paneId:'',overlay:true,markers:priceMarkers});
    const lines=[];
    for(const [side,level,color] of [['high',highLevel,'#19e04b'],['low',lowLevel,'#e73535']])if(level)lines.push({id:`ttp-rv-extreme-${side}`,paneId:'',xloc:'bar_time',x1:level.time,y1:level.price,x2:bars.at(-1).time,y2:level.price,extend:'right',color,invisible:false,width:1,style:'solid',arrowLeft:false,arrowRight:false,overlay:true});
    this.ctx.emit({series,lines});
    this.ctx.setStatus('idle');
    this.latestSummary={value:latest?.value,cumulative:full.cumulative,kind:latest?.kind,cutoff:latest?.time,referenceCount:latest?.referenceCount};
  }
}

/** Register into the chart library global before chart instances are created. */
export function registerVolumeAnalyst(){
  const api=window.Vela;
  if(!api?.registerNativeIndicator)throw new Error('Vela native indicator registry is unavailable.');
  if(!api.nativeIndicatorTypes?.().includes(descriptor.type))api.registerNativeIndicator(descriptor);
}
