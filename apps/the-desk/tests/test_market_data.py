import sys
from pathlib import Path
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from server import Gateway

class MarketDataTests(unittest.TestCase):
    def test_coinbase_incomplete_historical_aggregate_is_not_a_bar(self):
        # First 3m bucket has only two constituents; the next has all three.
        raw=[[17640,9,12,10,11,1],[17700,10,13,11,12,2],
             [17820,11,14,12,13,3],[17880,12,15,13,14,4],
             [17940,13,16,14,15,5],[18000,14,17,15,16,6]]
        with patch('server.http_json',return_value=raw),patch('server.time.time',return_value=18000):
            data=Gateway().bars('coinbase:BTC-USD','3m',5)
        self.assertEqual([b['time'] for b in data['bars']],[17820000,18000000])
        b=data['bars'][0]
        self.assertEqual((b['open'],b['high'],b['low'],b['close'],b['volume']),(12,16,11,15,12))
        self.assertEqual(data['last_completed'],17820000)
    def test_hyperliquid_two_minute_requires_aligned_complete_minute_pairs(self):
        candles=[{'t':t*1000,'o':str(o),'h':str(o+2),'l':str(o-1),'c':str(o+1),'v':'3'} for t,o in [(17640,100),(17760,102),(17820,103),(17880,104)]]
        with patch('server.http_json',return_value=candles),patch('server.time.time',return_value=17910):
            data=Gateway().bars('hyperliquid:BTC','2m',5)
        self.assertEqual([b['time']for b in data['bars']],[17760000,17880000])
        self.assertEqual(data['bars'][0],{'time':17760000,'open':102.,'high':105.,'low':101.,'close':104.,'volume':6.})
        self.assertEqual(data['last_completed'],17760000)
    def test_completed_cutoff_remains_at_request_time(self):
        candles=[{'t':17880000,'o':'100','h':'102','l':'99','c':'101','v':'2'},
                 {'t':17940000,'o':'101','h':'103','l':'100','c':'102','v':'3'}]
        # HTTP response spans a minute boundary; the forming bar must stay provisional.
        with patch('server.http_json',return_value=candles),patch('server.time.time',side_effect=[17999,18001]):
            data=Gateway().bars('hyperliquid:BTC','1m',5)
        self.assertEqual(data['as_of'],17999000)
        self.assertEqual(data['last_completed'],17880000)
        completed=[b for b in data['bars'] if b['time']+60000<=data['as_of']]
        self.assertEqual(len(completed),1)

if __name__=='__main__':unittest.main()
