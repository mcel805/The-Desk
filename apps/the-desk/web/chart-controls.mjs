import {tape} from './footprint.mjs';
import {chartSnapshot,chartScope,sameScope,owned} from './chart-chat-model.mjs';
const styles=new Set(['candles','bars','line','area','baseline']);
export function validateInputs(handle,values){
 if(!values||typeof values!=='object'||Array.isArray(values))throw Error('Expected indicator input values');
 for(const [key,value] of Object.entries(values)){
  const spec=[...handle.inputs].find(i=>(i.key||i.id)===key);if(!spec)throw Error('Unknown indicator input: '+key);
  const old=handle.inputValues()[key];if(typeof value!==typeof old)throw Error('Wrong input type: '+key);
  if(typeof value==='number'&&(!Number.isFinite(value)||(spec.type==='int'&&!Number.isInteger(value))||(spec.min!=null&&value<spec.min)||(spec.max!=null&&value>spec.max)))throw Error('Input outside range: '+key);
  if(spec.options&&!spec.options.includes(value))throw Error('Unsupported input option: '+key);
 }
 return values;
}
export function captureChart(ws){
 const source=ws.active.chart.renderer.screenshotCanvas();if(!source)throw Error('Chart image is not ready');
 const canvas=document.createElement('canvas'),scale=Math.min(1,1000/source.width);canvas.width=Math.round(source.width*scale);canvas.height=Math.round(source.height*scale);canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png');
}
function context(ws){return {footprint:tape.snapshot(),availableMarkets:['hyperliquid:BTC','hyperliquid:ETH','hyperliquid:SOL','coinbase:BTC-USD','coinbase:ETH-USD','coinbase:SOL-USD'],cells:ws.cells().map(c=>({id:c.id,market:c.chart.market,indicators:c.chart.indicators().map(h=>({id:h.id,title:h.title,inputs:[...h.inputs],values:h.inputValues(),source:h.source?.slice(0,25000)})),drawings:c.chart.drawings.all().slice(-60).map(d=>d.serialize?.()||d)}))};}
async function api(path,payload){const r=await fetch('/api/chart-controls/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(260000)});const data=await r.json();if(!r.ok)throw Error(data.error||'Chart assistant unavailable');return data;}
export async function applyChartCommands(ws,commands){
 if(!Array.isArray(commands)||commands.length>12)throw Error('Invalid chart commands');
 const previous=ws.getState(),receipts=[];
 try{
  for(const cmd of commands){
   if(cmd.op==='layout'){if(!['1','2h','2v','g1x3','4'].includes(cmd.value))throw Error('Unsupported layout');ws.setLayout(cmd.value);receipts.push({op:'layout',cells:ws.cells().length});continue;}
   const cell=ws.cells()[cmd.cell];if(!cell)throw Error('Chart no longer exists');const chart=cell.chart;
   if(cmd.op==='market'){const value=JSON.parse(cmd.value);if(Object.keys(value).some(k=>!['symbol','timeframe'].includes(k)))throw Error('Unsupported market change');if(value.symbol&&!context(ws).availableMarkets.includes(value.symbol))throw Error('Market feed is not available');if(value.timeframe&&!['1','2','3','5','15','30','60','120','240','D'].includes(value.timeframe))throw Error('Unsupported timeframe');ws.sync.set('symbol',false);ws.sync.set('timeframe',false);await chart.setMarket(value);await chart.ready();}
   else if(cmd.op==='style'){if(!styles.has(cmd.value))throw Error('Unsupported chart style');chart.renderer.set('priceStyle',cmd.value);}
   else if(cmd.op==='inputs'){const h=chart.indicators().find(h=>h.id===cmd.indicatorId);if(!h)throw Error('Indicator no longer exists');h.setInputs(validateInputs(h,JSON.parse(cmd.value)));}
   else if(cmd.op==='pine'){
    if(!cmd.source||cmd.source.length>25000||!cmd.source.includes('indicator(')||cmd.source.includes('strategy(')||cmd.source.includes('import '))throw Error('Only bounded self-contained Pine indicators are supported');
    const old=cmd.indicatorId?chart.indicators().find(h=>h.id===cmd.indicatorId):null;if(cmd.indicatorId&&!old)throw Error('Indicator to edit no longer exists');
    const result=await chart.runIndicator(cmd.source,{id:'assistant-'+crypto.randomUUID(),language:'pine'});if(!result.ok)throw result.error||Error('Pine compilation failed');old?.remove();
   }else if(cmd.op==='labels'){
    if(!['above','below'].includes(cmd.value))throw Error('Label position must be above or below');for(const d of chart.drawings.all().filter(owned))chart.drawings.update(d.id,{text:{...d.text,vAlign:cmd.value==='above'?'top':'bottom'}});
   }else if(cmd.op==='clear_broken'){
    const s=chartSnapshot({active:cell,replay:ws.replay}),closed=s.bars.filter(b=>b.time+({1:60000,2:120000,3:180000,5:300000,15:900000,30:1800000,60:3600000,120:7200000,240:14400000,D:86400000}[chart.market.timeframe]||60000)<=s.cutoff);
    for(const d of chart.drawings.all().filter(owned)){const a=d.anchors?.[0];if(!a||d.anchors?.length>2||d.anchors?.some(x=>x.price!==a.price))continue;const bars=closed.filter(b=>b.time>a.time),first=bars[0];if(first&&bars.some(b=>(first.close<a.price&&b.close>a.price)||(first.close>a.price&&b.close<a.price)))chart.drawings.remove(d.id);}
   }else if(cmd.op==='footprint')window.dispatchEvent(new Event('desk:open-footprint'));
   else throw Error('Unsupported chart operation: '+cmd.op);
   receipts.push({op:cmd.op,cell:cell.id,market:chart.market,indicators:chart.indicators().map(h=>({id:h.id,title:h.title})),drawingCount:chart.drawings.all().length});
  }
  return receipts;
 }catch(error){await ws.applyState(previous);throw error;}
}
export function setupChartControls({workspace,panel,status,user}){
 const form=panel.querySelector('#ccForm'),input=panel.querySelector('#ccInput'),tools=document.createElement('div');tools.className='cc-control-tools';tools.innerHTML='<label><input type="checkbox" id="ccControlMode"> Chart controls & indicators</label><button type="button" id="ccDictate" title="Dictate a draft; review before sending">🎙 Dictate</button>';
 form.prepend(tools);let busy=false;
 form.addEventListener('submit',async e=>{
  const tradeRequest=/\b(place|submit|cancel|close|flatten|reverse|buy|sell|short|long|move|amend|modify)\b/i.test(input.value)&&/\b(order|limit|stop|target|position|trade|btc|eth|sol)\b/i.test(input.value);
  if(tradeRequest||!panel.querySelector('#ccControlMode').checked)return;e.preventDefault();e.stopImmediatePropagation();if(busy)return;const text=input.value.trim();if(!text)return;busy=true;const ws=workspace(),scope=chartScope(ws);let applied=false;
  try{
   if(ws.replay.state.active)throw Error('Exit replay before changing charts through the assistant');
   const snapshot=chartSnapshot(ws),image=captureChart(ws),before=JSON.stringify(context(ws).cells);user(text);status('Looking at chart · preparing changes…');
   const plan=await api('plan',{text,snapshot,image,context:context(ws)});
   if(!sameScope(scope,chartScope(ws))||before!==JSON.stringify(context(ws).cells))throw Error('Chart changed during planning. Send again on the intended chart.');
   status('Applying chart changes…');const receipts=await applyChartCommands(ws,plan.commands);applied=true;input.value='';
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));status('Looking at chart · checking the result…');
   const result=await api('verify',{id:plan.id,image:captureChart(ws),facts:{receipts,context:context(ws)}});status(result.answer);
  }catch(error){status((applied?'Changes applied; visual review unavailable. ':'')+error.message,true);}finally{busy=false;}
 },true);
 const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition,button=panel.querySelector('#ccDictate');
 if(!Recognition){button.disabled=true;button.title='Speech dictation is unavailable in this browser';}
 else{const recognition=new Recognition();recognition.lang='en-US';recognition.interimResults=false;recognition.onresult=e=>{input.value+=(input.value?' ':'')+e.results[0][0].transcript;status('Dictation added to draft. Review, then send.');};recognition.onend=()=>{button.textContent='🎙 Dictate';};recognition.onerror=e=>status('Dictation: '+e.error,true);button.onclick=()=>{try{recognition.start();button.textContent='Listening…';}catch{recognition.stop();}};}
}
