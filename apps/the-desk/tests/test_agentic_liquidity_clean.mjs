import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PineEngine} from '@luxalgo/vela-pinets';
import {installNestedSecurity} from '../web/pine-compat/nested-security.mjs';
installNestedSecurity();
const source=await fs.readFile(new URL('../web/pine-examples/agentic-liquidity.pine',import.meta.url),'utf8').then(s=>s.replace(/\r\n/g,'\n'));
const reference=await fs.readFile(new URL('../web/pine-examples/agentic-liquidity-reference.pine',import.meta.url),'utf8');
const end=Date.UTC(2026,9,18,17),minutes=tf=>({'1D':1440,'D':1440,'240':240,'60':60,'30':30,'15':15,'5':5,'3':3,'1':1}[tf]);
const fixture=(tf,n=300)=>Array.from({length:n},(_,i)=>{const time=end-(n-i)*minutes(tf)*60000,p=81000+250*Math.sin(time/14400000)+50*Math.sin(time/900000);return {time,open:p,high:p+15,low:p-15,close:p+5,volume:1000};});
async function run(src=source,{tf='60',inputs={},bars=fixture(tf)}={}){
 const engine=new PineEngine(),prepared=await engine.prepare(src,'clean-contract');let session,model;const warnings=[],calls=[];
 try{await new Promise((resolve,reject)=>{session=engine.execute({prepared,bars,market:{symbol:'fixture:BTC',timeframe:tf,symbolInfo:{tickerid:'fixture:BTC',mintick:1,type:'crypto'}},inputs,mode:'static',historyState:'complete',fetchSeries:async(_,tf,r)=>{calls.push(tf);return fixture(tf,r.limit||300);}},{onModel:m=>model=m,onWarning:w=>warnings.push(w),onDone:resolve,onError:reject});});return {model,prepared,warnings,calls,context:await session.getContext(['variables'])};}finally{session?.stop();}
}
const normalized=value=>JSON.parse(JSON.stringify(value,(k,v)=>['id','title','shorttitle'].includes(k)?undefined:typeof v==='string'&&/^#[0-9a-f]{6,8}$/i.test(v)?v.toUpperCase():v));
test('Original view retains original calculations and geometry for the same source selections',async()=>{
 const a=await run(reference),b=await run(source,{inputs:{displayView:'Original',use15:false}});
 for(const key of ['series','lines','boxes','labels','linefills','polylines','tables'])assert.deepEqual(normalized(b.model[key]),normalized(a.model[key]),key);
});
for(const tf of ['1','5','15','30','60','240','1D'])test(`Clean view on ${tf}: solid 2px source prices, bounded pockets and no swept strips`,async()=>{
 const {model,prepared,calls,warnings,context}=await run(source,{tf,inputs:{showStructureAlerts:false,showReference5:false}});
 assert.equal(prepared.inputs.length,86);assert.equal(model.inputValues.displayView,'Clean');assert.equal(model.inputValues.use15,true);
 assert.ok(tf==='15'||calls.includes('15'));assert.equal(model.series.length,28);assert.equal(model.linefills.length,0);
 const active=context.variables.rawPacket.split(';').map(r=>r.split(',').map(Number)).filter(r=>!r[3]&&!r[6]);
 assert.ok(model.lines.length>0);assert.ok(model.lines.length<=48);assert.ok(model.boxes.length<=38);assert.ok(model.labels.length<=model.lines.length);assert.ok(!("cleanLabelLimit" in model.inputValues));
 for(const line of model.lines){assert.equal(line.width,2);assert.equal(line.style,'solid');assert.equal(line.y1,line.y2);assert.ok(active.some(r=>r[1]===line.y1&&r[0]===line.x1),'line stays on an actual retained source pivot');assert.equal(line.x2,end+12*minutes(tf)*60000);}
 assert.ok(model.boxes.every(b=>[b.left,b.right,b.top,b.bottom].every(Number.isFinite)&&b.top>=b.bottom));
 assert.ok(model.labels.every(l=>/^\d+\/100$/.test(l.text)));
 assert.ok(warnings.every(w=>!/unsupported|error|out.of.bounds/i.test(w.message)));
});
// Exercise the actual Pine grouping/assignment/scoring helpers independently of market coincidence.
const section=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const helperSource=`//@version=6\nindicator("Clean invariants",overlay=true)\nfloat tick=1\nint clusterTicks=3\nfloat cleanMergePercent=0\nint strengthTicks=8\nfloat cleanApproachPercent=5\nfloat cleanBuildHalf=1\nfloat cleanBuildWeight=70\nfloat strengthHalf=3\nfloat weightD=16\nfloat weight4=8\nfloat weight1=4\nfloat weight30=2\nfloat weight15=1\nfloat weight5=0.5\nfloat weightM=0.25\nstring tfD="1D"\nstring tf4="240"\nstring tf1="60"\nstring tf30="30"\nstring tf15="15"\nstring tf5="5"\n${section('type Pool\n','type PoolPacketCache')}${section('type SmallPool\n','// Literal threshold')}${section('f_weight(int id)','f_packZones(')}${section('f_sortPools(','f_cluster(')}${section('type CleanGroup\n','float cleanAtr=')}`;
test('convergence retains its ordering while buildup dominates and elapsed time adds no evidence',async()=>{
 const body=`
plot(f_cleanConvergence(28,7),"triple")
plot(f_cleanConvergence(12,6),"60+30")
plot(f_cleanConvergence(24,3),"30+15")
plot(f_cleanBuild(0,0),"empty")
plot(f_cleanBuild(1,0),"one")
plot(f_cleanBuild(3,0),"three")
plot(f_cleanScore(f_cleanConvergence(24,3),f_cleanBuild(3,0)),"builtLowerTF")
plot(f_cleanScore(f_cleanConvergence(28,7),f_cleanBuild(0,0)),"emptyHigherTF")`;
 const {model}=await run(helperSource+body,{bars:fixture('60',20)}),p=Object.fromEntries(model.series.map(s=>[s.title,s.points.at(-1).value]));
 assert.ok(p.triple>p['60+30']&&p['60+30']>p['30+15']);assert.equal(p.empty,0);assert.equal(p.one,50);assert.equal(p.three,75);
 assert.ok(p.builtLowerTF>p.emptyHigherTF,'price buildup can outweigh higher-timeframe convergence');
 assert.ok(Math.abs(p.builtLowerTF-70.714285714)<1e-7);
});
test('groups reject price chaining and opposite-side merging; each unswept small pool belongs to one nearest same-side group',async()=>{
 const body=`
array<Pool> a=array.new<Pool>()
array.push(a,Pool.new(0,1000,100,1,2,"",0,false))
array.push(a,Pool.new(0,2000,102,1,3,"",0,false))
array.push(a,Pool.new(0,3000,104,1,4,"",0,false))
array.push(a,Pool.new(100,4000,101,1,2,"",0,false))
array.push(a,Pool.new(0,1000,100,-1,2,"",0,false))
array<CleanGroup> groups=f_cleanGroups(a)
array<SmallPool> smalls=array.new<SmallPool>()
array.push(smalls,SmallPool.new(0,1000,2000,0,103.5,1,104))
array.push(smalls,SmallPool.new(0,1000,2000,0,100,-1,99))
array.push(smalls,SmallPool.new(0,1000,2000,0,102,1,103,true))
array<bool> matched=f_cleanAssign(groups,smalls,90000000)
CleanGroup low=array.get(groups,0)
CleanGroup first=array.get(groups,1)
CleanGroup second=array.get(groups,2)
plot(array.size(groups),"groups")
plot(first.hi-first.lo,"span")
plot(first.born,"confirmed")
plot(first.sourceCount-f_members(first.mask),"repeats")
plot(f_members(first.mask),"distinctFrames")
plot(first.smallCount,"firstSmall")
plot(second.smallCount,"nearestSmall")
plot(low.smallCount,"lowSmall")
plot(array.get(matched,2)?1:0,"sweptMatched")
array<CleanGroup> none=array.new<CleanGroup>()
array<bool> empty=f_cleanAssign(none,smalls,90000000)
plot(array.size(empty),"emptySafe")`;
 const {model}=await run(helperSource+body,{bars:fixture('60',20)}),p=Object.fromEntries(model.series.map(s=>[s.title,s.points.at(-1).value]));
 assert.equal(p.groups,3);assert.equal(p.span,2);assert.equal(p.confirmed,4000);assert.equal(p.repeats,1);assert.equal(p.distinctFrames,2);assert.equal(p.firstSmall,0);assert.equal(p.nearestSmall,1);assert.equal(p.lowSmall,1);assert.equal(p.sweptMatched,0);assert.equal(p.emptySafe,3);
});
test('hiding clean presentation preserves analytical feeds; all new inputs are persisted by the existing model',async()=>{
 const a=await run(),b=await run(source,{inputs:{showBands:false,showPockets:false,showSmallPools:false,cleanTags:false,showStructureAlerts:false}});
 assert.equal(b.model.boxes.length,0);assert.equal(b.model.labels.length,0);assert.deepEqual(normalized(a.model.series),normalized(b.model.series));
 assert.ok('cleanMergePercent' in a.model.inputValues);assert.ok('cleanApproachPercent' in a.model.inputValues);
});

test('unchanged price evidence gains nothing from waiting longer',async()=>{
 const body=`
array<Pool> levels=array.new<Pool>()
array.push(levels,Pool.new(0,0,100,1,2,"",0,false))
array<SmallPool> smalls=array.new<SmallPool>()
array.push(smalls,SmallPool.new(1,2,3,0,101,1,102))
array<CleanGroup> fresh=f_cleanGroups(levels)
array<CleanGroup> later=f_cleanGroups(levels)
array<bool> assigned=f_cleanAssign(fresh,smalls,100)
array<bool> same=f_cleanAssign(later,smalls,864000000)
CleanGroup a=array.get(fresh,0)
CleanGroup b=array.get(later,0)
plot(a.smallUnits,"fresh")
plot(b.smallUnits,"later")`;
 const {model}=await run(helperSource+body,{bars:fixture('60',20)}),p=Object.fromEntries(model.series.map(s=>[s.title,s.points.at(-1).value]));
 assert.equal(p.fresh,1);assert.equal(p.later,p.fresh);
});
test('confirmed inner highs and lows build eligible outer lines without merging or recursively transferring scores',async()=>{
 const body=`
array<Pool> levels=array.new<Pool>()
array.push(levels,Pool.new(0,100,1000,1,3,"",0,false))
array.push(levels,Pool.new(0,100,1000,1,4,"",0,false))
array.push(levels,Pool.new(200,300,980,1,2,"",0,false))
array.push(levels,Pool.new(200,300,980,1,3,"",0,false))
array.push(levels,Pool.new(200,300,980,1,4,"",0,false))
array.push(levels,Pool.new(400,500,960,1,4,"",0,false))
array.push(levels,Pool.new(0,100,800,-1,2,"",0,false))
array.push(levels,Pool.new(200,300,820,-1,4,"",0,false))
array<CleanGroup> groups=f_cleanGroups(levels)
f_cleanLadder(groups,1000)
for g in groups
    if g.lo==1000
        plot(g.ladderCount,"outerHighCount")
        plot(g.ladderUnits,"outerHighUnits")
        plot(f_cleanScore(f_cleanConvergence(g.mask,g.weight),f_cleanBuild(g.smallUnits+g.ladderUnits,0)),"outerHighScore")
    if g.lo==980
        plot(g.ladderCount,"innerHighCount")
    if g.lo==800
        plot(g.ladderCount,"outerLowCount")
plot(array.size(groups),"groups")`;
 const {model}=await run(helperSource+body,{bars:fixture('60',20)}),p=Object.fromEntries(model.series.map(s=>[s.title,s.points.at(-1).value]));
 assert.equal(p.outerHighCount,2);assert.equal(p.outerHighUnits,6,'three source frames on one child swing count as one price swing');
 assert.equal(p.innerHighCount,1);assert.equal(p.outerLowCount,1);assert.equal(p.groups,5);
 assert.ok(p.outerHighScore>70,'the confirmed lower-TF outer line gains substantial strength');
});
test('wrong-side, older, unconfirmed and out-of-corridor source swings do not build an outer level',async()=>{
 const body=`
array<Pool> levels=array.new<Pool>()
array.push(levels,Pool.new(0,100,1000,1,3,"",0,false))
array.push(levels,Pool.new(200,300,980,-1,4,"",0,false))
array.push(levels,Pool.new(50,300,970,1,4,"",0,false))
array.push(levels,Pool.new(200,2000,960,1,4,"",0,false))
array.push(levels,Pool.new(200,300,900,1,4,"",0,false))
array<CleanGroup> groups=f_cleanGroups(levels)
f_cleanLadder(groups,1000)
for g in groups
    if g.lo==1000
        plot(g.ladderCount,"count")`;
 const {model}=await run(helperSource+body,{bars:fixture('60',20)});assert.equal(model.series.find(s=>s.title==='count').points.at(-1).value,0);
});

test('older and pending higher-frame contributors do not erase an already confirmed lower-frame buildup swing',async()=>{
 const body=`
array<Pool> levels=array.new<Pool>()
array.push(levels,Pool.new(1,100,1000,1,3,"",0,false))
array.push(levels,Pool.new(200,300,980,1,4,"",0,false))
array.push(levels,Pool.new(200,2000,980,1,2,"",0,false))
array.push(levels,Pool.new(50,75,980,1,3,"",0,false))
array<CleanGroup> groups=f_cleanGroups(levels)
f_cleanLadder(groups,1000)
for g in groups
    if g.lo==1000
        plot(g.ladderCount,"count")
        plot(g.ladderUnits,"units")`;
 const {model}=await run(helperSource+body,{bars:fixture('60',20)}),p=Object.fromEntries(model.series.map(s=>[s.title,s.points.at(-1).value]));
 assert.equal(p.count,1);assert.equal(p.units,3);
});

// Force more than the old eight-badge cap through the real Pine display pass.
test('every visible clean group receives its badge even with a saved legacy cap of one',async()=>{
 const displayFixture=source.replace('array<CleanGroup> groups=f_cleanGroups(active)',`array.clear(active)
    for n=0 to 11
        array.push(active,Pool.new(time,time,math.round(close)+100+n*100,1,4,"",0,false))
    array<CleanGroup> groups=f_cleanGroups(active)`);
 const {model}=await run(displayFixture,{inputs:{cleanZoneLimit:24,cleanLabelLimit:1,cleanMergePercent:0,clusterTicks:1,showStructureAlerts:false,showReference5:false}});
 const unique=new Set(model.lines.map(l=>l.y1));
 assert.ok(model.labels.length>8,'exercise the old cap');
 assert.ok(model.labels.every(l=>/Shared sources: \d+/.test(l.tooltip)));
 for(const price of unique)assert.ok(model.labels.some(l=>{const span=/Exact source-price span (-?\d+(?:\.\d+)?(?:e[+-]?\d+)?) to (-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/.exec(l.tooltip);return span&&price>=Number(span[1])-1e-8&&price<=Number(span[2])+1e-8;}),'every rendered source price belongs to a labelled group');
});
