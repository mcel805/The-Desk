import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine import Engine

class ExtendedPaperTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.e=Engine(Path(self.tmp.name)/'test.db')
        self.a=self.e.execute('a','account',{'name':'QA','capital':'1000','fee_bps':'5','leverage':'10'})['id']
        self.i='hyperliquid:BTC';self.q(100,101)
    def tearDown(self):self.tmp.cleanup()
    def q(self,bid,ask,i=None):self.e.ingest(i or self.i,bid,ask,{'tick':'.01','qty_step':'.001'})
    def order(self,key='o',**kw):return self.e.execute(key,'order',{'account_id':self.a,'instrument':self.i,'side':'buy','kind':'market','qty':'1',**kw})
    def state(self):return self.e.state(self.a)
    def test_all_six_instruments_long_roundtrip(self):
        for n,i in enumerate(['hyperliquid:BTC','hyperliquid:ETH','hyperliquid:SOL','coinbase:BTC-USD','coinbase:ETH-USD','coinbase:SOL-USD']):
            with self.subTest(i=i):
                self.q(100,101,i);self.order(str(n),instrument=i)
                p=next(p for p in self.state()['positions'] if p['instrument']==i)
                self.q(110,111,i);self.e.execute('c'+str(n),'close',{'account_id':self.a,'id':p['id'],'revision':1})
        self.assertFalse(self.state()['positions']);self.assertEqual(len(self.state()['fills']),12)
        self.assertEqual(Decimal(self.state()['accounts'][0]['balance']),Decimal('1053.367'))
    def test_short_limit_stop_and_stop_limit(self):
        for n,fields in enumerate([{'kind':'limit','price':'105'},{'kind':'stop','trigger':'95'},{'kind':'stop_limit','trigger':'95','price':'94'}]):
            with self.subTest(fields=fields):
                self.q(100,101);o=self.order(str(n),side='sell',**fields)
                self.q(106,107) if fields['kind']=='limit' else self.q(93,94)
                if fields['kind']=='stop_limit':
                    self.assertEqual(next(x for x in self.state()['orders'] if x['id']==o['id'])['status'],'triggered');self.q(96,97)
                p=self.state()['positions'][0];self.assertEqual(p['side'],'sell')
                self.e.execute('c'+str(n),'close',{'account_id':self.a,'id':p['id'],'revision':1})
    def test_short_brackets_and_removal(self):
        self.order(side='sell',stop='110',target='90');p=self.state()['positions'][0]
        self.e.execute('edit','bracket',{'account_id':self.a,'id':p['id'],'revision':1,'stop':'108','target':'92'})
        self.q(91,92);self.assertFalse(self.state()['positions']);self.assertEqual(self.state()['fills'][0]['reason'],'take profit')
        self.order('again',side='sell',stop='110',target='85');p=self.state()['positions'][0]
        self.e.execute('remove','bracket',{'account_id':self.a,'id':p['id'],'revision':1,'stop':None,'target':None})
        self.q(120,121);self.assertTrue(self.state()['positions'])
    def test_partial_close_and_bracket_revision_conflict(self):
        self.order();p=self.state()['positions'][0]
        self.e.execute('partial','close',{'account_id':self.a,'id':p['id'],'revision':1,'qty':'.5'})
        with self.assertRaisesRegex(ValueError,'changed'):self.e.execute('old','bracket',{'account_id':self.a,'id':p['id'],'revision':1,'stop':'90'})
        with self.assertRaisesRegex(ValueError,'exceeds'):self.e.execute('over','close',{'account_id':self.a,'id':p['id'],'revision':2,'qty':'1'})
        self.assertEqual(self.state()['positions'][0]['qty'],'0.5')
    def test_concurrent_duplicate_is_one_fill(self):
        with ThreadPoolExecutor(max_workers=8) as pool:results=list(pool.map(lambda _:self.order('same'),range(20)))
        self.assertEqual(len({r['id'] for r in results}),1);self.assertEqual(len(self.state()['fills']),1)
    def test_reduce_only_exit_allowed_when_buying_power_zero(self):
        self.order(qty='90');self.q(1,2)
        self.assertEqual(self.state()['accounts'][0]['buying_power'],'0')
        self.order('reduce',side='sell',qty='1')
        self.assertEqual(self.state()['positions'][0]['qty'],'89')
    def test_spot_amend_does_not_use_perpetual_leverage(self):
        i='coinbase:BTC-USD';self.q(100,101,i)
        o=self.order(instrument=i,kind='limit',price='90',qty='10')
        with self.assertRaisesRegex(ValueError,'buying power'):
            self.e.execute('amend','amend',{'account_id':self.a,'id':o['id'],'revision':1,'price':'110'})
        self.assertEqual(self.state()['orders'][0]['price'],'90')
    def test_pending_short_cannot_reuse_same_offsetting_inventory(self):
        self.order(qty='9');self.order('sell1',side='sell',qty='9',kind='limit',price='150')
        with self.assertRaisesRegex(ValueError,'buying power'):self.order('sell2',side='sell',qty='100',kind='limit',price='150')
    def test_spot_order_rejected_after_inventory_consumed(self):
        i='coinbase:BTC-USD';self.q(100,101,i);self.order(instrument=i)
        self.order('pending',instrument=i,side='sell',kind='limit',price='110')
        p=self.state()['positions'][0];self.e.execute('close','close',{'account_id':self.a,'id':p['id'],'revision':1})
        self.q(111,112,i);self.assertEqual(self.state()['orders'][0]['status'],'rejected');self.assertEqual(len(self.state()['fills']),2)
    def test_below_alert_delete_and_boundary_once(self):
        a=self.e.execute('alert','alert',{'instrument':self.i,'condition':'below','price':'95'})
        self.q(94,96);self.q(93,95);self.assertEqual(sum(x['kind']=='alert' for x in self.state()['events']),1)
        self.e.execute('delete','alert_delete',{'id':a['id']});self.assertFalse(self.state()['alerts'])
    def test_invalid_values_roll_back(self):
        for n,fields in enumerate([{'qty':'NaN'},{'qty':'-1'},{'side':'oops'},{'kind':'oops'},{'instrument':'coinbase:X'},{'ttl_seconds':23},{'stop':'110'},{'target':'90'}]):
            with self.subTest(fields=fields):
                with self.assertRaises(ValueError):self.order(str(n),**fields)
        self.assertFalse(self.state()['orders']);self.assertFalse(self.state()['fills'])
    def test_all_time_in_force_expiries_and_reserved_release(self):
        for n,ttl in enumerate([0,60,3600,86400]):
            self.q(100,101);o=self.order(str(n),kind='limit',price='90',ttl_seconds=ttl)
            if ttl:self.e.expire(o['expires_at']+1)
        self.assertEqual(sum(o['status']=='expired' for o in self.state()['orders']),3)
        self.assertEqual(Decimal(self.state()['accounts'][0]['reserved']),Decimal('9'))

if __name__=='__main__':unittest.main()
