"""Explicit synthetic test server. No real broker, funds or market workers."""
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server
import threading
import time

class FixtureWorkers:
    def __init__(self,engine,gateway,journal_url,token):
        self.engine=engine;self.stop=threading.Event();self.market_cycles=0;self.journal_health=False;self.journal_url='http://127.0.0.1:1';self.stream=type('Stream',(),{'status':'SYNTHETIC AGENTS FIXTURE'})()
    def start(self):
        def run():
            tick=0
            while not self.stop.is_set():
                mid=101 if tick%8<4 else 100
                self.engine.ingest('hyperliquid:BTC',str(mid-.01),str(mid+.01),{'tick':'.01','qty_step':'.001','transport':'SYNTHETIC AGENTS FIXTURE'})
                self.market_cycles+=1;tick+=1;self.stop.wait(1)
        threading.Thread(target=run,daemon=True).start()

server.Workers=FixtureWorkers
if __name__=='__main__':server.main()
