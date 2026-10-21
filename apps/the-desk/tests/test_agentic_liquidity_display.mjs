import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {liquidityDashesBuild} from '../web/pine-compat/liquidity-dashes-build.mjs';
import {liquidityDisplayModel} from '../web/pine-compat/liquidity-display.mjs';
import {DeskPineEngine} from '../web/pine-runtime.mjs';
import {syncLiquidityGutter,resetLiquidityGutter,liquidityDefaultRightOffset,liquidityGutterPixels} from '../web/pine-compat/liquidity-badge-layout.mjs';
import {fontPixelsBuild} from '../web/pine-compat/font-pixels-build.mjs';
const source=await fs.readFile(new URL('../web/pine-examples/agentic-liquidity-reference.pine',import.meta.url),'utf8');
const currentSource=await fs.readFile(new URL('../web/pine-examples/agentic-liquidity.pine',import.meta.url),'utf8');
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'liquidity-display-'));
await build({stdin:{contents:"import {installNestedSecurity} from './web/pine-compat/nested-security.mjs';installNestedSecurity();export {PineEngine} from '@luxalgo/vela-pinets';export {DrawingSceneRenderer} from '../../integrations/vela/src/renderers/shared/DrawingSceneRenderer.ts';",resolveDir:process.cwd(),loader:'js'},outfile:path.join(dir,'display.mjs'),bundle:true,platform:'node',format:'esm',plugins:[liquidityDashesBuild(fontPixelsBuild())],external:['fs','path','url']});
const {PineEngine,DrawingSceneRenderer}=await import(pathToFileURL(path.join(dir,'display.mjs')).href);
test.after(()=>fs.rm(dir,{recursive:true,force:true}));
const end=Date.UTC(2026,9,17),hour=3600000,ms=tf=>({'1':1,'30':30,'60':60}[tf])*60000;
const fixture=(tf,n=300)=>Array.from({length:n},(_,i)=>{const time=end-(n-i)*ms(tf),p=51000+250*Math.sin(time/14400000)+50*Math.sin(time/900000);return {time,open:p,high:p+15,low:p-15,close:p+5,volume:1000};});
async function run(inputs={},script=source){
 const engine=new PineEngine(),prepared=await engine.prepare(script,'display-contract');let session,model;
 try{await new Promise((resolve,reject)=>{session=engine.execute({prepared,bars:fixture('60'),market:{symbol:'fixture:MYM',timeframe:'60',symbolInfo:{tickerid:'fixture:MYM',mintick:1,type:'futures'}},inputs,mode:'static',historyState:'complete',fetchSeries:async(_,tf,r)=>fixture(tf,r.limit||300)},{onModel:m=>model=m,onDone:resolve,onError:reject});});return {model,context:await session.getContext(['variables'])};}finally{session?.stop();}
}
const color=(hex,transparency)=>hex.toUpperCase()+Math.round(255*(1-transparency/100)).toString(16).padStart(2,'0').toUpperCase();
const samePrice=(actual,expected)=>assert.ok(Math.abs(actual-expected)<=Math.max(1e-9,16*Number.EPSILON*Math.max(1,Math.abs(expected))),`${actual} != ${expected}`);
const isolated={showSmallPools:false,showPockets:false,showStructureAlerts:false,showOriginDots:false,showDots:false,showTags:false,useLiveStrength:false,lineWidth:2,strokeInput:'Solid'};
let fixed;
test('main levels obey source pivot anchors, consumed endpoints, exact colors, widths and band geometry',async()=>{
 fixed=await run(isolated);const {model,context}=fixed;
 const records=context.variables.rawPacket.split(';').map(row=>row.split(',').map(Number)).slice(0,48);
 assert.equal(model.lines.length,records.length);assert.ok(records.some(p=>p[3]||p[6]));assert.ok(records.some(p=>!p[3]&&!p[6]));
 let band=0;
 for(let i=0;i<records.length;i++){
  const [origin,price,,taken,ended,status,touch,side]=records[i],retired=Boolean(taken||touch),line=model.lines[i];
  assert.equal(line.x1,origin);assert.equal(line.y1,price);assert.equal(line.y2,price);assert.equal(line.xloc,'bar_time');assert.equal(line.extend,'none');assert.equal(line.width,2);
  assert.equal(line.x2,retired?(ended||touch):end+12*hour);
  assert.equal(line.color.toUpperCase(),retired?color('#FFFFFF',25):color(side===1?'#AA2430':'#66BB6A',12));
  assert.equal(line.width,2);
  assert.equal(line.style,retired?(status===1?'dashed':'dotted'):'solid');
  if(!retired){const b=model.boxes[band++],depth=Math.max(1,Math.abs(price)*.0007);assert.equal(b.left,origin);assert.equal(b.right,line.x2);samePrice(b.top,side===1?price+depth:price);samePrice(b.bottom,side===1?price:price-depth);assert.equal(b.bgColor.toUpperCase(),color(side===1?'#AA2430':'#66BB6A',86));assert.equal(b.borderColor,undefined,'source na border must stay invisible');}
 }
 assert.equal(model.boxes.length,band,'retired levels have no active bands');assert.equal(model.labels.length,0);
});
test('close-through broken pools retain side color and two-pixel dashed lines, with all tags removed',async()=>{
 const {model,context}=await run({showSmallPools:false,showPockets:false,showStructureAlerts:false,showOriginDots:true,showDots:true,showTags:true,showRetired:true,showRetiredTags:true,displayView:'Original',useLiveStrength:false,lineWidth:1,alpha:12,retiredAlpha:25,consumption:'Close through'},currentSource);
 const broken=context.variables.rawPacket.split(';').map(row=>row.split(',').map(Number)).filter(row=>row[3]===1&&row[5]===1);
 assert.ok(broken.length>0,'fixture contains close-through pools');
 for(const row of broken){
  const price=row[1],ended=row[4],first=row[6],side=row[7];const line=model.lines.find(l=>l.y1===price&&l.x2===(ended||first));
  assert.ok(line,'broken history line exists '+JSON.stringify({row,lines:model.lines.filter(l=>l.y1===price)}));assert.equal(line.color.toUpperCase(),color(side===1?'#AA2430':'#66BB6A',12));
  assert.equal(line.width,2);assert.equal(line.style,'dashed');
 }
 assert.ok(!model.labels.some(label=>label.tooltip?.includes('Close-through')),'broken pools omit timeframe, origin and contact tags');
});
test('default live-strength styling, source dots and optional tags retain the Pine display rules',async()=>{
 const {model,context}=await run({showSmallPools:true,showPockets:false,showStructureAlerts:false,showTags:true,strengthTicks:500});
 const plots=Object.fromEntries(model.series.map(s=>[s.title,s.points.at(-1)?.value]));let checked=0;
 for(const [side,stem,prefix] of [[-1,'s','Support'],[1,'r','Resistance']])for(let rank=1;rank<=3;rank++){
  const price=context.variables[stem+rank];if(!Number.isFinite(price))continue;
  const count=plots[`${prefix} ${rank} · unswept small pools`],score=100*count/(count+3),width=score>=75?4:score>=50?3:score>0?2:1;
  const line=model.lines.find(l=>l.y1===price&&l.x2===end+12*hour);if(!line)continue;
  assert.equal(plots[`${prefix} ${rank} · live strength / 100`],score);assert.equal(line.width,width);assert.equal(line.style,'dotted');assert.equal(line.color.toUpperCase(),color(side===1?'#AA2430':'#66BB6A',Math.round(65*(1-score/100))));checked++;
 }
 assert.ok(checked>=2,'check both ranked support/resistance display feeds');
 const dots=model.labels.filter(l=>l.text==='•');assert.ok(dots.some(l=>l.size===11));assert.ok(dots.some(l=>l.size===10));assert.ok(model.labels.some(l=>l.size===8&&l.text!=='•'));
 for(const fill of model.linefills){assert.equal(fill.line1.x2-fill.line1.x1,4*hour);assert.equal(fill.line2.x2-fill.line2.x1,4*hour);assert.equal(fill.line1.style,'dotted');assert.equal(fill.line2.style,'dotted');}
});
test('the canvas renderer receives the exact main-line endpoints, colors, widths, dashes and borderless fills',async()=>{
 fixed??=await run(isolated);const {model}=fixed,strokes=[],fills=[];let start,finish,dash=[];
 const ctx={save(){},restore(){},beginPath(){},rect(){},clip(){},moveTo(x,y){start=[x,y];},lineTo(x,y){finish=[x,y];},setLineDash(d){dash=[...d];},stroke(){strokes.push({start,finish,color:this.strokeStyle,width:this.lineWidth,dash:[...dash]});},fillRect(...r){fills.push({rect:r,color:this.fillStyle});},strokeRect(){assert.fail('active level bands have no border');}};
 const first=Math.min(...model.lines.map(l=>l.x1)),right=end+12*hour,low=50000,high=52000,x=t=>(t-first)/(right-first)*1000,y=p=>600*(high-p)/(high-low);
 const renderer=new DrawingSceneRenderer({timeToLogical:t=>t,barAt:()=>null,theme:{textColor:'#FFFFFF'}});
 renderer.setSet({lines:model.lines,boxes:model.boxes,labels:[],linefills:[],polylines:[]});renderer.render(ctx,1000,600,x,y);
 assert.equal(strokes.length,model.lines.length);assert.equal(fills.length,model.boxes.length);
 for(let i=0;i<model.lines.length;i++){const l=model.lines[i],s=strokes[i];assert.deepEqual(s.start,[x(l.x1),y(l.y1)]);assert.deepEqual(s.finish,[x(l.x2),y(l.y2)]);assert.equal(s.color,l.color);assert.equal(s.width,l.width);assert.deepEqual(s.dash,l.style==='solid'?[]:l.style==='dashed'?[8,6]:[2,4]);}
 for(let i=0;i<model.boxes.length;i++){const b=model.boxes[i],f=fills[i];assert.equal(f.color,b.bgColor);assert.deepEqual(f.rect,[x(b.left),y(b.top),x(b.right)-x(b.left),y(b.bottom)-y(b.top)]);}
});

