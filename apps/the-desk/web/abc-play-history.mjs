// Read-only chart-play tracking. Pine still owns contact, ABC and retest decisions.
// These endpoints describe a research play, never a broker fill or an order exit.
import {abcLiveDrawing} from './abc-live-drawing.mjs';
const finite=Number.isFinite;
const TEAL='#00B8A9',RED='#F23645',YELLOW='#FFD94A';
const alpha=(ink,a)=>/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(ink)?ink.slice(0,7)+a:ink;
const legible=ink=>/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(ink)?'#'+[1,3,5].map(at=>Math.round(parseInt(ink.slice(at,at+2),16)*.6+255*.4).toString(16).padStart(2,'0')).join(''):ink;
const candidateTitles=['Rider HTF support','C support 2','C support 3','Rider HTF resistance','C resistance 2','C resistance 3','Reached support · this chart bar','Reached resistance · this chart bar'];
const indexes=model=>new Map((model?.series||[]).map(s=>[s.title,new Map((s.points||[]).map(p=>[p.time,p.value]))]));
const read=(index,title,time)=>index.get(title)?.get(time);
const phaseTitle='ABC audit · phase';
const snapshot=(model,index,time)=>({...model,lines:[],labels:[],boxes:[],series:model.series.map(s=>({...s,points:[{time,value:read(index,s.title,time)}]}))});

export function deriveABCPlays(model,bars,{feed,timeframe='1',now=Date.now(),tick=0}={}){
 const step=Number(timeframe)*60000,inputs=model.inputValues||{};
 if(!feed?.connected||!['1','5'].includes(String(timeframe))||!finite(step))return [];
 const closed=bars.filter(b=>b.time+step<=now),index=indexes(model),liquidity=indexes(feed.model);
 const hosted=closed.some(b=>read(index,'ABC drawing · hosted',b.time)===1);
 if(!hosted)return [];
 const direction=inputs.reversalSide==='Long from support'?1:-1;
 const limit=Math.max(1,Math.min(20,inputs.historyCounts??3)),history=[];
 let current=null;
 const finish=(bar,i,reason,price=bar.close)=>{
  current.end={time:bar.time,price,confirmedAt:bar.time+step,reason};current.endIndex=i;
  history.push(current);while(history.length>limit)history.shift();current=null;
 };
 for(let i=0;i<closed.length;i++){
  const bar=closed[i],phase=read(index,phaseTitle,bar.time),contact=read(index,'ABC audit · contact',bar.time)===1;
  const level=read(index,'Selected / armed HTF level',bar.time),armed=read(index,'ABC drawing · armed time',bar.time);
  const passed=read(index,'ABC audit · retest passed',bar.time)===1;
  const rowTick=read(index,'ABC drawing · tick',bar.time),priceTick=finite(rowTick)&&rowTick>0?rowTick:finite(tick)&&tick>0?tick:0;
  const epsilon=Math.max(priceTick*.5,Math.abs(current?.level??level??0)*1e-10,1e-9);
  if(current&&bar.time>current.start.time){
   const reached=[...new Set(candidateTitles.map(title=>read(liquidity,title,bar.time)).filter(p=>finite(p)&&Math.abs(p-current.level)>epsilon&&bar.low<=p&&bar.high>=p))];
   if(reached.length)finish(bar,i,reached.length===1?'Next liquidity level':'Multiple liquidity levels · order unknown',reached.length===1?reached[0]:bar.close);
   else if(contact&&armed!==current.armed)finish(bar,i,'New ABC campaign',finite(level)?level:bar.close);
   else if(current.qualifiedAt!=null){
    const c=current.c;
    const buffer=(inputs.breakBufferTicks??1)*priceTick;
    if(finite(c)&&direction*(bar.close-c)<-buffer)finish(bar,i,'C invalidated · confirmed close');
    else if(current.structure&&bar.time>current.structure.knownAt&&direction*(bar.close-current.structure.price)<-buffer)finish(bar,i,'Confirmed structure break');
    else if(i-current.qualifiedIndex>(inputs.campaignBars??240))finish(bar,i,'Tracking expired');
   }else if(phase===5&&!passed)finish(bar,i,'Setup expired');
   else if(phase===0&&!contact)finish(bar,i,'Campaign reset');
  }
  if(!current&&contact&&finite(level)&&finite(armed)){
   // Preserve the price's observed lead-in, not an invented source-pivot origin.
   const titles=direction===1?candidateTitles.slice(0,3):candidateTitles.slice(3,6);
   let known=i;
   while(known>0&&titles.some(t=>Math.abs(read(liquidity,t,closed[known-1].time)-level)<=epsilon))known--;
   current={levelKnownAt:closed[known].time,direction,level,armed,tick:priceTick,start:{time:bar.time,price:level,confirmedAt:bar.time+step},startIndex:i,qualifiedAt:null,qualifiedIndex:null,structure:null,c:null,snapshot:null,end:null};
  }
  if(!current)continue;
  if(armed===current.armed&&phase>=1&&phase<=5){
   current.snapshot=snapshot(model,index,bar.time);
   const c=read(index,'ABC audit · C',bar.time);if(finite(c))current.c=c;
   if(passed&&current.qualifiedAt==null){current.qualifiedAt=bar.time;current.qualifiedIndex=i;}
  }
  // A later HL/LH must be confirmed before a subsequent closing break can end
  // the move. The B break is setup confirmation and never an exit condition.
  if(current.qualifiedAt!=null){
   const right=Math.max(1,Math.min(30,inputs.pivotBars??3)),at=i-right;
   if(at>=right&&closed[at].time>=current.qualifiedAt){
    const pivot=closed[at],window=closed.slice(at-right,i+1);
    const low=window.every((b,j)=>j===right||(j<right?pivot.low<=b.low:pivot.low<b.low));
    const high=window.every((b,j)=>j===right||(j<right?pivot.high>=b.high:pivot.high>b.high));
    const price=direction===1?pivot.low:pivot.high;
    if(low!==high&&(direction===1?low:high)&&finite(current.c)&&direction*(price-current.c)>0&&(!current.structure||direction*(price-current.structure.price)>0))current.structure={price,time:pivot.time,knownAt:bar.time};
   }
  }
  current.lastIndex=i;
 }
 if(current)history.push(current);
 return history;
}

