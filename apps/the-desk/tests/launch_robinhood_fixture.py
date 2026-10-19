"""Explicit synthetic browser fixture. No OAuth or broker network calls.

python tests/launch_robinhood_fixture.py --port 18886 --data-dir /tmp/rh-fixture
"""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from robinhood_fixture import FakeBroker
import funding_routes
funding_routes.Robinhood = lambda port: FakeBroker(auto=True)
import server


class FixtureGateway:
    errors = {}
    def bars(self, instrument, timeframe, limit=600):
        import time
        seconds = {'1m':60,'3m':180,'5m':300,'15m':900,'30m':1800,'1h':3600,'2h':7200,'4h':14400,'1d':86400}[timeframe]
        now = int(time.time()); end = now//seconds*seconds
        bars = [{'time':(end-(limit-i)*seconds)*1000,'open':100.,'high':101.,'low':99.,'close':100.,'volume':1.} for i in range(limit)]
        return {'bars':bars,'instrument':instrument,'timeframe':timeframe,'as_of':now*1000,'coverage':'SYNTHETIC TEST FIXTURE','last_completed':bars[-1]['time'],'status':'SYNTHETIC TEST FIXTURE'}


class FixtureWorkers:
    def __init__(self, engine, gateway, journal_url, token):
        import threading
        self.engine=engine; self.stop=threading.Event(); self.journal_url=journal_url
        self.journal_health=False; self.market_cycles=0
        self.stream=type('Stream', (), {'status':'SYNTHETIC TEST FIXTURE'})()
    def start(self):
        import threading
        def loop():
            while not self.stop.is_set():
                for instrument in ['coinbase:BTC-USD','coinbase:ETH-USD','coinbase:SOL-USD','hyperliquid:BTC','hyperliquid:ETH','hyperliquid:SOL']:
                    self.engine.ingest(instrument,'100','100.1',{'tick':'0.01','qty_step':'0.001','transport':'SYNTHETIC TEST FIXTURE','market_type':'spot' if instrument.startswith('coinbase:') else 'perpetual'})
                self.market_cycles+=1; self.stop.wait(1)
        threading.Thread(target=loop, daemon=True).start()


server.Gateway=FixtureGateway
server.Workers=FixtureWorkers
if __name__ == '__main__': server.main()