test('reference dash spacing reaches the canvas only for the tagged indicator lines',()=>{
 const line={id:'reference',paneId:'price',xloc:'bar_index',x1:10,x2:80,y1:20,y2:20,extend:'none',color:'#FFFFFFBF',width:1,style:'dashed'};
 const adapted=liquidityDisplayModel({lines:[line]});assert.deepEqual({...adapted.lines[0],deskDashPattern:undefined},{...line,deskDashPattern:undefined});assert.equal(line.deskDashPattern,undefined);
 const strokes=[];let dash;const ctx={save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},setLineDash(v){dash=v;},stroke(){strokes.push([...dash]);}};
 const renderer=new DrawingSceneRenderer({timeToLogical:t=>t,barAt:()=>null,theme:{textColor:'#FFFFFF'}});
 renderer.setSet({lines:[...adapted.lines,{...line,id:'other-study'}],boxes:[],labels:[],linefills:[],polylines:[]});renderer.render(ctx,100,100,v=>v,v=>v);
 assert.deepEqual(strokes,[[5,6],[4,3]]);
});
test('the installed host attaches the reference pattern to Liquidity models without changing other studies',async()=>{
 const execute=async script=>{
  const engine=new DeskPineEngine({factory:()=>({prepare:async(source,id)=>({token:{source,instanceId:id}}),terminate(){},execute(req,h){queueMicrotask(()=>h.onModel({lines:[{style:'dashed',width:1}],series:[],labels:[],boxes:[],linefills:[],tables:[]}));return {stop(){}};}})});
  const prepared=await engine.prepare(script,'host-display');let session;
  try{return await new Promise(resolve=>{session=engine.execute({prepared,bars:[{time:1,open:1,high:2,low:1,close:2,volume:1}]},{onModel:resolve});});}finally{session?.stop();}
 };
 assert.deepEqual((await execute(source)).lines[0].deskDashPattern,[5,6]);
 assert.equal((await execute('//@version=6\nindicator("Other")\nplot(close)')).lines[0].deskDashPattern,undefined);
});

