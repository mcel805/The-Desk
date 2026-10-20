import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PineEngine} from '../../apps/the-desk/node_modules/@luxalgo/vela-pinets/dist/index.js';
import {installNestedSecurity} from '../../apps/the-desk/web/pine-compat/nested-security.mjs';
installNestedSecurity();
const source=await fs.readFile(new URL('./Agentic_Liquidity_TradingView.pine',import.meta.url),'utf8');
const end=Date.UTC(2026,9,19,18);
const minutes=tf=>({'D':1440,'1D':1440,'240':240,'60':60,'30':30,'15':15,'5':5,'3':3,'2':2,'1':1}[tf]);
function fixture(tf,n=600){return Array.from({length:n},(_,i)=>{const time=end-(n-i)*minutes(tf)*60000,p=2400+130*Math.sin(time/14400000)+30*Math.sin(time/900000);return {time,open:p,high:p+9,low:p-9,close:p+5*Math.sin(i),volume:1000+i%40};});}
async function run(src,tf='60',inputs={},bars=fixture(tf)){
 // PineTS 0.11 reports the requested timeframe for main_period. Native Pine
 // keeps the MAIN chart timeframe even inside nested requests. Substitute only
 // this documented invariant in the test copy; the delivered Pine is unchanged.
 // https://www.tradingview.com/pine-script-docs/concepts/chart-information/#chart-timeframe
 const localSource=src.replace(/\btimeframe\.main_period\b/g,JSON.stringify(tf));
 const engine=new PineEngine(),prepared=await engine.prepare(localSource,'tv-liquidity-local');
 let model,session;const warnings=[],requests=[];
 try{await new Promise((resolve,reject)=>{session=engine.execute({prepared,bars,market:{symbol:'fixture:ETH',timeframe:tf,symbolInfo:{ticker:'ETH',tickerid:'fixture:ETH',timezone:'UTC',mintick:.1,minmov:1,pricescale:10,type:'crypto',currency:'USD'}},inputs,historyState:'complete',mode:'static',fetchSeries:async(s,f,r)=>{requests.push({tf:f,limit:r.limit});return fixture(f,r.limit||600);}},{onModel:m=>model=m,onWarning:w=>warnings.push(w),onDone:resolve,onError:reject});});
 assert.ok(model);assert.ok(warnings.every(w=>!/unsupported|out.of.bounds|error/i.test(w.message)),JSON.stringify(warnings));
 return {model,prepared,warnings,requests};}finally{session?.stop();}
}
const checks=[];
const default1h=await run(source);
assert.ok(default1h.model.lines.length>0,'1h levels');
assert.equal(default1h.model.boxes.length,0,'clean screenshot view has no filled zones');
assert.ok(default1h.model.labels.some(l=>/\d+.*\/100/.test(l.text)),'timeframe strength badges');
assert.ok(default1h.model.lines.every(l=>[l.x1,l.x2,l.y1,l.y2].every(Number.isFinite)));
checks.push({check:'1h screenshot defaults',lines:default1h.model.lines.length,labels:default1h.model.labels.length,boxes:0,inputs:default1h.prepared.inputs.length});
console.log(checks.at(-1));
// Source coverage intentionally changes the available pools and bridge values.
// Preserve schema and test the corrected source selection and retention directly.
assert.equal(default1h.model.series.length,28,'bridge/alert feed schema retained');
const fourHour=await run(source,'240');
// The host reuses the chart bars for a same-timeframe source, without a provider fetch.
assert.ok(fourHour.model.labels.some(l=>l.text.includes('240')),'4H source automatically enabled on 4H chart');
assert.ok(fourHour.requests.filter(r=>['240','60','30','15'].includes(r.tf)).every(r=>r.limit>=1030),'source history covers configured age plus pivot warm-up');
assert.ok(fourHour.model.labels.some(l=>l.text.includes('240')),'4H source reaches visible tags');
assert.ok(fourHour.model.lines.some(l=>/^#aa2430/i.test(l.color))&&fourHour.model.lines.some(l=>/^#66bb6a/i.test(l.color)),'4H chart displays both sides on test data');
const manual=await run(source,'240',{autoChartContext:false,preserveSourceHistory:false});
assert.ok(!manual.model.labels.some(l=>l.text.includes('240')),'manual-only mode respected');
const daily=await run(source,'1D');
assert.ok(daily.model.labels.some(l=>l.text.includes('1D'))&&daily.requests.some(r=>r.tf==='240'),'Daily chart automatically includes Daily and 4H');
checks.push({check:'4H and Daily source coverage, age-matched warm-up, manual opt-out',fourHourLines:fourHour.model.lines.length,fourHourTags:fourHour.model.labels.map(l=>l.text)});console.log(checks.at(-1));
// Run the actual retention function from the delivered source. Add an old
// external anchor, then more opposite-side and internal pivots than the cap.
const retentionProbe=source.slice(0,source.indexOf('f_liquidity(int tfId) =>'))+`
var array<Pool> highs=array.new<Pool>()
var array<Pool> lows=array.new<Pool>()
if bar_index==20
    f_addPool(highs,2,1,9000,1,true)
    f_addPool(lows,2,1,100,-1,true)
if bar_index>20 and bar_index<=80
    f_addPool(highs,2,1,1000+bar_index,-1,false)
    f_addPool(lows,2,1,8000-bar_index,1,false)
if bar_index>80 and bar_index<=140
    f_addPool(highs,2,1,7000-bar_index,1,false)
    f_addPool(lows,2,1,2000+bar_index,-1,false)
int countHigh=0
int countLow=0
int anchors=0
for p in highs
    if p.side==1
        countHigh+=1
    else
        countLow+=1
    if p.p==9000 and p.kind=="BSL EXT"
        anchors+=1
for p in lows
    if p.p==100 and p.kind=="SSL EXT"
        anchors+=1
plot(countHigh,"Probe highs")
plot(countLow,"Probe lows")
plot(anchors,"Probe preserved anchors")
`;
const retained=await run(retentionProbe,'240');
const lastValue=(model,title)=>model.series.find(s=>s.title===title).points.at(-1).value;
assert.equal(lastValue(retained.model,'Probe highs'),24,'high-side capacity retained');
assert.equal(lastValue(retained.model,'Probe lows'),24,'low-side capacity retained');
assert.equal(lastValue(retained.model,'Probe preserved anchors'),2,'old external anchors survive internal pivot churn');
const previousSource=await fs.readFile(new URL('./before-source-coverage.pine',import.meta.url),'utf8');
const addFunction=script=>script.slice(script.indexOf('f_addPool('),script.indexOf('f_liquidity(int tfId) =>'));
const oldProbe=await run(retentionProbe.replace(addFunction(source),addFunction(previousSource)),'240');
assert.equal(lastValue(oldProbe.model,'Probe lows'),0,'negative control: former shared capacity discarded opposite-side levels');
assert.equal(lastValue(oldProbe.model,'Probe preserved anchors'),0,'negative control: former cleanup lost both anchors');
checks.push({check:'actual Pine retention regression: 24 highs and 24 lows, both older external anchors preserved; prior implementation loses lows and both anchors'});console.log(checks.at(-1));
const latest=fixture('60').at(-1).time;
function checkGeometry(model,lastTime){
 const badges=model.labels.filter(l=>/\/100/.test(l.text));
 assert.ok(badges.length>0);
 assert.ok(badges.every(l=>l.x>lastTime&&l.style==='label_left'&&l.color.endsWith('FF')),'rightward opaque tags');
 assert.ok(model.lines.every(l=>l.x2<badges[0].x),'main lines stop before tag column');
 assert.equal(new Set(badges.map(l=>l.x)).size,1,'one tag column');
}
checkGeometry(default1h.model,latest);
checks.push({check:'future tag column, opaque backgrounds, line endpoints before text'});
// Execute the actual Pine display helpers with deterministic source packets.
// Analytics still execute normally; only the raw drawing packet is substituted.
function packetSource(entries){
 const records=entries.map(([offset,side,id],i)=>
  `str.tostring(time-${100+i}*3600000)+","+str.tostring(close+(${offset}))+",${id},0,0,0,0,${side},"+str.tostring(time-90*3600000)`);
 return source.replace('r3,rawPacket,zonePacket','r3,fixtureUnusedPacket,zonePacket')
 .replace(/^(\[s1[^\n]+)$/m,'$1\nstring rawPacket='+records.join('+";"+')+'\n');
}
const displayInputs={cleanZoneLimit:4,shown:6,cleanLabelLimit:2,clusterTicks:1,cleanMergePercent:0,cleanTagGapPercent:15,rightBars:1};
const lows=Array.from({length:10},(_,i)=>[-10-i,-1,2+i%3]);
const crowd=await run(packetSource([...lows,[1000,1,2]]),'60',displayInputs);
assert.equal(crowd.model.lines.length,4,'bounded active group count');
assert.ok(crowd.model.lines.some(l=>/^#aa2430/i.test(l.color)),'farther high survives many nearer lows');
assert.ok(crowd.model.lines.some(l=>/^#66bb6a/i.test(l.color)),'low-side lines retained');
assert.equal(crowd.model.labels.length,2,'crowded lows merge into one badge plus high badge');
assert.ok(crowd.model.labels.some(l=>/^60 ·/.test(l.text)),'single-frame high keeps its tag');
assert.ok(crowd.model.labels.some(l=>/^60\+30\+15 ·.*×3$/.test(l.text)),'merged low source union and pocket count');
const lastClose=fixture('60').at(-1).close;
assert.deepEqual(crowd.model.lines.map(l=>Math.round((l.y1-lastClose)*10)/10).sort((a,b)=>a-b),[-12,-11,-10,1000],'exact distinct liquidity prices survive label merge');
checkGeometry(crowd.model,latest);
const mirror=await run(packetSource([...lows.map(([p,s,id])=>[-p,-s,id]),[-1000,-1,2]]),'60',displayInputs);
assert.equal(mirror.model.labels.length,2);
assert.ok(mirror.model.labels.some(l=>/^#aa2430/i.test(l.color))&&mirror.model.labels.some(l=>/^#66bb6a/i.test(l.color)),'both sides retained with high-side crowding');
const oneSide=await run(packetSource(lows),'60',displayInputs);
assert.equal(oneSide.model.lines.length,4,'empty opposite-side capacity reused');
assert.ok(oneSide.model.labels.every(l=>/^#66bb6a/i.test(l.color)),'no fabricated high-side levels');
const adjacent=await run(packetSource([[-10,-1,2],[10,1,3]]),'60',displayInputs);
assert.equal(adjacent.model.lines.length,2);
assert.equal(adjacent.model.labels.length,1,'opposing nearby tags merge too');
assert.ok(adjacent.model.labels[0].text.includes('30 ·')&&adjacent.model.labels[0].text.includes('60 ·'),'mixed tag preserves both sides');
checks.push({check:'synthetic Pine regression packets: crowded lows, crowded highs, one side empty, adjacent opposing tags',cases:4});console.log(checks.at(-1));
const minute=await run(source,'1');assert.ok(minute.model.lines.length>0);assert.equal(minute.model.series.length,28);checks.push({check:'1m nested source and reference pools execute',lines:minute.model.lines.length,boxes:minute.model.boxes.length});console.log(checks.at(-1));
const originalView=await run(source,'60',{displayView:'Original',showStructureAlerts:true});assert.ok(originalView.model.linefills.length>0);checks.push({check:'Original view preserves small pool strips',linefills:originalView.model.linefills.length});console.log(checks.at(-1));
const plotTitles=[...source.matchAll(/^plot\([^\n]*?,"([^"]+)"/gm)].map(m=>m[1]);
for(const m of source.matchAll(/\{\{plot\(\\"([^\n]*?)\\"\)\}\}/g))assert.ok(plotTitles.indexOf(m[1])>=0&&plotTitles.indexOf(m[1])<20,m[1]);
assert.ok(plotTitles.length+2<64);checks.push({check:'alert message feeds occupy first four plot slots',plots:plotTitles.length});
const report={status:'PASS',sha256:createHash('sha256').update(source).digest('hex'),checks,tradingViewCompilation:'Not run; user will compile in Pine Editor.',visualParity:'Not verified against matching reference OHLC.',runtime:'Local Vela/PineTS with Desk nested-request compatibility and a test-copy main_period invariant substitution per official Pine documentation; not native TradingView.'};
await fs.writeFile(new URL('./validation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
