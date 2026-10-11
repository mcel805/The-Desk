"""Loopback-only The Desk app server and independent market/journal workers."""
from __future__ import annotations
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import threading
import time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from engine import Engine, dec

ROOT=Path(__file__).resolve().parent

def validate_pine_source(source):
    if not isinstance(source,str):raise ValueError('Invalid Pine indicator source')
    code=re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*[\s\S]*?\*/',lambda m:''.join('\n' if c=='\n' else ' ' for c in m.group()),source)
    if re.search(r'^\s*(?:strategy|library)\s*\(',code,re.M):raise ValueError('Strategies and library scripts are not supported here')
    if re.search(r'^\s*import\s',code,re.M):raise ValueError('Imported Pine libraries are not supported here')

def http_json(url,payload=None,headers=None,timeout=8):
    req=Request(url,data=json.dumps(payload).encode() if payload is not None else None,headers={'User-Agent':'TheDesk/0.1 (local paper terminal)','Content-Type':'application/json',**(headers or {})})
    with urlopen(req,timeout=timeout) as response:return json.load(response)

class Gateway:
    def __init__(self):
        self.meta={};self.cache={};self.errors={};self.lock=threading.RLock()
    def metadata(self,instrument):
        with self.lock:
            if instrument in self.meta:return self.meta[instrument]
        if instrument.startswith('coinbase:'):
            symbol=instrument.split(':')[1]
            product=http_json('https://api.exchange.coinbase.com/products/'+symbol)
            meta={'tick':product['quote_increment'],'qty_step':product['base_increment'],'market_type':'spot','currency':product['quote_currency']}
        else:
            allmeta=http_json('https://api.hyperliquid.xyz/info',{'type':'meta'})
            coin=instrument.split(':')[1]
            item=next(x for x in allmeta['universe'] if x['name']==coin)
            meta={'qty_step':str(10**(-item['szDecimals'])),'sz_decimals':item['szDecimals'],'market_type':'perpetual','currency':'USD'}
        with self.lock:self.meta[instrument]=meta
        return meta
    def quote(self,instrument):
        meta=self.metadata(instrument);symbol=instrument.split(':')[1]
        if instrument.startswith('coinbase:'):
            data=http_json('https://api.exchange.coinbase.com/products/'+symbol+'/book?level=2')
            bids=[{'price':x[0],'qty':x[1]} for x in data['bids'][:20]];asks=[{'price':x[0],'qty':x[1]} for x in data['asks'][:20]]
            bid=bids[0]['price'];ask=asks[0]['price'];source_time=None
        else:
            data=http_json('https://api.hyperliquid.xyz/info',{'type':'l2Book','coin':symbol})
            bids=[{'price':x['px'],'qty':x['sz']} for x in data['levels'][0]];asks=[{'price':x['px'],'qty':x['sz']} for x in data['levels'][1]]
            bid=bids[0]['price'];ask=asks[0]['price'];source_time=data.get('time')
            power=max(math.floor(math.log10(float(bid)))-4,-(6-meta['sz_decimals']))
            meta={**meta,'tick':str(10**power)}
        return bid,ask,{**meta,'book':{'bids':bids,'asks':asks},'source_time':source_time,'transport':'REST snapshot · refreshed every 3s'}
    def bars(self,instrument,timeframe,limit=600):
        key=(instrument,timeframe,limit)
        with self.lock:
            cached=self.cache.get(key)
            if cached and time.time()-cached[0]<10:return cached[1]
        minutes={'1m':1,'3m':3,'5m':5,'15m':15,'30m':30,'1h':60,'2h':120,'4h':240,'1d':1440}
        if timeframe not in minutes:raise ValueError('Unsupported interval')
        seconds=minutes[timeframe]*60;now=int(time.time());symbol=instrument.split(':')[1]
        if instrument.startswith('hyperliquid:'):
            data=http_json('https://api.hyperliquid.xyz/info',{'type':'candleSnapshot','req':{'coin':symbol,'interval':timeframe,'startTime':(now-limit*seconds)*1000,'endTime':now*1000}})
            bars=[{'time':int(x['t']),'open':float(x['o']),'high':float(x['h']),'low':float(x['l']),'close':float(x['c']),'volume':float(x['v'])} for x in data]
        else:
            native=max(x for x in (60,300,900,3600,21600,86400) if x<=seconds)
            raw={};end=now;remaining=min(1800,limit*max(1,seconds//native))
            while remaining>0:
                count=min(300,remaining);start=end-count*native
                query=urlencode({'granularity':native,'start':start,'end':end})
                data=http_json('https://api.exchange.coinbase.com/products/'+symbol+'/candles?'+query)
                for t,l,h,o,c,v in data:raw[int(t)]={'time':int(t)*1000,'open':float(o),'high':float(h),'low':float(l),'close':float(c),'volume':float(v)}
                if not data:break
                end=start-1;remaining-=count
            buckets={};counts={}
            for b in sorted(raw.values(),key=lambda x:x['time']):
                t=(b['time']//(seconds*1000))*seconds*1000
                counts[t]=counts.get(t,0)+1
                if t not in buckets:buckets[t]={**b,'time':t}
                else:
                    x=buckets[t];x['high']=max(x['high'],b['high']);x['low']=min(x['low'],b['low']);x['close']=b['close'];x['volume']+=b['volume']
            # Do not treat an incomplete aggregated historical bucket as a full bar.
            bars=[b for t,b in buckets.items() if counts[t]==seconds//native or t+seconds*1000>now*1000]
        bars=sorted(bars,key=lambda x:x['time'])[-limit:]
        result={'bars':bars,'instrument':instrument,'timeframe':timeframe,'as_of':now*1000,'last_completed':next((b['time'] for b in reversed(bars) if b['time']+seconds*1000<=now*1000),None),'status':'public provider snapshot','coverage':'Recent provider history; requested '+str(limit)+' returned '+str(len(bars))}
        with self.lock:self.cache[key]=(time.time(),result)
        return result

class Workers:
    def __init__(self,engine,gateway,journal_url,token):
        self.engine=engine;self.gateway=gateway;self.journal_url=journal_url.rstrip('/');self.token=token;self.journal_health=False;self.stop=threading.Event();self.market_cycles=0
    def start(self):
        for fn in (self.market,self.journal,self.timers):threading.Thread(target=fn,daemon=True).start()
    def timers(self):
        while not self.stop.is_set():
            self.engine.expire();self.stop.wait(1)
    def market(self):
        instruments=[p+':'+s for p,symbols in [('coinbase',['BTC-USD','ETH-USD','SOL-USD']),('hyperliquid',['BTC','ETH','SOL'])] for s in symbols]
        def load(i):
            try:
                bid,ask,meta=self.gateway.quote(i);self.engine.ingest(i,bid,ask,meta)
                self.gateway.errors.pop(i,None)
            except Exception as e:self.gateway.errors[i]=type(e).__name__+': market feed unavailable'
        with ThreadPoolExecutor(max_workers=6) as pool:
            while not self.stop.is_set():
                list(pool.map(load,instruments));self.market_cycles+=1;self.stop.wait(3)
    def dispatch(self):
        with self.engine.db() as db:
            rows=db.execute("SELECT * FROM outbox WHERE status='pending' AND next_attempt<=? ORDER BY sequence LIMIT 12",(time.time(),)).fetchall()
        for row in rows:
            try:
                if not self.token:raise ValueError('Journal bridge token is not configured')
                response=http_json(self.journal_url+'/api/integrations/count-desk',json.loads(row['payload']),{'Authorization':'Bearer '+self.token},timeout=5)
                if not response.get('accepted'):raise ValueError('Journal did not acknowledge event')
                with self.engine.db() as db:db.execute("UPDATE outbox SET status='delivered',error='',journal_account=COALESCE(?,journal_account) WHERE sequence=?",(response.get('accountId'),row['sequence']))
            except Exception as e:
                # Never expose tokens, response bodies or account details in diagnostics.
                code='HTTP '+str(e.code) if isinstance(e,HTTPError) else type(e).__name__
                with self.engine.db() as db:db.execute('UPDATE outbox SET attempts=attempts+1,next_attempt=?,error=? WHERE sequence=?',(time.time()+min(60,2**min(row['attempts']+1,6)),code+': Lux journal delivery unavailable',row['sequence']))
    def journal(self):
        while not self.stop.is_set():
            try:
                with urlopen(self.journal_url,timeout=2) as r:self.journal_health=r.status==200
            except Exception:self.journal_health=False
            self.dispatch();self.stop.wait(2)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=18880);parser.add_argument('--data-dir',default=str(ROOT/'data'));parser.add_argument('--no-workers',action='store_true');args=parser.parse_args()
    data=Path(args.data_dir);data.mkdir(parents=True,exist_ok=True)
    engine=Engine(data/'desk.sqlite3');gateway=Gateway()
    workers=Workers(engine,gateway,os.environ.get('LUX_JOURNAL_URL','http://127.0.0.1:3000'),os.environ.get('COUNT_DESK_JOURNAL_BRIDGE_TOKEN',''))
    if not engine.state()['accounts']:engine.execute('initial-account-v1','account',{'name':'The Desk Paper','capital':'100000','fee_bps':'5','leverage':'1'})
    if not args.no_workers:workers.start()
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT/'web'),**kw)
        def log_message(self,*a):pass
        def end_headers(self):
            self.send_header('X-Content-Type-Options','nosniff');self.send_header('Cache-Control','no-store');super().end_headers()
        def json(self,obj,status=200):
            content=json.dumps(obj).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(content)));self.end_headers();self.wfile.write(content)
        def trusted(self):
            host=self.headers.get('Host','')
            allowed=('127.0.0.1:'+str(args.port),'localhost:'+str(args.port))
            origin=self.headers.get('Origin')
            return host in allowed and (not origin or origin in ('http://'+h for h in allowed))
        def do_GET(self):
            if not self.trusted():return self.json({'error':'Loopback origin required'},403)
            parsed=urlparse(self.path);q=parse_qs(parsed.query);value=lambda name,default='':q.get(name,[default])[0]
            try:
                if parsed.path=='/api/health':return self.json({'ok':True,'application':'The Desk','mode':'paper','market_worker_cycles':workers.market_cycles,'journal_available':workers.journal_health})
                if parsed.path=='/api/state':return self.json({**engine.state(value('account_id')), 'feed_errors':gateway.errors,'journal_url':workers.journal_url,'journal_available':workers.journal_health})
                if parsed.path=='/api/bars':return self.json(gateway.bars(engine.instrument(value('instrument','hyperliquid:BTC')),value('timeframe','1h'),min(1000,max(50,int(value('limit','600'))))))
                if parsed.path=='/api/settings':
                    with engine.db() as db:return self.json({r['key']:json.loads(r['value']) for r in db.execute('SELECT * FROM settings')})
                if parsed.path=='/api/export':return self.json(engine.export(value('account_id')))
                if parsed.path.startswith('/api/'):return self.json({'error':'Not found'},404)
                return super().do_GET()
            except ValueError as e:return self.json({'error':str(e)},400)
            except Exception:return self.json({'error':'Market data temporarily unavailable. Please retry.'},503)
        def do_POST(self):
            if not self.trusted() or not self.headers.get('Content-Type','').startswith('application/json'):return self.json({'error':'Same-origin JSON command required'},403)
            try:
                length=int(self.headers.get('Content-Length',0))
                if length<=0 or length>2000000:return self.json({'error':'Invalid request size'},413)
                p=json.loads(self.rfile.read(length));path=urlparse(self.path).path
                if path=='/api/command':return self.json(engine.execute(self.headers.get('Idempotency-Key'),p['action'],p['payload']))
                if path=='/api/settings':
                    if not isinstance(p,dict) or set(p)-{'workspace','appearance','watchlist','presets','pineLibrary','trading'}:raise ValueError('Unsupported settings')
                    if 'trading' in p:
                        t=p['trading'];keys={'positions','orders','brackets','executions','labels','pnl','reverse','quickButtons','instant','pnlUnit'}
                        if not isinstance(t,dict) or set(t)-keys or any(type(v) is not bool for k,v in t.items() if k!='pnlUnit') or t.get('pnlUnit','money') not in ('money','ticks','percent'):raise ValueError('Invalid trading settings')
                    if 'pineLibrary' in p:
                        items=p['pineLibrary']
                        if not isinstance(items,list) or len(items)>6:raise ValueError('Pine library accepts at most six indicators')
                        for item in items:
                            if not isinstance(item,dict) or not isinstance(item.get('name'),str) or not isinstance(item.get('source'),str) or len(item['source'].encode())>250000:raise ValueError('Invalid Pine indicator source')
                            validate_pine_source(item['source'])
                    with engine.db() as db:
                        for k,v in p.items():db.execute('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',(k,json.dumps(v)))
                    return self.json({'saved':True})
                if path=='/api/journal/retry':
                    with engine.db() as db:db.execute("UPDATE outbox SET next_attempt=0 WHERE status='pending'")
                    return self.json({'queued':True})
                return self.json({'error':'Not found'},404)
            except (ValueError,KeyError,TypeError) as e:return self.json({'error':str(e)},400)
            except Exception:return self.json({'error':'Command could not be accepted. Refresh and retry with the same command ID.'},500)
    httpd=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    print('The Desk: http://127.0.0.1:'+str(args.port),flush=True)
    try:httpd.serve_forever()
    finally:workers.stop.set();httpd.server_close()

if __name__=='__main__':main()
