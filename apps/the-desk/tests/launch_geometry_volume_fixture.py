"""Isolated synthetic five-frame geometry chart. No accounts, brokers or paid services."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HTML='''<!doctype html><html><head><meta charset="utf-8"><title>Geometry Volume · synthetic acceptance</title><link rel="stylesheet" href="/desk.css"><link rel="stylesheet" href="/pine-editor.css"><style>body{display:block}header{height:65px;padding:10px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}#workspace{height:calc(100vh - 115px)}.notice{height:50px;padding:8px 16px;color:var(--amber);font-size:12px}button{border:1px solid var(--line)}</style></head><body><header><strong>THE DESK · GEOMETRY VOLUME</strong><button id="settings">Geometry settings</button><button id="theme">Light / dark</button><button id="save">Save study</button><button id="restore">Restore study</button><button id="outage">Toggle 30M outage</button></header><div class="notice">SYNTHETIC ACCEPTANCE FIXTURE · invented OHLCV on five source intervals · no market/trade claims</div><div id="workspace"></div><script type="module">
import {VelaWorkspace} from '/vendor/vela.js';
import {setupGeometryVolumeView} from '/geometry-volume-view.mjs';
import {setupPineEditor,createPineEngine} from '/pine-editor.mjs';
import {DeskPineEngine} from '/pine-runtime.mjs';
import {pineState,restorePineState} from '/pine-state.mjs';
const baseEnd=Math.floor(Date.now()/3600000)*3600000,requests=[];let end=baseEnd,offline=false,saved,ws;
const minuteBar=time=>{const k=(time-(baseEnd-1250*60000))/60000,p=52000+150*Math.sin(k/20)+50*Math.sin(k/4)+k*.2;return {time,open:p,high:p+10,low:p-10,close:p+2,volume:100+40*Math.sin(k/6)+(k%57===0?700:0)};};
const bars=tf=>Array.from({length:1250},(_,i)=>{const ms=Number(tf)*60000,time=Math.floor(end/ms)*ms-(1250-i)*ms;if(tf==='1')return minuteBar(time);if(tf==='5'){const rows=Array.from({length:5},(_,n)=>minuteBar(time+n*60000));return {time,open:rows[0].open,high:Math.max(...rows.map(b=>b.high)),low:Math.min(...rows.map(b=>b.low)),close:rows[4].close,volume:rows.reduce((n,b)=>n+b.volume,0)};}const k=(time-(Math.floor(baseEnd/ms)*ms-1250*ms))/ms,p=52000+150*Math.sin(k/20)+50*Math.sin(k/4)+k*.2;return {time,open:p,high:p+10,low:p-10,close:p+2,volume:100+40*Math.sin(k/6)+(k%57===0?700:0)};});
class Provider{info(){return {name:'fixture',displayName:'SYNTHETIC GEOMETRY',supportedTimeframes:['1','5','15','30','60'],capabilities:{enumerate:true,stream:true,symbolInfo:true}};}async listSymbols(){return [{ticker:'TEST',description:'Invented geometry candles',type:'crypto'}];}async getSymbolInfo(s){return {ticker:s,tickerid:'fixture:'+s,prefix:'fixture',description:'SYNTHETIC GEOMETRY',type:'crypto',currency:'USD',mintick:1,pricescale:1,timezone:'UTC',session:'24x7'};}async getBars(s,tf,range={}){requests.push({s,tf,range});if(offline&&tf==='30')throw Error('Synthetic 30M outage');const rows=bars(tf).filter(b=>(range.from==null||b.time>=range.from)&&(range.to==null||b.time<=range.to));return range.limit?rows.slice(-range.limit):rows;}subscribe(){return ()=>{};}}
const clock=(market,id)=>{const c=ws?.chart,r=c?.replay.state;return {light:document.body.classList.contains('light'),replay:!!r?.active,cutoff:r?.active?r.cursorTime+(r.nextTime===r.cursorTime?0:Number(market.timeframe)*60000):end};};
setupPineEditor({saveSettings:async()=>{},geometryContext:clock});
let engine;ws=new VelaWorkspace('#workspace',{layout:'1',symbol:'fixture:TEST',timeframe:'1',bars:600,providers:{fixture:()=>new Provider()},engines:{pine:()=>engine=createPineEngine()},live:false,theme:'dark',nativeBackend:'canvas2d',volume:false,drawings:true,timeframes:['1','5','15','30','60']});
setupGeometryVolumeView({workspace:()=>ws});
await ws.chart.ready();await ws.chart.historyComplete();const source=await(await fetch('/pine-examples/agentic-geometry-volume.pine')).text();
const study=()=>ws.chart.indicators().find(h=>h.source?.includes('indicator("Agentic - Geometry - Volume",'));
document.querySelector('#settings').onclick=()=>ws.chart.renderer.openIndicatorSettings(study()?.id);
document.querySelector('#theme').onclick=()=>{document.body.classList.toggle('light');ws.setTheme(document.body.classList.contains('light')?'light':'dark');study()?.setInputs({});};
document.querySelector('#save').onclick=()=>{saved=pineState(ws.chart);localStorage.setItem('geometry.volume.fixture',JSON.stringify(saved));};
document.querySelector('#restore').onclick=()=>{saved=JSON.parse(localStorage.getItem('geometry.volume.fixture'));restorePineState(saved,{chart:ws.chart,addIndicator:e=>ws.chart.addIndicator(e.script,{...e,inputs:e.inputs})});};
document.querySelector('#outage').onclick=()=>{offline=!offline;end+=1800000;engine.active.get(study()?.id)?.notifyBars('complete');};
window.gvFixture={ws,get engine(){return engine;},requests,source,get end(){return end;},bars,study,get offline(){return offline;},model:()=>engine.records.get(study()?.id)?.model,sceneModel:()=>ws.chart.rendererControl.renderer.scene.indicators.get(study()?.id)};
</script></body></html>'''
class Handler(SimpleHTTPRequestHandler):
 def do_GET(self):
  if self.path=='/':
   body=HTML.encode();self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
  else:super().do_GET()
 def log_message(self,*args):pass
if __name__=='__main__':
 import argparse
 parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=18917);args=parser.parse_args()
 web=Path(__file__).resolve().parents[1]/'web'
 ThreadingHTTPServer(('127.0.0.1',args.port),lambda *a,**kw:Handler(*a,directory=str(web),**kw)).serve_forever()
