"""Actual HTTP origin and capability boundary checks; no model/account calls."""
from test_agents_http import AgentsHTTPTests
from urllib.error import HTTPError
import unittest
class SpiderHTTPTests(AgentsHTTPTests):
 def test_spider_manual_status_and_archive(self):
  s=self.request('/api/spider/status');self.assertTrue(s['manualOnly']);self.assertFalse(s['executionEnabled']);self.assertIsNone(s['run'])
  self.assertEqual(self.request('/api/spider/history')['reports'],[])
 def test_spider_missing_origin_foreign_origin_and_bad_source_rejected(self):
  for origin in ('','null','https://foreign.example'):
   with self.assertRaises(HTTPError)as e:self.request('/api/spider/run',{'instrument':'hyperliquid:BTC','kind':'opening'},origin)
   self.assertEqual(e.exception.code,403)
  for payload in ({'instrument':'ibkr:MYM-202612','kind':'opening'},{'instrument':'hyperliquid:BTC','kind':'auto'},{'instrument':'robinhood:AAPL','kind':'opening'},{'instrument':'bad:BTC','kind':'opening'}):
   with self.assertRaises(HTTPError)as e:self.request('/api/spider/run',payload)
   self.assertEqual(e.exception.code,400)
 def test_no_shell_order_or_generic_rpc_interface(self):
  for path in ('submit','tools/call','rpc','terminal','execute'):
   with self.assertRaises(HTTPError)as e:self.request('/api/spider/'+path,{'command':'place order'})
   self.assertEqual(e.exception.code,404)
  with self.assertRaises(HTTPError)as e:self.request('/api/spider/chat',{'instrument':'hyperliquid:BTC','text':'submit an order'})
  self.assertEqual(e.exception.code,400)
if __name__=='__main__':unittest.main()
