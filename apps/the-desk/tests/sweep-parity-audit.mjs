import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {sweepMicroReference} from './helpers/sweep-micro-reference.mjs';
import {PineEngine} from '@luxalgo/vela-pinets';
import {installNestedSecurity} from '../web/pine-compat/nested-security.mjs';
installNestedSecurity();
const source=await fs.readFile('web/pine-examples/agentic-sweep.pine','utf8');
const [inputPath,tickText,outputPath]=process.argv.slice(2);
if(!inputPath||!Number.isFinite(Number(tickText))||Number(tickText)<=0)throw Error('Usage: node tests/sweep-parity-audit.mjs <provider-snapshot.json> <tick> [output.json]');
const tick=Number(tickText),data=JSON.parse(await fs.readFile(inputPath,'utf8')),market=data.instrument;
if(!market||data.timeframe!=='1m'||!Number.isFinite(data.as_of))throw Error('A provenance-bearing 1m provider snapshot is required');
const bars=data.bars.filter(b=>b.time+60000<=data.as_of);
const e=new PineEngine(),prepared=await e.prepare(source+'\nplot(phOk?1:0,"AUDIT PH")\nplot(plOk?1:0,"AUDIT PL")\nplot(excursion,"AUDIT MIN")\nplot(array.size(pivots),"AUDIT PIVOTS")\nplot(phRaw,"AUDIT RAW HIGH")\nplot(leftHigh,"AUDIT LEFT HIGH")\nplot(rightHigh,"AUDIT RIGHT HIGH")','audit');
function aggregate(tf){const ms=+tf*60000,out=[];for(const b of bars){const t=Math.floor(b.time/ms)*ms,p=out.at(-1);if(!p||p.time!==t)out.push({...b,time:t});else{p.high=Math.max(p.high,b.high);p.low=Math.min(p.low,b.low);p.close=b.close;p.volume+=b.volume;}}return out;}
let model,session;
await new Promise((resolve,reject)=>{session=e.execute({prepared,bars,fetchSeries:async(_,tf)=>aggregate(tf),market:{symbol:market,timeframe:'1',chartStyle:'candles',symbolInfo:{mintick:tick,pricescale:Math.round(1/tick),minmov:1,type:'crypto',timezone:'UTC'}},inputs:{},mode:'static',historyState:'complete'},{onModel:m=>model=m,onError:reject,onDone:resolve});});session.stop();
const v=t=>model.series.find(s=>s.title===t).points.map(p=>p.value);
const actualPH=v('AUDIT PH'),actualPL=v('AUDIT PL');const mismatches=[];let expectedPH=0,expectedPL=0;
for(let i=2;i<bars.length;i++){const a=bars[i-2],b=bars[i-1],c=bars[i];const ph=b.high>a.high&&b.high>c.high,pl=b.low<a.low&&b.low<c.low;expectedPH+=+ph;expectedPL+=+pl;if(+ph!==actualPH[i]||+pl!==actualPL[i])mismatches.push({i,ph,pl,actualPH:actualPH[i],actualPL:actualPL[i],highs:[a.high,b.high,c.high],raw:v('AUDIT RAW HIGH')[i],left:v('AUDIT LEFT HIGH')[i],right:v('AUDIT RIGHT HIGH')[i]});}
const ref=sweepMicroReference(bars,{tick});
assert.deepEqual(actualPH,ref.highPivots);assert.deepEqual(actualPL,ref.lowPivots);assert.deepEqual(v('Setup event direction'),ref.setupSides);
console.log(JSON.stringify({referenceSetupMatch:true,market,bars:bars.length,from:new Date(bars[0].time).toISOString(),to:new Date(bars.at(-1).time).toISOString(),expectedPH,expectedPL,actualPH:actualPH.filter(Boolean).length,actualPL:actualPL.filter(Boolean).length,setups:v('Setup confirmed now').filter(x=>x===1).length,sweeps:v('Sweep observed now').filter(x=>x===1).length,mismatches:mismatches.slice(0,8),mismatchCount:mismatches.length,threshold:v('AUDIT MIN').slice(-5),lines:model.lines.length}));
if(outputPath)await fs.writeFile(outputPath,JSON.stringify({instrument:market,timeframe:data.timeframe,as_of:data.as_of,tick,bars,model}));
