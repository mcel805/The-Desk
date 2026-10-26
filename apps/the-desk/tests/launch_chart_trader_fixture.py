"""Full Desk UI against the real Engine and a private temporary paper ledger.
All candles/quotes are invented. No provider, wallet, broker or journal writes.
"""
import argparse
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys
import tempfile
import time
from urllib.parse import urlparse,parse_qs
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine import Engine
from settings_store import SettingsStore,SettingsConflict
ROOT=Path(__file__).resolve().parents[1]
WEB=Path(os.environ.get('DESK_CHART_BASELINE_WEB',str(ROOT/'web')))
PROVIDER='''export class DeskHyperliquidProvider {
 info(){return {name:'hyperliquid',displayName:'SYNTHETIC QA',supportedTimeframes:['1','5','60'],capabilities:{enumerate:true,stream:true,symbolInfo:true}};}
 async listSymbols(){return [{ticker:'BTC',description:'Synthetic BTC',type:'crypto'},{ticker:'ETH',description:'Synthetic ETH',type:'crypto'}];}
 async getSymbolInfo(symbol){return {ticker:symbol,tickerid:'HYPERLIQUID:'+symbol,prefix:'HYPERLIQUID',description:'SYNTHETIC QA',type:'crypto',currency:'USD',mintick:1,pricescale:1,timezone:'Etc/UTC',session:'24x7'};}
 async getBars(symbol,tf){const end=Math.floor(Date.now()/60000)*60000;return Array.from({length:160},(_,i)=>{const p=80000+Math.sin(i/9)*1300;return {time:end-(159-i)*Number(tf)*60000,open:p,high:p+80,low:p-80,close:p+Math.sin(i)*20,volume:10};});}
 subscribe(){return ()=>{};}
}'''
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=0);args=parser.parse_args()
 with tempfile.TemporaryDirectory(prefix='desk-chart-qa-') as tmp:
  engine=Engine(Path(tmp)/'paper.sqlite3');settings=SettingsStore(engine)
  account=engine.execute('init','account',{'name':'ISOLATED CHART QA','capital':'1000000','fee_bps':'0','leverage':'1'})['id']
  commands=[];faults={}
  if os.environ.get('DESK_CHART_BASELINE_WEB'):settings.commit({'trading':{'instant':True}})
  def quotes():
   for i in ['hyperliquid:BTC','hyperliquid:ETH','coinbase:BTC-USD']:engine.ingest(i,79999,80000,{'tick':'1','qty_step':'.001'})
  class Handler(SimpleHTTPRequestHandler):
   def __init__(self,*a,**kw):super().__init__(*a,directory=str(WEB),**kw)
   def log_message(self,*a):pass
   def reply(self,value,status=200):
    body=json.dumps(value).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
   def do_GET(self):
    parsed=urlparse(self.path);path=parsed.path;q=parse_qs(parsed.query)
    if path=='/hyperliquid-provider.mjs':
     body=PROVIDER.encode();self.send_response(200);self.send_header('Content-Type','text/javascript');self.end_headers();self.wfile.write(body);return
    if path=='/api/state':
     if faults.get('state_delay'):time.sleep(faults['state_delay'])
     quotes();return self.reply({**engine.state(q.get('account_id',[account])[0]),'journal_url':'http://127.0.0.1:1','journal_available':False})
    if path=='/api/settings/state':return self.reply(settings.state())
    if path=='/api/settings':return self.reply(settings.state()['values'])
    if path=='/api/ibkr/status':return self.reply({'configured_mode':'off','connected':False})
    if path=='/qa/commands':return self.reply(commands)
    if path.startswith('/api/'):
     return self.reply({'connected':False,'accounts':[],'symbols':{},'sessions':[],'running':False,'enabled':False})
    return super().do_GET()
   def do_POST(self):
    p=json.loads(self.rfile.read(int(self.headers['Content-Length'])));path=urlparse(self.path).path
    try:
     if path=='/qa/faults':faults.clear();faults.update(p);return self.reply({'ok':True})
     if path=='/qa/quote':engine.ingest(p.get('instrument','hyperliquid:BTC'),p['bid'],p['ask'],{'tick':'1','qty_step':'.001'});return self.reply({'ok':True})
     if path=='/api/command-status':
      if set(p)!={'key','action','payload'}:return self.reply({'error':'Invalid command status request'},400)
      if faults.get('command_status_offline'):return self.reply({'error':'Synthetic status outage'},503)
      return self.reply(engine.command_status(p['key'],p['action'],p['payload']))
     if path=='/api/command':
      if faults.get('command_delay'):time.sleep(faults['command_delay'])
      if faults.get('reject'):return self.reply({'error':'Synthetic command rejection'},400)
      quotes();key=self.headers.get('Idempotency-Key');result=engine.execute(key,p['action'],p['payload']);commands.append({**p,'key':key,'at':time.time()})
      if faults.get('drop_command_response'):self.close_connection=True;return
      return self.reply(result)
     if path=='/api/settings/commit':return self.reply(settings.commit(p['values'],p['expected'],p['writer']))
     return self.reply({'error':'No external writes in chart QA'},403)
    except SettingsConflict as e:return self.reply({'error':str(e),'state':e.state},409)
    except ValueError as e:return self.reply({'error':str(e)},400)
  server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
  print('http://127.0.0.1:'+str(server.server_port),flush=True);server.serve_forever()
if __name__=='__main__':main()