test('all on-screen score-only badges survive crowded panes and zoom; ordinary labels stay untouched',()=>{
 const label=(id,y,text)=>({id,paneId:'price',xloc:'bar_index',x:150,yloc:'price',y,text,style:'label_right',size:'tiny',color:'#AA2430A6',textColor:'#FFFFFF',tooltip:text});
 const models=liquidityDisplayModel({lines:[],labels:[label('a',100,'73/100'),label('b',105,'60/100'),label('c',150,'50/100'),label('ordinary',105,'Unrelated annotation')]});
 assert.ok(models.labels.slice(0,3).every(l=>l.deskLiquidityBadge));assert.equal(models.labels[3].deskLiquidityBadge,undefined);
 const painted=[],ctx=new Proxy({measureText:t=>({width:t.length*5}),fillText:text=>painted.push(text)},{get:(obj,key)=>key in obj?obj[key]:()=>{}});
 const renderer=new DrawingSceneRenderer({timeToLogical:t=>t,barAt:()=>null,theme:{textColor:'#FFFFFF'}});
 renderer.setSet({lines:[],boxes:[],labels:models.labels,linefills:[],polylines:[]});renderer.render(ctx,300,200,v=>v,v=>v);
 assert.deepEqual(painted,['73/100','60/100','50/100','Unrelated annotation']);
 painted.length=0;renderer.render(ctx,300,200,v=>v,v=>v*5-450);
 assert.deepEqual(painted,['73/100','60/100','Unrelated annotation'],'zoom restores the second badge while offscreen badges reserve no room');
});

