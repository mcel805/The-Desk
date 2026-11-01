import {marketIdentity} from './trading-model.mjs';
import {RecordingLifecycle} from './trade-recorder-model.mjs';
export function setupTradeRecorder({workspace,state,broker,toast}){
 const button=document.createElement('button');button.id='tradeRecorder';button.textContent='○ Record trades';button.title='Arm automatic chart recording for this account and chart';document.querySelector('.quote-strip .header-spacer').before(button);
 const library=document.createElement('a');library.href='/trade-videos.html';library.target='_blank';library.rel='noopener';library.textContent='Videos ↗';button.after(library);
 let armed=false,pinned=null,life=null,recorder=null,stream=null,canvas=null,context=null,session=null,queue=Promise.resolve(),seq=0,queuedBytes=0,starting=false,stopping=false,failed=false,lastState=null,lastPaint=0,savedBytes=0,lastSaved=0,automatic=localStorage.getItem('desk.recorder.auto')!=='false',autoAttempted=false;
 async function api(path,data){const r=await fetch('/api/trade-videos'+path,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const v=await r.json();if(!r.ok)throw Error(v.error||'Video storage unavailable');return v;}
 function paint(now){
  if(!armed&&!recorder)return;
  requestAnimationFrame(paint);if(!canvas||now-lastPaint<66)return;lastPaint=now;
  const host=pinned.cell.host,rect=host.getBoundingClientRect();context.fillStyle='#131722';context.fillRect(0,0,canvas.width,canvas.height);
  const sx=canvas.width/Math.max(1,rect.width),sy=(canvas.height-32)/Math.max(1,rect.height);
  for(const source of host.querySelectorAll('canvas')){const r=source.getBoundingClientRect();if(!r.width||!r.height)continue;try{context.drawImage(source,(r.left-rect.left)*sx,32+(r.top-rect.top)*sy,r.width*sx,r.height*sy);}catch{}}
  for(const label of host.querySelectorAll('.trade-line-controls,.trade-price-badge')){const r=label.getBoundingClientRect();if(!r.width||!r.height)continue;const x=(r.left-rect.left)*sx,y=32+(r.top-rect.top)*sy;context.fillStyle='#1e222d';context.fillRect(x,y,r.width*sx,r.height*sy);context.fillStyle=getComputedStyle(label).color;context.font='11px sans-serif';context.fillText(label.textContent,x+3,y+14);}
  context.fillStyle='#d1d4dc';context.font='12px sans-serif';context.fillText(`${pinned.instrument} · ${pinned.timeframe} · PAPER · ${new Date().toISOString()}`,10,21);
 }
 function label(text){button.textContent=text;button.setAttribute('aria-pressed',String(armed));button.title=lastSaved?'USB recording · '+(savedBytes/1024).toFixed(0)+' KB saved · last chunk '+new Date(lastSaved).toLocaleTimeString():text;}
 function error(e){failed=true;toast('Recording interrupted: '+e.message,true);label('⚠ Video interrupted');void stop('error');}
 async function start(){
  if(starting||recorder||stopping)return;starting=true;
  try{
   const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(x=>MediaRecorder.isTypeSupported(x));if(!mime)throw Error('WebM recording is unavailable in this browser');
   session=await api('/start',{account_id:pinned.account,instrument:pinned.instrument,timeframe:pinned.timeframe,mime});
   if(!armed){await api('/finish',{id:session.id,reason:'disarmed'});return;}
   canvas=document.createElement('canvas');const rect=pinned.cell.host.getBoundingClientRect();canvas.width=Math.min(1920,Math.max(640,Math.round(rect.width)));canvas.height=Math.max(360,Math.round(rect.height)+32);context=canvas.getContext('2d');stream=canvas.captureStream(15);
   savedBytes=0;lastSaved=0;recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:1800000});seq=0;queuedBytes=0;queue=Promise.resolve();failed=false;
   recorder.ondataavailable=e=>{if(!e.data.size)return;const chunk=e.data,index=seq++;queuedBytes+=chunk.size;if(queuedBytes>24*1024*1024){error(Error('Storage cannot keep up with recording'));return;}
    queue=queue.then(async()=>{if(failed)throw Error('Upload queue stopped');let last;for(let attempt=0;attempt<3;attempt++){try{const r=await fetch('/api/trade-videos/chunk?'+new URLSearchParams({id:session.id,sequence:index}),{method:'POST',headers:{'Content-Type':'video/webm'},body:chunk,signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error((await r.json()).error||'Video chunk rejected');queuedBytes-=chunk.size;savedBytes+=chunk.size;lastSaved=Date.now();label(life?.deadline?'● Post-trade '+Math.max(0,Math.ceil((life.deadline-Date.now())/1000))+'s':'● Recording');return;}catch(e){last=e;}}throw last;}).catch(e=>{if(!failed)error(e);});};
   recorder.onerror=e=>error(e.error||Error('Encoder failed'));recorder.start(1000);label('● Recording');
  }catch(e){error(e);}finally{starting=false;}
 }
 async function stop(reason='disarmed'){
  if(stopping)return;stopping=true;armed=false;
  try{
   if(recorder&&recorder.state!=='inactive')await new Promise(resolve=>{recorder.addEventListener('stop',resolve,{once:true});recorder.stop();});
   await queue;if(session)await api('/finish',{id:session.id,reason:failed?'error':reason});
  }catch(e){failed=true;toast('Video archive: '+e.message,true);}
  finally{stream?.getTracks().forEach(t=>t.stop());recorder=null;canvas=null;session=null;stopping=false;label(failed?'⚠ Video interrupted':'○ Record trades');if(automatic&&['closed','cancelled'].includes(reason))autoAttempted=false;}
 }
 function observe(s){
  if(!armed||!pinned||!s)return;lastState=s;
  const ws=workspace();if(s.active_account!==pinned.account||broker()||ws.active!==pinned.cell||marketIdentity(ws.chart)!==pinned.instrument||ws.replay.state.active||String(ws.chart.market.timeframe)!==pinned.timeframe){void stop('context-changed');return;}
  const scope={orders:s.orders.filter(o=>o.instrument===pinned.instrument),positions:s.positions.filter(p=>p.instrument===pinned.instrument)};
  const event=life.observe(scope,Date.now());if(event==='start')void start();else if(event==='closed'||event==='cancelled')void stop(event);else if(life.deadline)label('● Post-trade '+Math.max(0,Math.ceil((life.deadline-Date.now())/1000))+'s');
 }
 button.onclick=async()=>{
  if(armed||recorder){automatic=false;localStorage.setItem('desk.recorder.auto','false');void stop('disarmed');return;}if(starting||stopping)return;
  const ws=workspace(),s=state();if(!ws||!s||broker()||ws.replay.state.active){toast('Select a paper account and exit replay to record.',true);return;}
  if(!globalThis.MediaRecorder||!HTMLCanvasElement.prototype.captureStream){toast('This browser does not support chart recording.',true);return;}
  const market=ws.chart.market,instrument=marketIdentity(ws.chart);
  automatic=true;autoAttempted=true;localStorage.setItem('desk.recorder.auto','true');pinned={cell:ws.active,account:s.active_account,instrument,timeframe:String(market.timeframe)};life=new RecordingLifecycle();armed=true;failed=false;label('◉ Armed');toast('Chart recorder armed. Keep this chart visible. Recording starts at a working limit or an open position.');requestAnimationFrame(paint);observe(s);
 };
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&armed)void stop('hidden');});
 window.addEventListener('beforeunload',e=>{if(armed||recorder){e.preventDefault();e.returnValue='Recording is active';}});
 setInterval(()=>{if(automatic&&!autoAttempted&&state()&&workspace()&&!broker()){autoAttempted=true;button.click();}if(armed)observe(state()||lastState);},250);
 return {observe};
}
