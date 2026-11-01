import {GEOMETRY_FRAMES,FRAME_STYLE,geometryFrameColor,geometryOptions,channelBounds,stageLabel,frameMs} from './market-geometry-model.mjs';
const alpha=(c,a)=>String(c).slice(0,7)+a;
const tip=p=>new Date(p).toISOString();
const name=tf=>FRAME_STYLE[tf].name;
const observedWorkingTip=(s,locked,working)=>{
 const anchor=locked.at(-1)?.time??working?.time,bars=[...(s.bars||[]),...(s.forming?[s.forming]:[])].filter(b=>Number.isFinite(b?.time)&&(!Number.isFinite(anchor)||b.time>=anchor));
 if(!bars.length)return working;
 const recent=bars.slice(-Math.min(8,bars.length)),first=recent[0],last=recent.at(-1),side=last.close>first.open?1:last.close<first.open?-1:working?.side||1;
 let point=bars[0];for(const b of bars)if(side>0?b.high>point.high:b.low<point.low)point=b;
 const latest=bars.at(-1);return latest.time>=point.time?{time:latest.time,price:side>0?latest.high:latest.low,side}:{time:point.time,price:side>0?point.high:point.low,side};
};
const contactScope=(candidate,cutoff)=>{const g=candidate.geometry||{},projected=Boolean(g.projected||g.endAt>cutoff),frame=g.frame||'1',auditedThrough=Number.isFinite(g.endAt)?g.endAt+frameMs(frame):cutoff;return `${projected?'projected':'audited'} ${name(frame)} rail · audited through ${tip(auditedThrough)}`;};
export function geometryDrawing(result,{id,inputs={},schema=[],props={},sources={},light=false,viewTimeframe='1',liveBar=null,compact=false}={}){
 const o=geometryOptions(inputs),lines=[],labels=[],tables=[],prefix=id+':geometry:',focus=o.geometryPresentation!=='Full overlay'&&o.geometryMode!=='Inspect',micro=o.geometryMode==='Micro detail',macro=o.geometryMode==='Big picture',inspect=o.geometryMode==='Inspect';
 const color=tf=>geometryFrameColor(tf,inputs,light);
 const line=(key,a,b,ink,width=1,style='solid',extra={})=>{if(!a||!b||b.time<=a.time)return;lines.push({id:prefix+key,paneId:'',xloc:'bar_time',x1:a.time,y1:a.price,x2:b.time,y2:b.price,color:ink,width,style,extend:'none',invisible:false,arrowLeft:false,arrowRight:false,...extra});};
 const label=(key,p,text,ink,{hollow=false,marker=false,tooltip='',style='none'}={})=>{labels.push({id:prefix+key,paneId:'',xloc:'bar_time',x:p.time,y:p.price,yloc:'price',text,style:marker?'circle':style,color:hollow?'#00000000':marker?ink:alpha(ink,'22'),textColor:ink,noFill:hollow,size:'tiny',textAlign:'left',fontFamily:'default',tooltip});};
 for(const tf of GEOMETRY_FRAMES){
  const f=result.frames[tf],s=sources[tf]||{},ink=color(tf),width=FRAME_STYLE[tf].width;
  if(inputs['showFrame'+tf]===false||macro&&Number(tf)<15||micro&&Number(tf)>15)continue;
  if(!f||s.error)continue;
  if(focus&&!macro&&tf!=='1')continue;
  const collapsed=Number(viewTimeframe)>=15&&Number(tf)<Number(viewTimeframe)/3;
  if(collapsed){if(!focus&&tf==='1'&&o.showWorking){const last=liveBar||s.forming||s.bars?.at(-1);if(last)label('1:compact-tip',{time:last.time,price:last.close},'○ 1M',ink,{hollow:true,tooltip:'Micro detail is condensed at this viewing interval. Source and reversal states remain in the ribbon; view 1M candles to inspect the path.'});}continue;}
  const locked=f.locked.slice(-(tf==='1'?48:3)),pathInk=focus&&macro?alpha(ink,'88'):ink,pathWidth=focus?(tf==='1'?2:1.2):width;
  if(o.showSwingPaths){
   for(let j=1;j<locked.length;j++)line(`${tf}:swing:${locked[j].id}`,locked[j-1],locked[j],pathInk,pathWidth);
   for(const p of (focus?[]:locked.slice(-3)))label(`${tf}:locked:${p.id}`,p,'',ink,{marker:true,tooltip:`${name(tf)} ${p.kind} · anchor ${tip(p.time)} · known ${tip(p.knownAt)} · locked ${tip(p.lockedAt)}`});
   const working=f.working;
   if(working&&locked.length&&o.showWorking){
    const extreme=observedWorkingTip(s,locked,working);
    line(`${tf}:working`,locked.at(-1),extreme,focus?(light?'#986207':'#F6BD54'):ink,pathWidth,'dashed',{deskDashPattern:[5,4]});
    if(!focus)label(`${tf}:tip`,extreme,'○ '+name(tf)+' · observed working',ink,{hollow:true,tooltip:'Observed provisional swing endpoint; can move. Source '+s.aggregation+' · closed through '+(f.closedThrough?tip(f.closedThrough):'unavailable')});
   }else if(!focus&&locked.at(-1))label(`${tf}:tag`,locked.at(-1),name(tf)+' '+locked.at(-1).kind,ink);
  }
  if(o.showChannels&&!focus){
   const preferred=Number(tf)>=15?'structural':'local',families=inspect?['structural','local']:[preferred];
   for(const family of families){
    const candidates=f.channels.filter(g=>g.family===family&&g.touches>=o.geometryMinTouches&&(!g.broken||o.geometryShowBroken)).sort((a,b)=>Number(a.broken)-Number(b.broken)||(family==='structural'?b.spanBars-a.spanBars:b.touches-a.touches)||b.knownAt-a.knownAt||a.id.localeCompare(b.id));
    // If the structural engine has no valid channel, show a labeled local fallback.
    const g=candidates[0]||(!inspect&&preferred==='structural'?f.channels.filter(g=>g.family==='local'&&(!g.broken||o.geometryShowBroken)&&g.touches>=o.geometryMinTouches).sort((a,b)=>Number(a.broken)-Number(b.broken)||b.spanBars-a.spanBars)[0]:null);
    if(!g)continue;const a=channelBounds(g,g.t0),b=channelBounds(g,g.endAt),chInk=alpha(ink,g.broken?'44':'99');
    for(const side of ['low','high']){
     line(`${g.id}:${side}`,{time:g.t0,price:a[side]},{time:g.endAt,price:b[side]},chInk,family==='structural'?1.6:1,g.broken?'dashed':'solid');
     if(o.showProjection&&!g.broken){const at=result.cutoff+20*frameMs(tf),v=channelBounds(g,at);line(`${g.id}:${side}:projection`,{time:g.endAt,price:b[side]},{time:at,price:v[side]},alpha(ink,'44'),1,'dotted');}
    }
    if(o.geometryShowLabels)label(`${g.id}:channel`,{time:g.endAt,price:b.high},`${name(tf)} ${g.family} · ${g.broken?'ended':'channel'}`,alpha(ink,'BB'),{tooltip:`${g.id} · known ${tip(g.knownAt)} · ${g.spanBars} source bars · ${g.touches} extra contacts · audited through ${tip(g.endAt)} · source-frame wick audit only`});
   }
  }
 }
 const turns=result.turns,latest=turns.candidates.filter(c=>!c.terminal).slice(-2),history=o.showTurnHistory?[...new Map(turns.events.filter(e=>['shift','retest','failed','expired'].includes(e.stage)).map(e=>[e.candidateId,e])).values()].slice(-8):[];
 if(!focus&&!macro&&Number(viewTimeframe)<15&&inputs.showFrame1!==false){
  for(const e of history)label(e.id,{time:e.knownAt-60000,price:e.price},`${e.side>0?'↑':'↓'} ${e.stage==='failed'?'FAIL':e.stage==='expired'?'END':e.stage==='retest'?'HOLD':'SHIFT'}`,e.side>0?'#2CCAC8':'#F59CAA',{tooltip:`${e.family} · known ${tip(e.knownAt)} · invalidation ${e.invalidation}`,hollow:true,style:'none'});
  for(const c of latest){const e=c.lastEvent,p={time:c.startedAt-60000,price:c.invalidation},last=liveBar||sources['1']?.bars.at(-1),scope=contactScope(c,result.cutoff);if(last&&o.showWorking){line(`${c.id}:turn`,p,{time:last.time,price:last.close},color('1'),1.5,'dashed',{deskDashPattern:[3,3]});label(`${c.id}:turntip`,{time:last.time,price:last.close},`○ ${c.side>0?'↑':'↓'} ${stageLabel(c.stage)} · ${scope}`,color('1'),{hollow:true,tooltip:`${c.family} · ${scope} · ${c.reference?'reference '+c.reference.price:'local reference unavailable'} · next: ${c.next}`});}if(e&&c.reference)line(`${c.id}:reference`,{time:c.startedAt-60000,price:c.reference.price},{time:result.cutoff,price:c.reference.price},alpha(color('1'),'66'),1,'dotted');}
 }
 if(o.showStatus&&!focus){
  const cell=(text,ink=light?'#242936':'#D1D4DC',tooltip='')=>({text,textColor:ink,bgColor:light?'#F7F8FAEE':'#131722E8',hAlign:'left',vAlign:'center',textSize:'tiny',fontFamily:'default',bold:false,italic:false,tooltip});
  const rows=[[cell('Geometry · 1H → 1M'),cell('Structure'),cell(result.revision?'Data revision '+result.revision:'Closed evidence')]];
  for(const tf of GEOMETRY_FRAMES){const f=result.frames[tf],s=sources[tf]||{},direction=f?.structure.direction;rows.push([cell(name(tf),color(tf)),cell(s.status==='ready'?(direction>0?'↑ up'+(f.events.at(-1)?.kind==='shift'?' · shift':''):direction<0?'↓ down'+(f.events.at(-1)?.kind==='shift'?' · shift':''):'unresolved'):'— '+(s.status||'unavailable')),cell(s.status==='ready'?s.aggregation||'native':s.error?'history unavailable':s.status||'unavailable',undefined,`${s.error?s.error+' · ':''}${s.symbol||''} · ${s.coverageStart?tip(s.coverageStart):'no start'} → ${s.closedThrough?tip(s.closedThrough):'no cutoff'} · ${s.bars?.length||0} bars · ${s.gaps?.length||0} gaps`)]);}
  for(const c of latest){const scope=contactScope(c,result.cutoff);rows.push([cell(`${c.side>0?'↑':'↓'} 1M ${c.family==='escape'?'escape':'reject'}`),cell(stageLabel(c.stage)),cell((sources['1']?.status==='ready'?c.next:'Source unavailable · paused'),undefined,`${c.family} · ${scope} · ${c.reference?'reference '+c.reference.price:'reference missing'} · invalidation ${c.invalidation} · ${c.parentProgress.filter(p=>p.shift&&p.available).map(p=>name(p.frame)+' shifted').join(', ')||'parent shift unconfirmed'}`)]);}
  rows.push([cell('As of'),cell(tip(result.cutoff).slice(11,19)+' UTC'),cell(result.tick?'source tick '+result.tick:'tick unavailable')]);
  tables.push({id:prefix+'status',paneId:'',position:'top_right',columns:compact?2:3,rows:rows.length,cells:compact?rows.map(r=>[r[0],{...r[1],tooltip:[r[1].tooltip,r[2].text,r[2].tooltip].filter(Boolean).join(' · ')}]):rows,merges:[],frameWidth:1,frameColor:light?'#D5DAE4':'#2A2E39',borderWidth:0,bgColor:'#131722CC'});
 }
 return {id,title:'Agentic - Market Geometry',shorttitle:'Geometry · MTF',overlay:true,paneHint:'price',series:[],fills:[],backgrounds:[],priceLines:[],lines,labels,tables,boxes:[],polylines:[],linefills:[],inputs:schema,inputValues:inputs,propValues:props,drawingAutoscale:false,geometry:result,geometryFocus:focus?{sources,viewTimeframe,light,overviewOnly:macro}:null};
}