test('clean main lines have no shading and stop eight pixels before the white rectangular tag at every zoom',()=>{
 const adapted=liquidityDisplayModel({lines:[{id:'active',paneId:'price',xloc:'bar_index',x1:20,x2:900,y1:100,y2:100,extend:'none',width:2,style:'solid',color:'#AA2430'}],boxes:[{id:'band',paneId:'price',xloc:'bar_index',left:30,right:900,top:104,bottom:100,extend:'none',bgColor:'#AA243030'}],labels:[{id:'badge',paneId:'price',xloc:'bar_index',x:900,yloc:'price',y:100,text:'73/100',style:'label_right',size:10,color:'#AA2430',textColor:'#FFFFFF',tooltip:'Convergence'}]});
 assert.equal(adapted.lines[0].x2,900);assert.equal(adapted.boxes.length,0,'main-line shading is removed');
 for(const width of [320,1000])for(const zoom of [.1,4]){
  const texts=[],strokes=[],fills=[],rectangles=[];let end;
  const ctx=new Proxy({measureText:t=>({width:t.length*5}),fillText:(text,x,y)=>texts.push({text,x,y}),moveTo(){},lineTo:(x,y)=>{end=[x,y]},stroke:()=>strokes.push(end),fillRect:(...rect)=>fills.push({color:ctx.fillStyle,rect}),strokeRect:(...rect)=>rectangles.push({color:ctx.strokeStyle,rect})},{get:(obj,key)=>key in obj?obj[key]:()=>{}});
  const renderer=new DrawingSceneRenderer({timeToLogical:t=>t,barAt:()=>null,theme:{textColor:'#FFFFFF'}});
  renderer.setSet({...adapted,linefills:[],polylines:[]});renderer.render(ctx,width,200,v=>v*zoom,v=>v);
  assert.equal(texts.length,1,'badge remains visible even when its original future timestamp is offscreen');
  assert.equal(texts[0].x,width-12-7-(('73/100'.length*5)+12)/2);
  assert.equal(texts[0].y,100);
  const badgeLeft=width-12-7-12-('73/100'.length*5);
  assert.deepEqual(strokes[0],[badgeLeft-8,100],'line stops before the badge background');
  assert.ok(rectangles.some(r=>r.color==='#FFFFFF'),'tag has a white rectangular outline');
  assert.equal(fills.length,1,'only the tag background reaches the canvas');
 }
});
function gutterFixture(){
 let viewport={barSpacing:4,rightOffset:12};
 const renderer={scene:{indicators:new Map([['liq',{labels:[{deskLiquidityBadge:true}]}]])},coords:{width:1000,barCount:600,spacingScale:1,getViewport:()=>viewport,pxPerBar(){return viewport.barSpacing*this.spacingScale},setViewport:v=>{viewport=v}}};
 return {renderer,set(patch){viewport={...viewport,...patch}},space(){return viewport.rightOffset*renderer.coords.pxPerBar()}};
}
test('latest candles retain a pixel gutter through zoom, resize, spacing changes and timeframe resets',()=>{
 const f=gutterFixture(),r=f.renderer;
 syncLiquidityGutter(r);assert.equal(f.space(),230);
 for(const pitch of [1,2,8,12]){f.set({barSpacing:pitch});syncLiquidityGutter(r);assert.equal(f.space(),230);assert.equal(r.zoomAnchorX,770)}
 r.coords.width=320;syncLiquidityGutter(r);assert.equal(f.space(),liquidityGutterPixels(320));
 r.coords.spacingScale=2;syncLiquidityGutter(r);assert.equal(f.space(),liquidityGutterPixels(320));
 f.set({rightOffset:12});resetLiquidityGutter(r);syncLiquidityGutter(r);assert.ok(f.space()>=liquidityGutterPixels(320));
 assert.ok(liquidityDefaultRightOffset(r,12)*r.coords.pxPerBar()>=liquidityGutterPixels(320));
});
test('manual panning, historical zoom and unrelated charts keep their viewport',()=>{
 const f=gutterFixture(),r=f.renderer;syncLiquidityGutter(r);
 f.set({rightOffset:25});syncLiquidityGutter(r);assert.equal(f.space(),100,'manual pan can move the newest candle into the gutter');
 f.set({rightOffset:-60});syncLiquidityGutter(r);assert.equal(f.space(),-240);
 f.set({barSpacing:8});syncLiquidityGutter(r);assert.equal(f.space(),-480,'historical zoom is not pulled to realtime');
 r.scene.indicators.clear();f.set({rightOffset:12,barSpacing:4});syncLiquidityGutter(r);assert.equal(f.space(),48);
 assert.equal(liquidityDefaultRightOffset(r,12),12);
});

test('line-only clean display preserves standalone small pockets, hidden badges and Original-view fills',()=>{
 const line={style:'solid',width:2,x1:10,x2:1000,y1:100,y2:100};
 const main={left:10,right:1000,top:102,bottom:100},small={left:20,right:24,top:104,bottom:102};
 const clean=liquidityDisplayModel({inputValues:{displayView:'Clean'},lines:[line],labels:[],boxes:[main,small]});
 assert.deepEqual(clean.boxes,[small],'main shading is removed even with badges switched off');
 const original=liquidityDisplayModel({inputValues:{displayView:'Original'},lines:[line],labels:[],boxes:[main,small]});
 assert.deepEqual(original.boxes,[main,small]);assert.equal(original.lines[0].x2,line.x2);
});
