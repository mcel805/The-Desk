import {registerWidgetAction,registerStatePersistence,registerLegendAction} from './vendor/vela.js';
import {pineState,restorePineState} from './pine-state.mjs';
import {DeskPineEngine} from './pine-runtime.mjs';
import {checkPineSource,sourceHash,drawingCounts,validationSource,plotRows,rowsToCsv,compareReference,timeframeDuration} from './pine-validation.mjs';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const engines=new Set();
let services,context,library=[],tested=null,report=null,testing=false,generation=0,testAbort=null;
const dialog=document.createElement('dialog');dialog.id='pineEditor';dialog.setAttribute('aria-label','Indicators and Pine Script');document.body.append(dialog);
function download(name,content,type='application/json'){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function close(){if(!testing){dialog.close();generation++;}}
dialog.addEventListener('cancel',e=>{if(testing)e.preventDefault();});
function message(text,error=false){const el=dialog.querySelector('#pineFeedback');if(el){el.textContent=text;el.classList.toggle('error',error);}}
function current(){return context?.chart;}
function studyName(h){return getEngine().records.get(h.id)?.model.title||(h.source?.match(/^\s*indicator\s*\(\s*(?:title\s*=\s*)?["']([^"']+)/m)?.[1])||h.title;}
function hideOtherDialogs(){current()?.renderer.closeDialogs();}
export function createPineEngine(){const engine=new DeskPineEngine();engines.add(engine);return engine;}
function getEngine(){return {records:{get:id=>[...engines].map(e=>e.records.get(id)).find(Boolean)},cancelTests:()=>{for(const e of engines)e.cancelTests();}};}
window.addEventListener('pagehide',()=>{for(const e of engines)e.terminate();});
export function setupPineEditor(opts){
 services=opts;
 registerWidgetAction({id:'indicators',target:'topbar',label:'Indicators',icon:'indicator',align:'left',run:ctx=>open(ctx,'library')});
 registerLegendAction({id:'desk.pine-source',icon:'code',tooltip:'Edit Pine Script',when:i=>Boolean(i.source),run:(ctx,i)=>open(ctx,'create',i.source)});
 registerStatePersistence({key:'desk.pine.v1',scope:'cell',serialize:ctx=>pineState(ctx.chart,studyName),restore:restorePineState});
}
export async function loadPineLibrary(settings){library=Array.isArray(settings.pineLibrary)?settings.pineLibrary.filter(s=>s&&typeof s.source==='string'&&typeof s.name==='string').slice(0,6):[];}
function open(ctx,tab,source=''){
 if(testing)return;context=ctx;hideOtherDialogs();tested=null;report=null;
 dialog.innerHTML=`<div class="pine-header"><div><h2>Indicators</h2><p>Built-in studies and your Pine Script source</p></div><button id="pineClose" aria-label="Close indicator editor">✕</button></div><div class="pine-tabs" role="tablist"><button role="tab" data-tab="library">Built-in library</button><button role="tab" data-tab="saved">My Pine indicators</button><button role="tab" data-tab="create">Create Pine Script indicator</button></div><div id="pineBody"></div><p id="pineFeedback" role="status" aria-live="polite"></p>`;
 dialog.querySelector('#pineClose').onclick=close;dialog.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>renderTab(b.dataset.tab));
 dialog.showModal();renderTab(tab,source);
}
async function renderTab(tab,source=''){
 generation++;tested=null;report=null;const revision=generation;
 dialog.querySelectorAll('[data-tab]').forEach(b=>{b.setAttribute('aria-selected',b.dataset.tab===tab);b.classList.toggle('active',b.dataset.tab===tab);});
 message('');const body=dialog.querySelector('#pineBody');
 if(tab==='library'){
  body.innerHTML='<label>Search built-in indicators<input id="pineLibrarySearch" type="search" placeholder="Search indicators"></label><div id="pineOnChart"></div><div id="pineFeatured" class="pine-catalog"></div><div id="pineBuiltins" class="pine-catalog"></div>';
  const items=await current().availableNativeIndicators();if(revision!==generation)return;
  const render=()=>{const q=dialog.querySelector('#pineLibrarySearch').value.toLowerCase();dialog.querySelector('#pineFeatured').innerHTML="cleo's liquidity".includes(q)?'<button id="pineCleo">Cleo\'s Liquidity<span>Open &amp; test</span></button>':'';const cleo=dialog.querySelector('#pineCleo');if(cleo)cleo.onclick=()=>loadExample('/pine-examples/cleos-liquidity.pine',true);dialog.querySelector('#pineBuiltins').innerHTML=items.filter(i=>i.supported&&i.title.toLowerCase().includes(q)).map(i=>`<button data-native="${esc(i.type)}">${esc(i.title)}<span>Add</span></button>`).join('');dialog.querySelectorAll('[data-native]').forEach(b=>b.onclick=()=>{context.addNativeIndicator(b.dataset.native);renderOnChart();});};
  dialog.querySelector('#pineLibrarySearch').oninput=render;render();renderOnChart();
 }
 if(tab==='saved'){
  body.innerHTML=library.length?library.map((s,i)=>`<article class="pine-saved"><h3>${esc(s.name)}</h3><p>${esc(s.validation?.status||'Source saved')} · Pine ${esc(s.version||'5/6')}</p><div><button data-open-source="${i}">Edit &amp; test</button><button data-add-source="${i}">Add to chart</button><button data-download-source="${i}">Source</button><button data-delete-source="${i}">Delete saved source</button></div></article>`).join(''):'<p>No saved Pine indicators. Choose Create Pine Script indicator to paste your source.</p>';
  dialog.querySelectorAll('[data-open-source]').forEach(b=>b.onclick=()=>renderTab('create',library[b.dataset.openSource].source));
  dialog.querySelectorAll('[data-add-source]').forEach(b=>b.onclick=()=>addSource(library[b.dataset.addSource]));
  dialog.querySelectorAll('[data-download-source]').forEach(b=>b.onclick=()=>download('indicator.pine',library[b.dataset.downloadSource].source,'text/plain'));
  dialog.querySelectorAll('[data-delete-source]').forEach(b=>b.onclick=async()=>{try{const next=library.filter((_,i)=>i!==Number(b.dataset.deleteSource));await services.saveSettings({pineLibrary:next});library=next;renderTab('saved');message('Removed saved source. Indicators already on charts remain available.');}catch(e){message(e.message,true);}});
  body.insertAdjacentHTML('afterbegin','<div id="pineOnChart"></div>');renderOnChart();
 }
 if(tab==='create'){
  body.innerHTML=`<div class="pine-intro"><p>Paste a self-contained Pine v5/v6 indicator. Compile and test it on this chart, then add the original source to the chart.</p><button id="pineCleoExample">Load Cleo’s Liquidity</button><button id="pineExample">Load Market Gravity example</button></div><label>Indicator name<input id="pineName" maxlength="120" placeholder="Read from indicator() after compilation"></label><label>Pine Script source<textarea id="pineSource" spellcheck="false" placeholder="//@version=6\nindicator(\"My indicator\", overlay=true)\nplot(ta.sma(close, 20))">${esc(source)}</textarea></label><div class="pine-actions"><button id="pineTest" class="primary">Compile &amp; test</button><button id="pineAdd" disabled>Add to chart</button><button id="pineSave" disabled>Save indicator</button><button id="pineCancelTest" hidden>Cancel test</button></div><div id="pineReport"></div>`;
  dialog.querySelector('#pineSource').oninput=()=>{tested=null;report=null;dialog.querySelector('#pineAdd').disabled=true;dialog.querySelector('#pineSave').disabled=true;dialog.querySelector('#pineReport').replaceChildren();message('Source changed. Compile & test before adding.');};
  dialog.querySelector('#pineExample').onclick=()=>loadExample('/pine-examples/market-gravity.pine');
  dialog.querySelector('#pineCleoExample').onclick=()=>loadExample('/pine-examples/cleos-liquidity.pine');
  dialog.querySelector('#pineTest').onclick=testSource;
  dialog.querySelector('#pineAdd').onclick=()=>{if(tested)addSource(tested);};
  dialog.querySelector('#pineSave').onclick=saveSource;
  dialog.querySelector('#pineCancelTest').onclick=()=>{testAbort?.abort();getEngine().cancelTests();message('Test cancelled.');};
 }
}
async function loadExample(url,openEditor=false){try{const response=await fetch(url);if(!response.ok)throw Error('Indicator source could not be loaded.');const source=await response.text();if(openEditor)await renderTab('create',source);else{dialog.querySelector('#pineSource').value=source;dialog.querySelector('#pineSource').oninput();}}catch(e){message(e.message,true);}}
function renderOnChart(){const host=dialog.querySelector('#pineOnChart');if(!host)return;host.innerHTML='<h3>On this chart</h3>'+current().indicators().filter(h=>!h.id.startsWith('pine-test-')).map(h=>`<div class="pine-live"><span>${esc(studyName(h))}</span><button data-settings="${esc(h.id)}">Settings</button><button data-visibility="${esc(h.id)}">${h.visible?'Hide':'Show'}</button><button data-remove="${esc(h.id)}">Remove</button></div>`).join('');
 host.querySelectorAll('[data-settings]').forEach(b=>b.onclick=()=>{close();current().renderer.openIndicatorSettings(b.dataset.settings);});
 host.querySelectorAll('[data-visibility]').forEach(b=>b.onclick=()=>{const h=current().indicators().find(i=>i.id===b.dataset.visibility);h.setVisible(!h.visible);context.stateChanged();renderOnChart();});
 host.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{const h=current().indicators().find(i=>i.id===b.dataset.remove);h.remove();context.stateChanged();renderOnChart();});
}
async function testSource(){
 if(testing)return;const chart=current(),engine=getEngine(chart);const source=dialog.querySelector('#pineSource').value;let testHandle;
 try{
  checkPineSource(source);const asOf=Date.now(),controller=new AbortController();testAbort=controller;const checkCancelled=()=>{if(controller.signal.aborted)throw Error('Pine test cancelled.');};testing=true;tested=null;report=null;dialog.querySelector('#pineTest').disabled=true;dialog.querySelector('#pineCancelTest').hidden=false;dialog.querySelector('#pineSource').readOnly=true;dialog.querySelectorAll('[data-tab],#pineClose,#pineExample,#pineCleoExample,#pineAdd,#pineSave').forEach(b=>b.disabled=true);
  message('Compiling and testing original source…');await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Chart history did not finish loading within 60 seconds. Retry after it is ready.')),60000);const abort=()=>{clearTimeout(timer);reject(Error('Pine test cancelled.'));};controller.signal.addEventListener('abort',abort,{once:true});chart.historyComplete().then(()=>{clearTimeout(timer);controller.signal.removeEventListener('abort',abort);resolve();},reject);});
  const hash=await sourceHash(source);checkCancelled();const id='pine-test-'+crypto.randomUUID();
  const result=await chart.runIndicator(source,{id,language:'pine'});if(!result.ok)throw result.error;testHandle=result.handle;checkCancelled();
  const record=engine.records.get(id);if(!record)throw Error('The runtime did not return a test model.');
  const snapshot=await testHandle.context(['warnings','barIndex']);checkCancelled();
  const inputValues=testHandle.inputValues(),inputs=[...testHandle.inputs],name=record.model.title||testHandle.title;testHandle.remove();testHandle=null;
  let diagnostic=record,probeSource=validationSource(source);if(probeSource.probes.length){
   message('Testing comparison outputs…');const diagnosticId='pine-test-'+crypto.randomUUID();const probe=await chart.runIndicator(probeSource.source,{id:diagnosticId,language:'pine'});if(!probe.ok)throw probe.error;testHandle=probe.handle;checkCancelled();diagnostic=engine.records.get(diagnosticId);testHandle.remove();testHandle=null;
  }
  // A time cutoff applies to output export. Forming-bar visuals remain provisional on the chart.
  const duration=timeframeDuration(chart.market.timeframe);
  const completed=diagnostic.bars.filter(b=>b.time+duration<=asOf);if(!completed.length)throw Error('No completed bars were available for validation.');
  const rows=plotRows(diagnostic.model,diagnostic.bars,completed.at(-1).time);
  report={status:'Runtime test passed; TradingView comparison pending',sourceHash:hash,runtime:'PineTS 0.11.0 / Vela PineTS 0.2.15',name,market:record.market,bars:record.bars.length,completedBars:completed.length,completedCutoff:completed.at(-1).time,inputs,inputValues,drawings:record.counts,secondary:record.secondary,warnings:snapshot?.warnings||[],comparison:null,visualParity:'unverified',asOf:new Date(asOf).toISOString(),testedAt:new Date().toISOString()};
  tested={id:hash,name,source,version:source.match(/@version\s*=\s*(\d+)/)[1],validation:report};
  dialog.querySelector('#pineName').value=name;dialog.querySelector('#pineAdd').disabled=false;dialog.querySelector('#pineSave').disabled=false;
  renderReport(rows,probeSource.source);message('Original source compiled and ran successfully. Exact TradingView parity requires reference evidence.');
 }catch(e){message('Pine test failed: '+(e?.message||e),true);dialog.querySelector('#pineReport').textContent='No successful conversion was accepted. Fix the source or unsupported runtime feature and test again.';}
 finally{testHandle?.remove();testAbort=null;testing=false;dialog.querySelector('#pineSource').readOnly=false;dialog.querySelectorAll('[data-tab],#pineClose,#pineExample,#pineCleoExample,#pineTest').forEach(b=>b.disabled=false);dialog.querySelector('#pineCancelTest').hidden=true;}
}
function renderReport(rows,comparisonSource){
 const el=dialog.querySelector('#pineReport');el.innerHTML=`<article class="pine-result"><h3>Runtime test passed</h3><p>${esc(report.name)} · ${report.inputs.length} original inputs · ${report.completedBars} completed bars</p><p>${Object.entries(report.drawings).map(([k,v])=>esc(k)+': '+v).join(' · ')}</p><p>${esc(report.market.symbol)} · ${esc(report.market.timeframe)} · cutoff ${esc(new Date(report.completedCutoff).toISOString())}</p><p class="muted">Source preserved · SHA-256 ${report.sourceHash.slice(0,16)}…<br>TradingView comparison pending. Vela and TradingView can render fonts and curves differently.</p>${report.warnings.length?'<p class="error">'+esc(report.warnings.map(w=>w.message).join('; '))+'</p>':''}<div class="pine-actions"><button id="pineReportDownload">Test report</button><button id="pineSourceDownload">Original source</button><button id="pineComparisonSource">Comparison Pine</button><button id="pineCsv">Local output CSV</button></div><label>Compare TradingView CSV<input id="pineReference" type="file" accept=".csv,text/csv"></label><p class="muted">Run Comparison Pine on the same venue, interval, inputs and history in TradingView, then export chart data. OHLC must match. The comparison covers numeric outputs on shared completed bars.</p><p id="pineComparisonResult" role="status"></p></article>`;
 el.querySelector('#pineReportDownload').onclick=()=>download('The-Desk-Pine-Test.json',JSON.stringify(report,null,2));
 el.querySelector('#pineSourceDownload').onclick=()=>download('indicator.pine',tested.source,'text/plain');
 el.querySelector('#pineComparisonSource').onclick=()=>download('indicator-comparison.pine',comparisonSource,'text/plain');
 el.querySelector('#pineCsv').onclick=()=>download('The-Desk-Pine-Outputs.csv',rowsToCsv(rows),'text/csv');
 el.querySelector('#pineReference').onchange=async e=>{const out=el.querySelector('#pineComparisonResult');try{const file=e.target.files[0];if(!file)return;if(file.size>5000000)throw Error('CSV exceeds 5 MB.');const csv=await file.text();report.comparison={...compareReference(rows,csv),referenceFile:file.name,referenceHash:await sourceHash(csv),comparedAt:new Date().toISOString()};out.textContent=report.comparison.matched?'Numeric outputs matched on '+report.comparison.matchedBars+' shared completed bars. Visual parity remains unverified.':report.comparison.mismatchCount+' numeric mismatches across '+report.comparison.matchedBars+' shared bars.';out.classList.toggle('error',!report.comparison.matched);}catch(error){report.comparison=null;out.textContent=error.message;out.classList.add('error');}};
}
function addSource(item){try{if(current().indicators().filter(h=>h.source).length>=6)throw Error('Keep at most six Pine studies per chart.');checkPineSource(item.source);context.addIndicator({name:item.name,script:item.source,language:'pine',id:'desk-pine-'+crypto.randomUUID()});context.stateChanged();message('Added '+item.name+' to this chart. Settings are available on its legend.');}catch(e){message(e.message,true);}}
async function saveSource(){if(!tested)return;try{const name=dialog.querySelector('#pineName').value.trim()||tested.name;const item={...tested,name};const next=library.filter(x=>x.id!==item.id);if(next.length>=6)throw Error('The local library holds six source scripts. Edit an existing source or export it.');next.push(item);await services.saveSettings({pineLibrary:next});library=next;message('Saved '+name+' in My Pine indicators.');}catch(e){message(e.message,true);}}
