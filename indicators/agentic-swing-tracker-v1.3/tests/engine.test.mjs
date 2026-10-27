import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {WarningEngine,DEFAULTS,measurements,FEATURES} from '../warning-engine.mjs';
import {label,fit,predict,normalize} from '../reversal-study.mjs';
const START=Date.UTC(2026,9,26,13);
const candles=(prices,volume=100)=>prices.map((p,i)=>({time:START+i*60000,open:p-2,high:p+.5,low:p-2.5,close:p,volume}));
const trend=(n=45)=>candles(Array.from({length:n},(_,i)=>53000+i*3));
const mirror=bs=>bs.map(b=>({...b,open:106000-b.open,high:106000-b.low,low:106000-b.high,close:106000-b.close}));
const feed=(engine,bars)=>bars.map(b=>engine.feed(b));
const observation=(at=START,overrides={})=>({schema:'agentic.swing.warnings.v1',symbol:'CBOT_MINI:MYM1!',featureConfig:'frozen-test-v1',coverage:'111111',observedAt:at,closedCutoff:at,provisional:false,swing:1,side:1,pressure:75,stage:0,close:53000,atr:20,...overrides});

test('rejects invalid clocks, bars, configuration and duplicate closed candles',()=>{
  assert.throws(()=>new WarningEngine({window:0}));assert.throws(()=>new WarningEngine({cadenceMs:1000}));assert.throws(()=>new WarningEngine({tick:0}));
  const e=new WarningEngine();const b=trend()[0];assert.throws(()=>e.feed({...b,high:b.low-1}));assert.throws(()=>e.feed(b,b.time));e.feed(b);assert.throws(()=>e.feed(b));
});
test('healthy delivery has bullish support; unavailable optional data is not a zero vote',()=>{
  const e=new WarningEngine({side:1,extension:20});const s=feed(e,trend()).at(-1);
  assert.ok(s.deliverySupport>=2);assert.equal(s.severity[0],0);assert.equal(s.severity[1],0);assert.equal(s.severity[2],0);assert.equal(s.severity[6],null);assert.equal(s.severity[4],null);assert.equal(s.probability,null);
});
test('speed deterioration and choppy inefficient delivery are measured separately',()=>{
  const rows=candles([...Array.from({length:20},(_,i)=>53000+i*4),53077,53078,53079,53080,53081]);
  const m=measurements(rows,1,53000,DEFAULTS);assert.equal(m.severity[0],1);assert.ok(m.values.speedRatio<.7);
  const chop=candles([...Array.from({length:20},(_,i)=>53000+i*2),53040,53035,53040,53035,53039]).map(b=>({...b,high:b.high+10,low:b.low-10}));
  const cm=measurements(chop,1,53000,DEFAULTS);assert.equal(cm.severity[1],1);assert.ok(cm.values.efficiency<.45);assert.ok(cm.values.overlap>.55);
});
test('rejection, extension, momentum divergence and full-bar volume effort execute',()=>{
  const rows=trend();const b=rows.at(-1);Object.assign(b,{open:b.close,high:b.close+12,low:b.close-1,volume:1000});
  const c={...DEFAULTS,volumeEnabled:true};const m=measurements(rows,1,52900,c,{price:b.close-4,rsi:100});
  assert.equal(m.severity[2],1);assert.equal(m.severity[3],1);assert.equal(m.severity[6],1);assert.ok(m.values.relativeVolume>=1.5);
  const weak=candles([...Array.from({length:20},(_,i)=>53000+i*3),53062,53056,53063,53057,53064,53058,53065,53059,53066,53060,53067,53061,53068,53062,53069]);
  weak.at(-1).high=53075;weak.at(-1).low=53055;
  const dm=measurements(weak,1,53000,DEFAULTS,{price:53070,rsi:100});assert.equal(dm.severity[5],1);
});
test('long/short feature math mirrors without favoring the requested direction',()=>{
  const bars=trend();Object.assign(bars.at(-1),{open:53132,high:53145,low:53128,close:53130});
  const a=measurements(bars,1,53000,DEFAULTS),b=measurements(mirror(bars),-1,53000,DEFAULTS);
  assert.deepEqual(a.severity,b.severity);for(const key of ['speedRatio','efficiency','overlap','rejection','closeLocation','extension'])assert.ok(Math.abs(a.values[key]-b.values[key])<1e-9,key);
});
test('one warning episode persists without repeated START votes and clears on repair',()=>{
  const bars=trend(25);for(let i=0;i<3;i++){const p=bars.at(-1).close;bars.push({time:bars.at(-1).time+60000,open:p+1,high:p+10,low:p-2,close:p,volume:100});}
  const e=new WarningEngine({side:1});feed(e,bars);const starts=e.events.filter(x=>x.kind==='START'&&x.feature==='REJECT');assert.equal(starts.length,1);
  const p=bars.at(-1).close+20,b={time:bars.at(-1).time+60000,open:p-18,high:p+.5,low:p-18.5,close:p,volume:100};e.feed(b);
  assert.equal(e.active[2],null);assert.ok(e.events.some(x=>x.kind==='CLEARED'&&x.feature==='REJECT'&&x.episode===starts[0].seq));
});
test('known-level availability never backfills future declarations',()=>{
  const bars=trend(),e=new WarningEngine({side:1});e.setLevels([{id:'upper',side:'upper',price:53050,knownAt:START+40*60000}],START+40*60000);
  const before=feed(e,bars.slice(0,40)).at(-1);assert.equal(before.severity[4],null);
  const b={...bars[40],open:53045,close:53045,high:53060,low:53040};const after=e.feed(b);assert.equal(after.severity[4],2);
  assert.throws(()=>e.setLevels([{id:'bad',side:'upper',price:53000,knownAt:START+999999}],START));
});
test('unchanged references preserve first receipt while changed references get a new receipt',()=>{
  const e=new WarningEngine({side:1}),level={id:'upper',side:'upper',price:53050,knownAt:START};
  e.setLevels([level],START);e.setLevels([level],START+15000);
  assert.equal(e.levels[0].availableAt,START);
  e.setLevels([{...level,price:53051}],START+30000);
  assert.equal(e.levels[0].availableAt,START+30000);
});
test('zero or missing volume is unavailable and cannot create EFFORT',()=>{
  const e=new WarningEngine({side:1,volumeEnabled:true});const s=feed(e,trend().map(b=>({...b,volume:0}))).at(-1);assert.equal(s.severity[6],null);assert.ok(!e.events.some(x=>x.kind==='START'&&x.feature==='EFFORT'));
});
test('15s snapshots update diagnostics without mutating committed episodes or multiplying evidence',()=>{
  const e=new WarningEngine({side:1,volumeEnabled:true});const bars=trend();feed(e,bars);
  const state=JSON.stringify({events:e.events,active:e.active,rows:e.rows,stage:e.stage,protected:e.protected});const t=bars.at(-1).time+60000,p=bars.at(-1).close;
  const b={time:t,open:p,high:p+12,low:p-2,close:p,volume:5000};
  for(const dt of [0,15000,30000,45000]){const s=e.observe(b,t+dt);assert.equal(s.provisional,true);assert.equal(s.severity[6],null);assert.equal(s.probability,null);}
  assert.equal(e.snapshots,4);assert.equal(e.observe(b,t+46000),null);assert.equal(JSON.stringify({events:e.events,active:e.active,rows:e.rows,stage:e.stage,protected:e.protected}),state);
  assert.throws(()=>e.observe(b,t+60000));assert.throws(()=>e.observe(b,t+47000,{sourceAt:t}));
});
test('data gaps clear active warnings, invalidate anchors and require fresh warmup',()=>{
  const e=new WarningEngine({side:1});const bars=trend();feed(e,bars);const last=bars.at(-1);
  const s=e.feed({...last,time:last.time+180000});assert.equal(s.pressure,null);assert.equal(e.side,0);assert.equal(e.protected,null);assert.ok(e.events.some(x=>x.kind==='DATA_GAP'));assert.ok(e.active.every(x=>x==null));
});
test('appending future bars does not change earlier snapshots or warning packets',()=>{
  const bars=trend(),a=new WarningEngine({side:1}),b=new WarningEngine({side:1});const prefix=feed(a,bars.slice(0,30));const full=feed(b,bars);assert.deepEqual(prefix,full.slice(0,30));
});
test('correlated delivery warnings share a capped family contribution',()=>{
  const e=new WarningEngine({side:1});feed(e,trend());const base={available:true,severity:[1,0,0,0,null,0,null,0],values:{},bullish:0};
  const one=e.snapshot(base,START,false),three=e.snapshot({...base,severity:[1,1,0,0,null,1,null,0]},START,false);assert.equal(one.pressure,three.pressure);assert.equal(three.activeFamilies,1);
});
test('weights are explicit, immutable and cannot turn zero capacity into certainty',()=>{
  const weights=[0,0,0,0,0,0],e=new WarningEngine({side:1,weights});weights[0]=5;assert.equal(e.config.weights[0],0);assert.equal(feed(e,trend()).at(-1).pressure,null);
  assert.throws(()=>new WarningEngine({weights:[1]}));assert.throws(()=>new WarningEngine({weights:[6,1,1,1,1,1]}));
});
test('provisional warning episode keeps its identity until repaired',()=>{
  const e=new WarningEngine({side:1}),bs=trend();feed(e,bs);const at=bs.at(-1).time+60000,p=bs.at(-1).close;
  const b={time:at,open:p,high:p+10,low:p-1,close:p,volume:100};
  const first=e.observe(b,at+1000),second=e.observe(b,at+16000);assert.ok(first.liveEpisodes[2]);assert.equal(first.liveEpisodes[2].id,second.liveEpisodes[2].id);assert.equal(first.liveEpisodes[2].firstSeen,at+1000);
  const repair=e.observe({...b,close:p+9},at+31000);assert.equal(repair.liveEpisodes[2],null);
});
test('event and history capacities are bounded',()=>{
  const e=new WarningEngine({side:1,maxEvents:12,maxBars:40});const bs=candles(Array.from({length:150},(_,i)=>53000+Math.sin(i)*12));feed(e,bs);assert.ok(e.events.length<=12);assert.equal(e.rows.length,40);
});
test('structure requires a known protected pivot; wick alone cannot confirm its break',()=>{
  const e=new WarningEngine({side:1});feed(e,trend());e.protected={price:53100,known:START+10*60000,origin:START};
  let t=e.rows.at(-1).time+60000;
  let s=e.feed({time:t,open:53110,high:53112,low:53095,close:53105,volume:100});assert.ok(s.stage<2);
  t+=60000;s=e.feed({time:t,open:53105,high:53106,low:53088,close:53090,volume:100});assert.equal(s.stage,2);
  t+=60000;s=e.feed({time:t,open:53092,high:53101,low:53087,close:53090,volume:100});assert.equal(s.stage,3);
});
test('automatic local direction changes only after confirmed failure, on the next bar',()=>{
  const e=new WarningEngine(),prices=[...Array.from({length:45},(_,i)=>53000+i*3),53120,53100,53090,53100,53110,53105,53095,53085,53075,53070,53065,53060];
  const results=prices.map((p,i)=>e.feed({time:START+i*60000,open:p+1,high:p+2,low:p-2,close:p,volume:100}));
  const confirm=results.findIndex(x=>x.stage===3);assert.ok(confirm>0);assert.equal(results[confirm].side,1);assert.equal(results[confirm+1].side,-1);assert.ok(results.slice(14,confirm+1).every(x=>x.side===1));
});
test('reversal labels freeze barriers, distinguish continuation and preserve same-bar ambiguity',()=>{
  const o=observation();let b=[{time:START,open:53000,high:53005,low:52975,close:52980}];assert.equal(label(o,b).outcome,true);
  b=[{time:START,open:53000,high:53015,low:52995,close:53010}];assert.equal(label(o,b).outcome,false);
  b=[{time:START,open:53000,high:53015,low:52975,close:53000}];assert.equal(label(o,b).reason,'AMBIGUOUS_BOTH_BARRIERS');
  assert.equal(label({...o,provisional:true},b).reason,'INTRABAR_PATH_UNAVAILABLE');
  assert.equal(label(o,[{...b[0],time:START+60000}]).reason,'DATA_GAP');
  const late=label({...o,observedAt:START+500},[{time:START+60000,open:53000,high:53005,low:52975,close:52980}]);assert.equal(late.eligibleAt,START+60000);assert.equal(late.outcome,true);
});
test('mirrored reversal target and incomplete horizons remain correct',()=>{
  const o=observation(START,{side:-1});const r=label(o,[{time:START,open:53000,high:53025,low:52995,close:53020}]);assert.equal(r.outcome,true);assert.equal(r.target,53020);assert.equal(r.invalidation,52990);
  assert.equal(label(observation(),[]).reason,'HORIZON_UNAVAILABLE');
});
const dataset=()=>Array.from({length:110},(_,day)=>[25,75].map((pressure,i)=>{const at=Date.UTC(2025,0,2+day,15,i*2),yes=day%5<(pressure===75?4:1);return {...observation(at,{pressure}),outcome:yes,resolvedAt:at+60000,definition:{horizonBars:10,downAtr:1,upAtr:.5}};})).flat();
test('probability stays unavailable without independent sessions and successful holdout',()=>{
  assert.equal(fit(dataset().slice(0,10)).status,'INSUFFICIENT_INDEPENDENT_SESSIONS');
  const small=fit(dataset().slice(0,10));assert.equal(predict(small,observation()).probability,null);
});
test('chronological model validates on held-out sessions and predicts only future matching data',()=>{
  const model=fit(dataset());assert.equal(model.status,'VALIDATED_LOCAL_RESEARCH');assert.ok(model.evaluation.brier<model.evaluation.baselineBrier);assert.ok(model.evaluation.calibrationGap<.1);
  const at=model.validatedThrough+86400000;assert.ok(predict(model,observation(at)).probability>.7);
  assert.equal(predict(model,observation(model.validatedThrough)).reason,'NOT_FORWARD_OF_VALIDATION');assert.equal(predict(model,observation(at,{symbol:'OTHER'})).reason,'INSTRUMENT_OR_CONFIG_MISMATCH');
  assert.equal(predict(model,observation(at,{coverage:'111101'})).reason,'INSUFFICIENT_COMPARABLE_SESSIONS');
});
test('study rejects duplicate forecasts, mixed settings and unsupported provenance',()=>{
  const ds=dataset();assert.throws(()=>fit([...ds,ds[0]]));assert.throws(()=>fit([ds[0],{...ds[1],featureConfig:'other'}]));assert.throws(()=>normalize({...observation(),closedCutoff:START+1}));assert.throws(()=>label({...observation(),atr:0},[]));
});
test('a deteriorating holdout withholds the probability instead of blessing its training fit',()=>{
  const ds=dataset().map((r,i)=>i>=154?{...r,outcome:!r.outcome}:r);const m=fit(ds);assert.equal(m.status,'HOLDOUT_DID_NOT_PASS');assert.equal(predict(m,observation(m.validatedThrough+86400000)).probability,null);
});
test('CLI normalizes real stream shape and keeps one first-received closed observation',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'swing-warning-cli-'));
  try{
    const file=path.join(dir,'alerts.ndjson'),closed=observation();
    const payloads=[1000,16000,31000,46000].map(dt=>({...observation(START+dt,{closedCutoff:START,provisional:true}),closed_observation:{...closed,observedAt:START+dt}}));
    await fs.writeFile(file,payloads.map(x=>JSON.stringify(x)).join('\n'));
    const cli=fileURLToPath(new URL('../study-cli.mjs',import.meta.url));const r=spawnSync(process.execPath,[cli,'normalize',file],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);const rows=JSON.parse(r.stdout);assert.equal(rows.length,5);assert.equal(rows.filter(x=>!x.provisional).length,1);assert.equal(rows.find(x=>!x.provisional).observedAt,START+1000);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
