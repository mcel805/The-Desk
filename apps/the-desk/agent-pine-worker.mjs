// Trusted installed Liquidity source only; no user code or network access.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PineEngine} from '@luxalgo/vela-pinets';
import {splitTickerModifier} from 'pinets';
import {installNestedSecurity} from './web/pine-compat/nested-security.mjs';
import {liquidityDisplayModel} from './web/pine-compat/liquidity-display.mjs';
installNestedSecurity();
let input='';for await(const chunk of process.stdin)input+=chunk;
let session;
try{
 const p=JSON.parse(input),source=await fs.readFile(new URL('./web/pine-examples/agentic-liquidity.pine',import.meta.url),'utf8');
 const sourceHash=createHash('sha256').update(source).digest('hex');if(sourceHash!==p.sourceHash)throw Error('Pinned source changed.');
 const normalize=s=>{const value=splitTickerModifier(s).symbol;return value.replace(/^[^:]+:/,x=>x.toLowerCase());};
 const tf=p.pineTimeframe,bars=p.bars,engine=new PineEngine(),prepared=await engine.prepare(source,'agent-liquidity');
 let model;const requests=[];
 await new Promise((resolve,reject)=>{session=engine.execute({prepared,bars,market:{symbol:p.instrument,timeframe:tf,symbolInfo:p.symbolInfo},inputs:{displayView:'Clean',liqLen:p.settings.pivotStrength,sourceBars:p.settings.sourceBars,masterBars:p.settings.masterBars},mode:'static',historyState:'complete',visibleRange:{left:bars[0].time,right:bars.at(-1).time},fetchSeries:async(symbol,timeframe,range)=>{
  if(normalize(symbol)!==p.instrument)throw Error('Secondary source changed instrument.');
  const key=String(timeframe).replace(/^1D$/,'D'),rows=p.series[key];if(!rows?.length)throw Error('Required source history unavailable: '+key);
  const filtered=rows.filter(b=>(range?.to==null||b.time<=range.to)&&(range?.from==null||b.time>=range.from));
  if(!filtered.length)throw Error('Required source history has no matching range.');
  requests.push({instrument:p.instrument,timeframe:key,requested:range?.limit||null,returned:filtered.length,first:filtered[0].time,last:filtered.at(-1).time});return range?.limit?filtered.slice(-range.limit):filtered;
 }},{onModel:m=>{model=liquidityDisplayModel(m);},onError:reject,onDone:resolve});});
 if(!model)throw Error('No Liquidity model.');
 const levels=[];for(const l of model.lines||[]){const active=l.extend==='right'||l.xloc==='bar_time'&&Number(l.x2)>bars.at(-1).time;
  if(!active||l.y1!==l.y2||l.style!=='solid'||l.width!==2||!Number.isFinite(l.y1)||l.y1<=0||!Number.isFinite(Number(l.x1)))continue;
  const id='liquidity:'+l.xloc+':'+l.x1+':'+l.y1;if(!levels.some(x=>x.id===id))levels.push({id,price:String(l.y1),source:'liquidity',label:'Liquidity pool · origin '+l.x1});
 }
 process.stdout.write(JSON.stringify({levels,sourceHash,requests,liquidityReady:true}));
}catch(e){process.stderr.write(String(e.message));process.exitCode=1;}finally{session?.stop();}
