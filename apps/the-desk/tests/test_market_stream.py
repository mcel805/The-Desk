import json
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine import Engine
from market_stream import HyperliquidStream

class TouchTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.path=Path(self.tmp.name)/'desk.db';self.e=Engine(self.path)
        self.a=self.e.execute('a','account',{'name':'Touch QA','capital':10000,'fee_bps':5})['id']
        self.i='hyperliquid:BTC';self.e.ingest(self.i,100,101,{'tick':1,'qty_step':'.001'})
    def tearDown(self):self.tmp.cleanup()
    def order(self,**extra):return self.e.execute(str(time.time_ns()),'order',{'account_id':self.a,'instrument':self.i,'side':'sell','kind':'limit','qty':'.001','price':105,**extra})
    def trade(self,price,at=None,i=None):self.e.ingest_trade(i or self.i,price,at or time.time(),'trade-1')
    def test_resting_sell_touch_between_unchanged_books_fills_once_at_limit(self):
        o=self.order(stop=110,target=95);self.trade(105);self.e.ingest(self.i,100,101)
        s=self.e.state(self.a);self.assertEqual(s['orders'][0]['price'],'105');self.assertEqual(s['orders'][0]['status'],'filled')
        self.assertEqual(s['positions'][0]['side'],'sell');self.assertEqual(s['positions'][0]['entry'],'105')
        self.trade(105);self.assertEqual(len(self.e.state(self.a)['fills']),1)
        with self.e.db() as db:p=json.loads(db.execute("SELECT payload FROM outbox WHERE event_id=?",(s['fills'][0]['id'],)).fetchone()[0])
        self.assertEqual(p['provenance']['market_event']['price'],'105');self.assertTrue(p['provenance']['simulation'])
    def test_buy_touch_uses_resting_limit_without_manufacturing_quote(self):
        self.order(side='buy',price=95);self.trade(94)
        s=self.e.state(self.a);self.assertEqual(s['fills'][0]['price'],'95');self.assertEqual(s['quotes'][self.i]['bid'],'100')
    def test_stale_future_preacceptance_and_wrong_symbol_cannot_fill(self):
        before=time.time();self.order()
        for at in (before,time.time()-20,time.time()+10):self.trade(105,at)
        self.e.ingest('hyperliquid:ETH',100,101);self.trade(105,i='hyperliquid:ETH')
        self.assertFalse(self.e.state(self.a)['fills']);self.trade(105);self.assertEqual(len(self.e.state(self.a)['fills']),1)
    def test_pre_amendment_print_cannot_fill_new_price(self):
        o=self.order(price=110);before=time.time()
        self.e.execute('edit','amend',{'id':o['id'],'account_id':self.a,'revision':1,'qty':'.001','price':105})
        self.trade(105,before);self.assertFalse(self.e.state(self.a)['fills']);self.trade(105);self.assertEqual(len(self.e.state(self.a)['fills']),1)
    def test_cancelled_and_expired_limits_do_not_fill(self):
        o=self.order();self.e.execute('cancel','cancel',{'id':o['id'],'account_id':self.a,'revision':1});self.trade(105)
        o=self.order(ttl_seconds=60)
        with self.e.db() as db:db.execute('UPDATE orders SET expires_at=? WHERE id=?',(time.time()-1,o['id']))
        self.trade(105);self.assertFalse(self.e.state(self.a)['fills'])
    def test_stale_book_does_not_enable_trade_matching(self):
        self.order();self.e.ingest(self.i,100,101,received_at=time.time()-20);self.trade(105);self.assertFalse(self.e.state(self.a)['fills'])
    def test_stop_limit_requires_prior_trigger(self):
        self.order(side='buy',kind='stop_limit',trigger=105,price=104);self.trade(104);self.assertFalse(self.e.state(self.a)['fills'])
        self.e.ingest(self.i,106,107);self.trade(104);self.assertEqual(self.e.state(self.a)['orders'][0]['status'],'filled')
    def test_restart_recovers_resting_order_and_old_books_cannot_fill(self):
        self.order();self.e=Engine(self.path)
        self.e.ingest(self.i,100,101,{'source_time':time.time()*1000})
        self.e.ingest(self.i,105,106,{'source_time':(time.time()-10)*1000})
        self.assertFalse(self.e.state(self.a)['fills']);self.trade(105);self.assertEqual(len(self.e.state(self.a)['fills']),1)
    def test_invalid_books_cannot_enable_touch_matching(self):
        class Gateway:
            def metadata(self,i):return {'sz_decimals':5,'qty_step':'.001'}
        stream=HyperliquidStream(self.e,Gateway(),threading.Event(),connector=lambda:None)
        for levels in (None,[],[[],[]],[[{'px':'100','sz':'0'}],[{'px':'101','sz':'1'}]],
                       [[{'px':'nan','sz':'1'}],[{'px':'101','sz':'1'}]],
                       [[{'px':'102','sz':'1'}],[{'px':'101','sz':'1'}]]):
            stream.handle({'channel':'l2Book','data':{'coin':'BTC','time':time.time()*1000,'levels':levels}})
            self.assertFalse(stream.healthy(self.i))
        self.assertEqual(self.e.state(self.a)['quotes'][self.i]['bid'],'100')
    def test_server_stream_delivers_transient_touch_and_closes_cleanly(self):
        self.order();stop=threading.Event();now=int(time.time()*1000)+1
        packets=[{'channel':'l2Book','data':{'coin':'BTC','time':now,'levels':[[{'px':'100','sz':'1'}],[{'px':'101','sz':'1'}]]}},
                 {'channel':'trades','data':[{'coin':'BTC','px':'105','time':now+1,'tid':123}]}]
        class Sock:
            def __init__(self):self.sent=[];self.closed=False
            def settimeout(self,n):pass
            def send(self,s):self.sent.append(json.loads(s))
            def recv(self):
                p=packets.pop(0)
                if not packets:stop.set()
                return json.dumps(p)
            def close(self):self.closed=True
        class Gateway:
            def metadata(self,i):return {'sz_decimals':5,'qty_step':'.001'}
        sock=Sock();stream=HyperliquidStream(self.e,Gateway(),stop,connector=lambda *a,**kw:sock)
        stream.handle({'channel':'trades','isSnapshot':True,'data':[{'coin':'BTC','px':'105','time':now,'tid':1}]})
        self.assertFalse(self.e.state(self.a)['fills']);stream.run()
        self.assertTrue(sock.closed);self.assertEqual(len(sock.sent),6);self.assertEqual(self.e.state(self.a)['positions'][0]['entry'],'105')
        self.assertEqual(self.e.state(self.a)['quotes'][self.i]['transport'],'Server WebSocket · public book + trade touches')

if __name__=='__main__':unittest.main()
