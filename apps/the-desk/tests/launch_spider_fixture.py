"""Browser-only synthetic proof. No Codex or market network calls. Port 18894 only."""
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
sys.path.insert(0,str(Path(__file__).resolve().parent))
import server
from spider_service import Spider
from test_spider import FakeCodex,snapshot
import time
class FixtureSpider(Spider):
 def __init__(self,*args,**kwargs):super().__init__(*args,session_factory=FakeCodex,**kwargs)
class FixtureGateway(server.Gateway):
 def bars(self,instrument,tf,limit=600):
  d=snapshot(tf,instrument);old=d['as_of'];now=int(time.time()*1000);ms=__import__('spider_service').FRAMES[tf];offset=(now//ms-old//ms)*ms
  for b in d['bars']:b['time']+=offset
  d.update(as_of=now,mode='SYNTHETIC_TEST',coverage='SYNTHETIC TEST · invented prices for UI verification only');return d
server.Spider=FixtureSpider;server.Gateway=FixtureGateway
if __name__=='__main__':
 if '--port'not in sys.argv or sys.argv[sys.argv.index('--port')+1]!='18894':raise SystemExit('Synthetic fixture requires port 18894')
 server.main()
