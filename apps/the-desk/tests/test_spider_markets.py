import unittest
from urllib.parse import urlparse,parse_qs
from spider_markets import validate_market,binance_bars
class MarketAdapterTests(unittest.TestCase):
 def test_no_symbol_alias_or_caller_supplied_host(self):
  for market in ['binance:BTCUSDT','hyperliquid:BTC','coinbase:SOL-USD']:self.assertEqual(validate_market(market),market)
  for market in ['binance:BTCUSD','binance:BTCUSDT?x=1','binance:kBTCUSDT','http://localhost/','hyperliquid:kPEPE']:
   with self.assertRaises(ValueError):validate_market(market)
 def test_two_minute_binance_uses_only_complete_pairs(self):
  seen=[]
  def fetch(url):
   seen.append(url);return [[t*1000,str(o),str(o+2),str(o-1),str(o+1),'3',(t+60)*1000-1]for t,o in[(17640,100),(17760,102),(17820,103),(17880,104)]]
  d=binance_bars(fetch,'binance:BTCUSDT','2m',5,17910000)
  self.assertEqual([b['time']for b in d['bars']],[17760000,17880000]);self.assertEqual(d['last_completed'],17760000)
  self.assertEqual(d['quoteCurrency'],'USDT');p=urlparse(seen[0]);self.assertEqual(p.hostname,'data-api.binance.vision');self.assertEqual(parse_qs(p.query)['interval'],['1m'])
 def test_native_daily_preserves_exact_provider_time_and_volume(self):
  rows=[[17820000,'100','105','99','103','10',104219999]]
  d=binance_bars(lambda _:rows,'binance:ETHUSDT','1d',10,104220000)
  self.assertEqual(d['bars'][0],{'time':17820000,'open':100.,'high':105.,'low':99.,'close':103.,'volume':10.})
  with self.assertRaises(ValueError):binance_bars(lambda _: {'error':'unavailable'},'binance:ETHUSDT','1m',10,104220000)
if __name__=='__main__':unittest.main()
