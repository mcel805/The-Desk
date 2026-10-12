"""Server-owned public Hyperliquid books/trades; no account or order-routing API."""
import json
import math
import time

try:
    import websocket
except ImportError:
    websocket=None

class HyperliquidStream:
    def __init__(self,engine,gateway,stop,connector=None):
        self.engine=engine;self.gateway=gateway;self.stop=stop
        self.connector=connector or (websocket.create_connection if websocket else None)
        self.books={};self.status='connecting' if self.connector else 'unavailable · install requirements-market.txt'
        self.coins=('BTC','ETH','SOL')
    def healthy(self,instrument):
        return time.time()-self.books.get(instrument,0)<5
    def handle(self,message):
        if message.get('isSnapshot') or (isinstance(message.get('data'),dict) and message['data'].get('isSnapshot')):return
        channel=message.get('channel');data=message.get('data')
        if channel=='l2Book' and isinstance(data,dict) and data.get('coin') in self.coins:
            instrument='hyperliquid:'+data['coin'];source=data.get('time')
            if not self.fresh(source):return
            levels=data.get('levels')
            if not isinstance(levels,list) or len(levels)!=2:return
            bids,asks=levels
            if not bids or not asks or not all(self.valid_level(r) for rows in levels for r in rows):return
            if float(asks[0]['px'])<float(bids[0]['px']):return
            meta=self.gateway.metadata(instrument);bid=bids[0]['px'];ask=asks[0]['px']
            power=max(math.floor(math.log10(float(bid)))-4,-(6-meta['sz_decimals']))
            self.engine.ingest(instrument,bid,ask,{**meta,'tick':str(10**power),'source_time':source,
                'transport':'Server WebSocket · public book + trade touches',
                'book':{'bids':[{'price':r['px'],'qty':r['sz']} for r in bids],
                        'asks':[{'price':r['px'],'qty':r['sz']} for r in asks]}})
            self.books[instrument]=time.time();self.status='streaming'
        elif channel=='trades' and isinstance(data,list):
            for row in sorted(data,key=lambda r:r.get('time',0)):
                if row.get('coin') not in self.coins or not self.fresh(row.get('time')):continue
                if row.get('tid') is None:continue
                instrument='hyperliquid:'+row['coin']
                self.engine.ingest_trade(instrument,row['px'],row['time']/1000,
                    row['coin']+':'+str(row['time'])+':'+str(row['tid']))
    @staticmethod
    def valid_level(row):
        try:return all(math.isfinite(float(row[k])) and float(row[k])>0 for k in ('px','sz'))
        except (KeyError,TypeError,ValueError):return False
    @staticmethod
    def fresh(source):
        return isinstance(source,(int,float)) and math.isfinite(source) and -5<=time.time()-source/1000<=15
    def run(self):
        if not self.connector:return
        attempt=0
        while not self.stop.is_set():
            sock=None
            try:
                self.status='connecting'
                sock=self.connector('wss://api.hyperliquid.xyz/ws',timeout=5)
                sock.settimeout(1)
                for coin in self.coins:
                    for kind in ('l2Book','trades'):
                        sock.send(json.dumps({'method':'subscribe','subscription':{'type':kind,'coin':coin}}))
                last_message=time.time();last_ping=last_message
                while not self.stop.is_set():
                    try:
                        raw=sock.recv()
                        if not raw:raise ConnectionError('Stream closed')
                        message=json.loads(raw)
                        if message.get('channel')=='error':raise ConnectionError('Subscription rejected')
                        self.handle(message);last_message=time.time()
                        if self.status=='streaming':attempt=0
                    except (TimeoutError, websocket.WebSocketTimeoutException if websocket else TimeoutError):pass
                    now=time.time()
                    if now-last_message>15:raise ConnectionError('Stream stale')
                    if now-last_ping>10:sock.send(json.dumps({'method':'ping'}));last_ping=now
            except Exception:
                self.status='reconnecting · REST fallback has limited touch coverage';self.books.clear()
            finally:
                if sock:
                    try:sock.close()
                    except Exception:pass
            if self.stop.wait(min(15,2**min(attempt,4))):break
            attempt+=1
        self.status='stopped'