export function abcPlayDrawing(model,bars,{feed,timeframe='1',id='abc',now=Date.now(),tick=0}={}){
 const plays=deriveABCPlays(model,bars,{feed,timeframe,now,tick});
 // Legacy/unhosted scripts keep their original presentation.
 if(!model.series?.some(s=>s.title==='ABC drawing · hosted'&&s.points.some(p=>p.value===1)))return abcLiveDrawing(model,bars,{timeframe,id,now});
 const inputs=model.inputValues||{},step=Number(timeframe)*60000;
 const viewBars=bars.filter(b=>b.time<=now);
 const displayed=plays.filter(p=>!p.end||inputs.keepHistory!==false),lines=[],labels=[],boxes=[];
 const line=(key,p,q,color,width=2,style='solid')=>{if([p.time,p.price,q.time,q.price].every(finite))lines.push({id:key,paneId:'unrouted',xloc:'bar_time',x1:p.time,y1:p.price,x2:q.time,y2:q.price,extend:'none',color,width,style,overlay:true,...(style==='dashed'?{deskDashPattern:[5,6]}:{})});};
 const label=(key,p,text,color,tooltip)=>labels.push({id:key,paneId:'unrouted',xloc:'bar_time',x:p.time,y:p.price,yloc:'price',text,style:'none',noFill:true,textColor:color,size:'tiny',textAlign:'left',overlay:true,tooltip});
 for(const play of displayed){
  if(!play.snapshot)continue;
  const done=Boolean(play.end),ink=play.direction===1?(inputs.longColor||TEAL):(inputs.shortColor||RED),faded=alpha(ink,'AA');
  const drawTick=play.tick||tick;
  const prefix=`${id}:play:${play.direction}:${play.armed}`,last=done?viewBars[play.endIndex]:viewBars.at(-1);
  if(!last)continue;
  const scope=done?viewBars.slice(0,play.endIndex+1):viewBars;
  const shape={...play.snapshot,inputValues:{...inputs,showProjection:done?false:inputs.showProjection},series:play.snapshot.series.map(s=>s.title===phaseTitle&&s.points[0].value===5?{...s,points:[{...s.points[0],value:4}]}:s)};
  const path=abcLiveDrawing(shape,scope,{timeframe,id:prefix,now:done?play.end.confirmedAt:now});
  for(const l of path.lines||[])lines.push(done?{...l,color:faded,style:'dashed',deskDashPattern:[5,6],width:2}:l);
  for(const l of path.labels||[])labels.push(done?{...l,textColor:faded,tooltip:(l.tooltip||'')+' Completed play; anchors frozen at its end candle.'}:l);
  if(play.levelKnownAt<play.start.time)line(prefix+':level-before-contact',{time:play.levelKnownAt,price:play.level},play.start,done?alpha(ink,'66'):alpha(YELLOW,'88'),1,'dashed');
  const end=done?play.end:{time:last.time+step*Math.max(1,Math.min(100,inputs.projectionBars??20)),price:play.level};
  const anchor=title=>play.snapshot.series.find(s=>s.title===title)?.points[0]?.value;
  const cTime=anchor('ABC drawing · C time'),hlTime=anchor('ABC drawing · structure time'),hl=anchor('ABC drawing · structure');
  if(inputs.showGeometryLine!==false&&finite(cTime)&&finite(play.c)&&finite(hlTime)&&finite(hl)&&hlTime>cTime){
   line(prefix+':geometry',{time:cTime,price:play.c},{time:hlTime,price:hl},done?faded:ink,2,done?'dashed':'solid');
   label(prefix+':structure-tag',{time:hlTime,price:hl},play.direction===1?'HL':'LH',done?faded:ink,'Confirmed post-C structure, recognized after its right-side candles closed.');
  }
  const bTime=anchor('ABC drawing · B time'),b=anchor('ABC audit · B');
  if(!done&&finite(bTime)&&finite(b))line(prefix+':B-threshold',{time:bTime,price:b},{time:end.time,price:b},alpha(ink,'88'),1,'dotted');
  if(inputs.showPlayBand!==false&&!done){
   const opacity=Math.max(.02,1-Math.min(98,Math.max(50,inputs.playBandAlpha??88))/100),hex=v=>Math.round(Math.min(1,v)*255).toString(16).padStart(2,'0');
   const depth=Math.max(drawTick||0,inputs.playBandMode==='Ticks'?(inputs.playBandTicks??30)*(drawTick||0):Math.abs(play.level)*(inputs.playBandPercent??.07)/100);
   boxes.push({id:prefix+':highlight',paneId:'unrouted',xloc:'bar_time',left:play.start.time,right:end.time,top:play.level+(play.direction===-1?depth:0),bottom:play.level-(play.direction===1?depth:0),extend:'none',bgColor:alpha(YELLOW,hex(opacity)),borderColor:alpha(YELLOW,'00'),borderWidth:0,overlay:true});
   line(prefix+':glow-outer',play.start,{time:end.time,price:play.level},alpha(YELLOW,hex(opacity)),10,'dashed');
   line(prefix+':glow-inner',play.start,{time:end.time,price:play.level},alpha(YELLOW,hex(opacity*3)),6,'dashed');
   line(prefix+':in-play',play.start,{time:end.time,price:play.level},YELLOW,2,'dashed');
  }else if(done&&inputs.showPlayBand!==false)line(prefix+':retired-level',play.start,{time:play.end.time,price:play.level},alpha(ink,'66'),1,'dashed');
  const range=scope.slice(-14).reduce((sum,b)=>sum+b.high-b.low,0)/Math.max(1,Math.min(14,scope.length)),pad=Math.max(range*.4,drawTick*2,Math.abs(play.level)*.00002);
  const mark=(name,p,color,tooltip)=>{line(prefix+':'+name+'-tick',p,{time:p.time+step*2,price:p.price},color,2,done?'dashed':'solid');label(prefix+':'+name+'-tag',{time:p.time,price:p.price+play.direction*pad},name.toUpperCase(),done?legible(ink):color,tooltip);labels.at(-1).size='small';};
  label(prefix+':level-tag',{time:last.time,price:play.level+play.direction*pad*.35},`TOUCHED ${play.level.toLocaleString('en-US',{maximumFractionDigits:8})} · ${done?'OVER':'IN PLAY'}`,done?legible(ink):YELLOW,'Exact liquidity price contacted at START. The dashed lead-in shows when this price was observed in the Liquidity feed; it is not a source-pivot timestamp.');labels.at(-1).size='small';
  mark('start',play.start,done?faded:YELLOW,`Liquidity contact at ${play.level}. Recognized on this completed candle; no intrabar order or fill is implied.`);
  if(done){
   mark('end',play.end,faded,`Play ended: ${play.end.reason}. End reference ${play.end.price}; completed candle close ${new Date(play.end.confirmedAt).toISOString()}. Research play, not a broker exit.`);
   const cTime=play.snapshot.series.find(s=>s.title==='ABC drawing · C time')?.points[0]?.value;
   if(inputs.showPath!==false&&finite(cTime)&&finite(play.c)&&play.end.time>cTime)line(prefix+':outcome',{time:cTime,price:play.c},play.end,faded,1,'dashed');
  }
 }
 const active=plays.find(p=>!p.end),focus=active||plays.at(-1),ended=focus?.end;
 const atEnd=title=>focus?.snapshot?.series.find(s=>s.title===title)?.points[0]?.value;
 const price=n=>finite(n)?n.toLocaleString('en-US',{maximumFractionDigits:8}):'Unconfirmed';
 const tables=(model.tables||[]).map(t=>{
  if(active?.qualifiedAt==null&&!ended)return t;
  const rows={1:['STAGE',active?'IN PLAY · tracking reversal':'PLAY OVER · '+ended.reason],2:['HTF CONTACT',price(focus.level)],3:['A / B',price(atEnd('ABC audit · A'))+' / '+price(atEnd('ABC audit · B'))],4:[ended?'C AT END':'C',price(atEnd('ABC audit · C'))],5:[ended?'END REASON':'LAST CHECK',ended?ended.reason:'Qualified retest · tracking move']};
  return {...t,cells:t.cells.map((row,i)=>rows[i]?row.map((cell,j)=>({...cell,text:rows[i][j]??cell.text})):row)};
 });
 return {...model,lines,labels,boxes,tables,abcPlays:displayed.map(p=>({drawingPrefix:`${id}:play:${p.direction}:${p.armed}`,levelKnownAt:p.levelKnownAt,direction:p.direction,level:p.level,start:p.start,end:p.end,qualifiedAt:p.qualifiedAt,status:p.end?'complete':'in-play'}))};
}
