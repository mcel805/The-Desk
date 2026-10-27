import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {PineEngine} from '../../../apps/the-desk/node_modules/@luxalgo/vela-pinets/dist/index.js';
export const source=await fs.readFile(new URL('../Agentic_Swing_Tracker_v1_3.pine',import.meta.url),'utf8');
const engine=new PineEngine();export const prepared=await engine.prepare(source,'swing-tracker-v13');
export const fixture=()=>Array.from({length:160},(_,i)=>{const p=53000+60*Math.sin(i/9)+18*Math.sin(i/2.3);return {time:Date.UTC(2026,9,22,14)+i*60000,open:p-2*Math.sin(i),high:p+5,low:p-5,close:p,volume:100};});
export async function run({bars=fixture(),inputs={},tf='1',script=prepared}={}){let session,model;const warnings=[];try{await new Promise((resolve,reject)=>{session=engine.execute({prepared:script,bars,market:{symbol:'fixture:MYM',timeframe:tf,chartStyle:'candles',symbolInfo:{ticker:'MYM',tickerid:'fixture:MYM',timezone:'America/Chicago',mintick:1,minmov:1,pricescale:1,type:'futures',currency:'USD'}},inputs:{pointValueOverride:.5,swingTimeframe:'1',...inputs},mode:'static',historyState:'complete'},{onModel:m=>model=m,onDone:resolve,onError:reject,onWarning:w=>warnings.push(w)});});assert.ok(model);assert.deepEqual(warnings,[]);return model;}finally{session?.stop();}}
export const rows=(m,t)=>{const s=m.series.find(s=>s.title===t);assert.ok(s,t);return s.points.map(p=>p.value);};
export async function basePrepared(){return engine.prepare(await fs.readFile(new URL('../baseline/Agentic_Swing_Tracker_v1_2.pine',import.meta.url),'utf8'),'baseline-v12');}
