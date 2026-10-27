"""Isolated chart-ownership rendering fixture. Synthetic bars/votes, no model or broker."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
import sys, json, math, time
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from swing_warnings import WarningEngine
HTML='''<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/desk.css"><link rel="stylesheet" href="/swing-tracker.css"><style>body{display:block}header{height:60px;display:flex;align-items:center;gap:14px;padding:10px}#workspace{height:calc(100vh - 95px)}.fixture-label{padding:8px;color:#e3b75d}</style></head><body><header><strong>THE DESK · VIEW TEST</strong><button id="swingTrackerButton">Swing Tracker 1.2</button><a href="/swing-lab.html">Swing Lab ↗</a></header><div class="fixture-label">SYNTHETIC RENDER TEST · invented prices and Jev votes · no paid requests or ledger writes</div><div id="workspace"></div><script type="module">
import {VelaWorkspace} from '/vendor/vela.js';
import {setupSwingTracker} from '/swing-tracker.mjs';
const end=Math.floor(Date.now()/60000)*60000;
const bars=(tf)=>Array.from({length:160},(_,i)=>{const p=100+Math.sin(i/9)*8;return {time:end-(159-i)*Number(tf)*60000,open:p,high:p+2,low:p-2,close:p+Math.sin(i),volume:10};});
class SyntheticProvider{
 info(){return {name:'hyperliquid',displayName:'SYNTHETIC TEST',supportedTimeframes:['1','5','60'],capabilities:{enumerate:true,stream:true,symbolInfo:true}};}
 async listSymbols(){return [{ticker:'BTC',description:'SYNTHETIC BTC',type:'crypto'},{ticker:'ETH',description:'SYNTHETIC ETH',type:'crypto'}];}
 async getSymbolInfo(symbol){return {ticker:symbol,tickerid:'HYPERLIQUID:'+symbol,prefix:'HYPERLIQUID',description:'SYNTHETIC TEST',type:'crypto',currency:'USD',mintick:.1,pricescale:10,timezone:'Etc/UTC',session:'24x7'};}
 async getBars(symbol,tf){return bars(tf);}
 subscribe(){return ()=>{};}
}
const warningFixture=__WARNING_FIXTURE__;
const dotBars=bars('1').slice(-18,-3),status={symbols:{'hyperliquid:BTC':{status:'OBSERVING',running:true,observed_at:Date.now(),snapshot:{cutoff:end,warnings:warningFixture},dots:dotBars.flatMap((b,i)=>Array.from({length:4},(_,slot)=>({id:'synthetic-'+i+'-'+slot,bar:b.time,high:b.high,low:b.low,slot:slot+1,vote:['up','down','flat','up'][(i+slot)%4],observed_at:b.time+1000+slot*15000,prediction_bar:b.time+60000,cadence_seconds:15,service:'SYNTHETIC_RENDER_TEST'})))},'hyperliquid:ETH':{status:'PAUSED',running:false}}};
const originalFetch=window.fetch.bind(window);let reads=0;
window.fetch=(input,init)=>{if(input==='/api/swing/status'){reads++;status.symbols['hyperliquid:BTC'].observed_at=Date.now();return Promise.resolve(new Response(JSON.stringify(status),{headers:{'Content-Type':'application/json'}}));}return originalFetch(input,init);};
localStorage.setItem('desk.swing.v12.visible','true');localStorage.removeItem('desk.swing.chart');
const ws=new VelaWorkspace('#workspace',{layout:'4',symbol:'hyperliquid:BTC',timeframe:'1',providers:{hyperliquid:()=>new SyntheticProvider()},live:false,theme:'dark',nativeBackend:'canvas2d',bars:160,volume:false,drawings:true,timeframes:['1','5','60']});
ws.sync.set('timeframe',false);ws.sync.set('symbol',false);
await Promise.all(ws.cells().map(async(c,i)=>{await c.chart.ready();await c.chart.setMarket({timeframe:['60','5','1','1'][i]});}));
setupSwingTracker({workspace:()=>ws});
window.swingViewTest={workspace:ws,status,get reads(){return reads;},ready:true};
</script></body></html>'''
def render_html():
 end=int(time.time()*1000)//60000*60000
 engine=WarningEngine({'side':1})
 for i in range(159):
  price=100+math.sin(i/9)*8
  engine.feed({'time':end-(159-i)*60000,'open':price,'high':price+2,'low':price-2,'close':price+math.sin(i),'volume':10})
 evidence={'version':'swing-warnings-1.3.0','closed':engine.last_snapshot,'events':[{**x,'scope':'WARMUP'} for x in engine.events[-80:]]}
 return HTML.replace('__WARNING_FIXTURE__',json.dumps(evidence))

class Handler(SimpleHTTPRequestHandler):
 def do_GET(self):
  if self.path=='/':
   body=render_html().encode();self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
  else:super().do_GET()
 def log_message(self,*args):pass
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=18897);args=parser.parse_args()
 if args.port!=18897:raise SystemExit('Fixture requires isolated port 18897')
 web=Path(__file__).resolve().parents[1]/'web'
 ThreadingHTTPServer(('127.0.0.1',args.port),lambda *a,**kw:Handler(*a,directory=str(web),**kw)).serve_forever()
