// Execute the user's 1.7 study on completed candles only, using the same Pine
// engine as Desk. Inputs and outputs are bounded; no broker objects enter here.
import fs from 'node:fs/promises';
import {PineEngine} from '@luxalgo/vela-pinets';
const input=JSON.parse(await new Promise((resolve,reject)=>{let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>resolve(s));process.stdin.on('error',reject);}));
const bars=input.bars, span=input.swing_minutes*60000;
if(!Array.isArray(bars)||!bars.length||![1,2,3,5,15,30].includes(input.swing_minutes)||!Number.isFinite(input.tick)||input.tick<=0)throw Error('Invalid swing input');
if(bars.some((b,i)=>!Number.isSafeInteger(b.time)||b.time%60000||i&&b.time!==bars[i-1].time+60000||!['open','high','low','close','volume'].every(k=>Number.isFinite(b[k]))))throw Error('Invalid or gapped 1m bars');
const source=await fs.readFile(new URL('./web/pine-examples/swing-tracker-1.7.pine',import.meta.url),'utf8');
const engine=new PineEngine(),prepared=await engine.prepare(source,'desk-swing-v17');
function aggregate(){const out=[];for(const b of bars){const t=Math.floor(b.time/span)*span;let p=out.at(-1);if(!p||p.time!==t){p={...b,time:t,count:1};out.push(p)}else{p.high=Math.max(p.high,b.high);p.low=Math.min(p.low,b.low);p.close=b.close;p.volume+=b.volume;p.count++}}return out.filter(b=>b.count===input.swing_minutes).map(({count,...b})=>b)}
let model,session;const warnings=[];
try{await new Promise((resolve,reject)=>{session=engine.execute({prepared,bars,fetchSeries:async(symbol,tf)=>{if(String(tf)!==String(input.swing_minutes))throw Error('Unexpected requested timeframe');return aggregate()},market:{symbol:input.symbol,timeframe:'1',chartStyle:'candles',symbolInfo:{ticker:input.symbol.split(':').at(-1),tickerid:input.symbol,timezone:'UTC',mintick:input.tick,minmov:1,pricescale:1/input.tick,type:'crypto'}},inputs:{swingTf:String(input.swing_minutes),showHistory:false,showScoreHistory:false,showAbc:false,showChannel:false,showRange:false,showWarningMarks:true},mode:'static',historyState:'complete'},{onModel:m=>{model=m},onDone:resolve,onError:reject,onWarning:w=>warnings.push(String(w))})});if(!model||warnings.length)throw Error('Pine evaluation unavailable: '+warnings.join('; '));
const map=new Map(model.series.map(s=>[s.title,s.points]));const get=(name)=>{const points=map.get(name);if(!points)throw Error('Missing plot: '+name);const p=points.at(-1);return p&&Number.isFinite(p.value)?p.value:null};
const stage=get('ABC stage 1 A 2 B 3 C 4 C beyond A 5 invalid 6 complete 7 expired');
const point=(name)=>({price:get(name+' price'),origin:get(name+' origin time'),known:get(name==='O'?'O recognized time':name==='C'?'C start recognized time':name+' recognized time')});
const contributionNames=['Volume','EMA','SAR','Candles','Geometry','Structure','Slow chop','Divergence'];
const rawWeights=contributionNames.map(n=>get('Weight · '+n));
const scoreLabel=(model.labels||[]).find(l=>typeof l.text==='string'&&/^(UP|DOWN) LEG ·/.test(l.text)&&typeof l.tooltip==='string');
const scoreNames=['Volume exhaustion','EMA','SAR opposing','Candle rejection','Geometry break','Structure break','Slow / chop','Momentum divergence'];
const scoreLines=scoreLabel?.tooltip?.split('\n')||[];
const weights=scoreNames.map((name,i)=>{const line=scoreLines.find(x=>x.startsWith(name+' · '));if(!line||line.endsWith('N/A'))return null;const match=line.match(/ · (\d+)\/(\d+)$/);if(!match||Number(match[1])!==rawWeights[i])throw Error('Inconsistent score breakdown');return rawWeights[i]});

const names=['Volume exhaustion','EMA','SAR','Candlestick','Geometry','Structure','Slow / chop','Momentum divergence'];
const events=(model.labels||[]).filter(l=>l.text==='×'&&typeof l.tooltip==='string').flatMap(l=>{const n=names.findIndex(x=>l.tooltip.startsWith(x+' warning · root #'));const b=bars[l.x];const root=Number(l.tooltip.match(/root #(\d+)/)?.[1]);if(n<0||!b||!Number.isFinite(l.y)||!Number.isSafeInteger(root))return [];return [{family:n,root,bar:b.time,known:b.time+60000,scope:'RECONSTRUCTED',price:l.y>b.high?b.high:l.y<b.low?b.low:b.close,detail:l.tooltip}]});
const out={version:'desk-house-abc.1',source:'Agentic Swing Tracker 1.7',cutoff:bars.at(-1).time+60000,history_start:bars[0].time,history_bars:bars.length,parent_timeframe:input.swing_minutes,abc:{id:get('ABC ID'),root_id:get('ABC root ID'),stage,points:{o:point('O'),a:point('A'),b:point('B'),c:point('C')},poi:null,poi_status:'UNAVAILABLE',poi_reason:'No manual or linked 1.7 POI source is supplied'},exhaustion:{root_id:get('Warning assessed root'),side:get('Warning assessed direction'),score:get('Warning weight 0–14'),available:get('Warning available weight /14'),tier:get('Warning tier 0 low 1 caution 2 weakening 3 opposition'),contributions:weights,mask:get('Warning evidence bitmask V E S K G M T D'),relative_volume:get('Relative volume / prior full-bar baseline')},events};
console.log(JSON.stringify(out));
}finally{session?.stop()}
