import {geometryDrawing} from './market-geometry-drawing.mjs';
import {GEOMETRY_FRAMES,geometryFrameColor} from './market-geometry-model.mjs';
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
export function geometryVolumeDrawing(result,options={}){
 const {id,inputs={},sources={},light=false}=options,o=gvOptions(inputs),model=geometryDrawing(result,{...options,inputs:{...inputs,geometryPresentation:'Focus',geometryMode:'Context + Micro'}}),prefix=id+':gv:';
 const line=(key,a,b,color,width=1,style='solid',tooltip='')=>{if(!a||!b||b.time<=a.time)return;model.lines.push({id:prefix+key,paneId:'',xloc:'bar_time',x1:a.time,y1:a.price,x2:b.time,y2:b.price,color,width,style,extend:'none',invisible:false,arrowLeft:false,arrowRight:false,tooltip});};
 const through=Math.min(result.cutoff-60000,sources['1']?.bars?.at(-1)?.time??result.cutoff-60000);
 if(o.showContext)for(const tf of [...new Set([String(o.contextFrame),'5'])]){
  if(!GEOMETRY_FRAMES.includes(tf)||inputs['showFrame'+tf]===false||sources[tf]?.status!=='ready')continue;
  const f=result.frames[tf],g=f?.channels.filter(g=>!g.gapEnded&&g.knownAt<=result.cutoff&&(g.touches||0)>=(Number(inputs.geometryMinTouches)||0)).sort((a,b)=>Number(a.broken)-Number(b.broken)||Number(b.family==='structural')-Number(a.family==='structural')||b.knownAt-a.knownAt)[0];if(!g)continue;
  const color=geometryFrameColor(tf,inputs,light),start=Math.max(g.t0,sources['1']?.bars?.[0]?.time??g.t0),end=Math.min(g.endAt,through),ends=geometryParallels(g,end),begins=geometryParallels(g,start);
  for(let i=0;i<begins.length;i++){
   const kind=begins[i].kind,warning=kind.includes('warning'),median=kind==='median',ink=color.slice(0,7)+(warning?'55':median?'99':'AA');
   if(end>start)line(g.id+':'+kind,{time:start,price:begins[i].price},{time:end,price:ends[i].price},ink,median?1.3:1,warning?'dashed':median?'dotted':'solid');
   if(through>end){const a=geometryParallels(g,Math.max(end,start))[i],b=geometryParallels(g,through)[i];line(g.id+':projected:'+kind,{time:Math.max(end,start),price:a.price},{time:through,price:b.price},color.slice(0,7)+'44',1,'dashed');}
  }
 }
 const campaign=currentGVCampaign(result),ink=campaign?.side>0?'#2CCAC8':'#F59CAA';
 if(inputs.showFrame1!==false&&o.showABC&&campaign){const pivots=[campaign.a,campaign.b,campaign.c].filter(Boolean);for(let i=1;i<pivots.length;i++)line(campaign.id+':ABC:'+i,pivots[i-1],pivots[i],ink,2.4);
  if(campaign.b&&campaign.breakAt)line(campaign.id+':B-reference',{time:campaign.b.time,price:campaign.b.price},{time:through,price:campaign.b.price},ink+'88',1,'dotted');
 }
 const sweep=campaign?result.geometryVolume.sweep.events.filter(e=>e.side===campaign.side&&e.stage==='reclaimed'&&!e.ambiguous&&e.sweptAt>=campaign.startedAt&&e.reclaimedAt<=result.cutoff).at(-1):null;
 if(inputs.showFrame1!==false&&sweep&&o.showABC)line(sweep.id+':frozen-pool',{time:Math.max(sweep.pool.knownAt-60000,sources['1']?.bars?.[0]?.time??0),price:sweep.pool.price},{time:sweep.reclaimedAt-60000,price:sweep.pool.price},ink+'99',1,'dashed');
 const paper=result.geometryVolume.strategy.paper.filter(p=>['pending','open'].includes(p.status)).at(-1);
 if(o.showPaperLevels&&paper){for(const [key,price,color]of [['stop',paper.stop,'#F59CAA'],['objective',paper.target.price,'#2CCAC8']])line(paper.id+':'+key,{time:paper.qualifiedAt-60000,price},{time:through,price},color+'88',1,'dashed');}
 return {...model,title:'Agentic - Geometry - Volume',shorttitle:'Geometry · Volume',inputValues:inputs,tables:[],geometryFocus:null,geometryVolumeFocus:{sources,light,viewTimeframe:options.viewTimeframe,options:o}};
}
