"""Isolated deterministic two-market fixture; no broker or public API calls."""
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server
import threading
import time
import math
class FixtureGateway:
    errors={}
    def bars(self,instrument,timeframe,limit=600):
        durations={'1m':1,'3m':3,'5m':5,'15m':15,'30m':30,'1h':60,'2h':120,'4h':240,'1d':1440};minutes=durations[timeframe]
        now=time.time();end=int(now//(minutes*60))*minutes*60000
        bars=[{'time':end-(limit-1-i)*minutes*60000,'open':100+.5*math.sin(i/9),'high':101+.5*math.sin(i/9),'low':99+.5*math.sin(i/9),'close':100+.4*math.sin(i/9),'volume':100+i%10} for i in range(limit)]
        return {'instrument':instrument,'timeframe':timeframe,'as_of':now*1000,'last_completed':bars[-2]['time'],'bars':bars,'coverage':'SYNTHETIC AGENT WORKSPACE FIXTURE'}
class FixtureWorkers:
    def __init__(self,engine,gateway,journal_url,token):
        self.engine=engine;self.stop=threading.Event();self.market_cycles=0;self.journal_health=False;self.journal_url='http://127.0.0.1:1';self.stream=type('Stream',(),{'status':'SYNTHETIC AGENT WORKSPACE FIXTURE'})()
    def start(self):
        def loop():
            i=0
            while not self.stop.is_set():
                mid=101 if i%12<6 else 100
                for market in ('hyperliquid:BTC','hyperliquid:ETH'):
                    self.engine.ingest(market,str(mid-.01),str(mid+.01),{'tick':'.01','qty_step':'.001','transport':'SYNTHETIC AGENT WORKSPACE FIXTURE','metadata_verified':True,'metadata_observed_at':time.time()})
                self.market_cycles+=1;i+=1;self.stop.wait(1)
        threading.Thread(target=loop,daemon=True).start()
server.Gateway=FixtureGateway;server.Workers=FixtureWorkers
if __name__=='__main__':server.main()
