import {geometryDrawing} from './market-geometry-drawing.mjs';
import {GEOMETRY_FRAMES,FRAME_STYLE,geometryFrameColor,channelBounds,frameMs} from './market-geometry-model.mjs';
import {geometryParallels} from './geometry-volume-strategy.mjs';
import {gvOptions} from './geometry-volume-evidence.mjs';
export function currentGVCampaign(result){
 const strategy=result.geometryVolume.strategy,all=strategy.campaigns;
 // A qualified close and its pending/open hypothetical observation own the
 // display before an older blocked opposite-side sequence. Never modify ledger state.
 const qualified=all.filter(c=>c.qualifiedAt<=result.cutoff&&(c.qualifiedAt===result.cutoff||strategy.paper?.some(p=>p.campaignId===c.id&&['pending','open'].includes(p.status)))).sort((a,b)=>b.qualifiedAt-a.qualifiedAt)[0];
 if(qualified)return qualified;
 const active=all.filter(c=>!c.terminal);
 return active.sort((a,b)=>Number(!!b.c)-Number(!!a.c)||Number(!!b.b)-Number(!!a.b)||b.startedAt-a.startedAt)[0]||all.at(-1)||null;
}
// Display selection only: retain different slopes and both long and local
// channels. Overlapping candidates from the same pivot must not paint a fan of
// effectively identical rails. The complete evidence ledger is unchanged.
export function geometryMapChannels(frame,cutoff,{limit=3,minTouches=0,showBroken=true,tick=1}={}){
 const all=(frame?.channels||[]).filter(g=>!g.gapEnded&&g.knownAt<=cutoff&&g.touches>=minTouches&&(!g.broken||showBroken));
 const rank=(a,b)=>Number(a.broken)-Number(b.broken)||b.endAt-a.endAt||b.spanBars-a.spanBars||b.knownAt-a.knownAt||a.id.localeCompare(b.id);
 const structural=all.filter(g=>g.family==='structural').sort((a,b)=>Number(a.broken)-Number(b.broken)||b.spanBars-a.spanBars||rank(a,b));
 const local=all.filter(g=>g.family==='local').sort(rank),chosen=[];
 const add=g=>{if(!g||chosen.length>=limit)return;const slope=(g.p1-g.p0)/(g.t1-g.t0),at=Math.min(cutoff,g.endAt),bounds=channelBounds(g,at);
  if(chosen.some(p=>{const v=channelBounds(p,at),tolerance=Math.max(tick*2,Math.min(p.offset,g.offset)*.12);return Math.abs(v.low-bounds.low)<tolerance&&Math.abs(v.high-bounds.high)<tolerance&&Math.abs((p.p1-p.p0)/(p.t1-p.t0)-slope)*Math.max(g.t1-g.t0,p.t1-p.t0)<tolerance;}))return;
  chosen.push(g);
 };
 add(structural[0]||local[0]);
 const first=chosen[0],sign=g=>Math.sign(g.p1-g.p0);
 add(local.find(g=>first&&sign(g)!==sign(first))||local[0]);
 for(const g of [...all].sort(rank))add(g);
 return chosen;
}
export function geometryVolumeDrawing(result,options={}){
 const {id,inputs={},sources={},light=false,viewTimeframe='1'}=options,o=gvOptions(inputs),model=geometryDrawing(result,{...options,inputs:{...inputs,showSwingPaths:false,geometryPresentation:'Focus',geometryMode:'Context + Micro'}}),prefix=id+':gv:';
 const line=(key,a,b,color,width=1,style='solid',tooltip='')=>{if(!a||!b||b.time<=a.time)return;model.lines.push({id:prefix+key,paneId:'',xloc:'bar_time',x1:a.time,y1:a.price,x2:b.time,y2:b.price,color,width,style,extend:'none',invisible:false,arrowLeft:false,arrowRight:false,tooltip});};
 const nativeFrame=GEOMETRY_FRAMES.includes(String(viewTimeframe))?String(viewTimeframe):'60',through=Math.min(result.cutoff-60000,sources['1']?.bars?.at(-1)?.time??result.cutoff-60000),mappedFrames=[];
 if(o.showContext)for(const tf of GEOMETRY_FRAMES){
  if(!GEOMETRY_FRAMES.includes(tf)||inputs['showFrame'+tf]===false||sources[tf]?.status!=='ready')continue;
  const channels=geometryMapChannels(result.frames[tf],result.cutoff,{limit:Math.max(1,Math.min(8,Number(inputs.geometryShown)||3)),minTouches:Number(inputs.geometryMinTouches)||0,showBroken:inputs.geometryShowBroken!==false,tick:result.tick});
  if(channels.length)mappedFrames.push(tf);
  for(const g of channels){
  const color=geometryFrameColor(tf,inputs,light),start=g.t0,end=Math.min(g.endAt,result.cutoff-frameMs(tf)),ends=geometryParallels(g,end),begins=geometryParallels(g,start),emphasis=tf===nativeFrame||tf===String(o.contextFrame),faded=g.broken;
  for(let i=0;i<begins.length;i++){
   const kind=begins[i].kind,warning=kind.includes('warning'),median=kind==='median',ink=color.slice(0,7)+(warning?(faded?'28':'55'):median?(faded?'44':'88'):faded?'66':emphasis?'CC':'88'),detail=warning?'outer warning parallel':median?'channel median':'wick-audited rail';
   if(end>start)line(g.id+':'+kind,{time:start,price:begins[i].price},{time:end,price:ends[i].price},ink,warning||median?1:emphasis?1.5:1,warning?'dashed':median?'dotted':'solid',`${FRAME_STYLE[tf].name} ${detail} · ${g.broken?'historical, ended at wick break':'audited'} · ${g.id}`);
   const projectedThrough=inputs.showProjection===true?result.cutoff+20*frameMs(nativeFrame):result.cutoff-frameMs(tf);
   if(projectedThrough>end){const a=geometryParallels(g,Math.max(end,start))[i],b=geometryParallels(g,projectedThrough)[i];line(g.id+':projected:'+kind,{time:Math.max(end,start),price:a.price},{time:projectedThrough,price:b.price},color.slice(0,7)+(warning?'22':faded?'44':'77'),1,'dashed',`${FRAME_STYLE[tf].name} projected ${detail} · untested beyond ${new Date(end+frameMs(tf)).toISOString()}`);}
  }
  }
 }
 // Each viewing interval owns its swing path. Parent history must never be
 // clipped to the much shorter 1M fetch window.
 const f=result.frames[nativeFrame],s=sources[nativeFrame];
 if(!o.abcFocus&&inputs.showSwingPaths!==false&&inputs['showFrame'+nativeFrame]!==false&&s?.status==='ready'&&f){
  const points=f.locked.filter(p=>p.lockedAt<=result.cutoff).slice(-96),ink=geometryFrameColor(nativeFrame,inputs,light);
  for(let i=1;i<points.length;i++)line(nativeFrame+':swing:'+points[i].id,points[i-1],points[i],ink,nativeFrame==='1'?1.8:2);
  if(inputs.showWorking!==false&&points.length&&f.working){const last=s.bars?.at(-1);if(last){const side=f.working.side,rows=s.bars.filter(b=>b.time>=points.at(-1).time&&b.time+frameMs(nativeFrame)<=result.cutoff),tip=rows.reduce((a,b)=>!a||(side>0?b.high>a.high:b.low<a.low)?b:a,null);if(tip)line(nativeFrame+':working',points.at(-1),{time:tip.time,price:side>0?tip.high:tip.low},light?'#986207':'#F6BD54',1.5,'dashed');}}
 }
 const campaign=currentGVCampaign(result),ink=campaign?.side>0?'#2CCAC8':'#F59CAA';
 if(Number(nativeFrame)<=5&&inputs.showFrame1!==false&&o.showABC&&campaign){const pivots=[campaign.a,campaign.b,campaign.c].filter(Boolean);for(let i=1;i<pivots.length;i++){
   const a=pivots[i-1],b=pivots[i],color=b.price>=a.price?(light?'#087F83':'#00DCFF'):(light?'#344154':'#F4F7FC');
   line(campaign.id+':ABC-halo:'+i,a,b,light?'#FFFFFF':'#10151F',6);
   line(campaign.id+':ABC:'+i,a,b,color,3.2,'solid','Watched corrective ABC · '+campaign.id+' · '+(i===1?'A → B':'B → C'));
  }
  for(const [role,p]of [['A',campaign.a],['B',campaign.b],['C',campaign.c]])if(p)line(campaign.id+':endpoint:'+role,{time:p.time-60000,price:p.price},{time:p.time+60000,price:p.price},light?'#087F83':'#00DCFF',2.5,'solid','Watched '+role+' · confirmed pivot');
  if(campaign.b&&campaign.breakAt)line(campaign.id+':B-reference',{time:campaign.b.time,price:campaign.b.price},{time:through,price:campaign.b.price},ink+'88',1,'dotted');
 }
 const sweep=campaign?result.geometryVolume.sweep.events.filter(e=>e.side===campaign.side&&e.stage==='reclaimed'&&!e.ambiguous&&e.sweptAt>=campaign.startedAt&&e.reclaimedAt<=result.cutoff).at(-1):null;
 if(inputs.showFrame1!==false&&sweep&&o.showABC)line(sweep.id+':frozen-pool',{time:Math.max(sweep.pool.knownAt-60000,sources['1']?.bars?.[0]?.time??0),price:sweep.pool.price},{time:sweep.reclaimedAt-60000,price:sweep.pool.price},ink+'99',1,'dashed');
 const paper=result.geometryVolume.strategy.paper.filter(p=>['pending','open'].includes(p.status)).at(-1);
 if(o.showPaperLevels&&paper){for(const [key,price,color]of [['stop',paper.stop,'#F59CAA'],['objective',paper.target.price,'#2CCAC8']])line(paper.id+':'+key,{time:paper.qualifiedAt-60000,price},{time:through,price},color+'88',1,'dashed');}
 return {...model,title:'Agentic - Geometry - Volume',shorttitle:'Geometry · Volume',inputValues:inputs,tables:[],labels:[],geometryFocus:null,geometryVolumeFocus:{sources,light,viewTimeframe:options.viewTimeframe,nativeFrame,mappedFrames,options:o}};
}
