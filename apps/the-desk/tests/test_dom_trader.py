import unittest
from test_engine import PaperTests

class DOMCommands(unittest.TestCase):
    setUp=PaperTests.setUp
    tearDown=PaperTests.tearDown
    quote=PaperTests.quote
    order=PaperTests.order
    state=PaperTests.state
    # Use the existing executable engine fixture, without duplicating its suite.
    def scope(self):
        s=self.state();return {'account_id':self.a,'instrument':self.i,'orders':[{'id':o['id'],'revision':o['revision']} for o in s['orders'] if o['status'] in ('working','triggered')],'positions':[{'id':p['id'],'revision':p['revision']} for p in s['positions']]}
    def test_batch_atomic_scope_and_retry(self):
        self.order('one',kind='limit',price='95');self.order('two',kind='stop',trigger='110');p=self.scope();bad={**p,'orders':[p['orders'][0],{**p['orders'][1],'revision':99}]}
        with self.assertRaisesRegex(ValueError,'changed'):self.e.execute('bad','cancel_orders',bad)
        self.assertEqual(len(self.scope()['orders']),2)
        one=self.e.execute('cancel-all','cancel_orders',p);self.assertEqual(one,self.e.execute('cancel-all','cancel_orders',p));self.assertFalse(self.scope()['orders'])
    def test_flatten_cancels_closes_and_rejects_unreviewed_state(self):
        self.order();self.order('waiting',kind='limit',price='90');p=self.scope();self.order('new',kind='limit',price='89')
        with self.assertRaisesRegex(ValueError,'changed'):self.e.execute('outdated','flatten',p)
        self.assertEqual(len(self.scope()['orders']),2);self.assertEqual(len(self.state()['positions']),1)
        self.e.execute('flatten','flatten',self.scope());self.assertFalse(self.state()['positions']);self.assertFalse(self.scope()['orders']);self.assertEqual(len(self.state()['fills']),2)
    def test_reverse_net_with_orders_and_repeat(self):
        self.order(qty='2');self.order('wait',kind='limit',price='90');p=self.scope();self.e.execute('rev','reverse',p);self.e.execute('rev','reverse',p)
        s=self.state();result=self.e.execute('rev','reverse',p);self.assertEqual(result['positions'],s['positions']);self.assertEqual(result['cancelled'],[r['id'] for r in p['orders']]);self.assertEqual(s['positions'][0]['side'],'sell');self.assertEqual(s['positions'][0]['qty'],'2');self.assertFalse(self.scope()['orders']);self.assertEqual(len(s['fills']),3)
    def test_stale_flatten_rolls_back_cancels_but_cancel_is_available(self):
        self.order();self.order('wait',kind='limit',price='90');p=self.scope();self.quote(100,101,received_at=1)
        with self.assertRaisesRegex(ValueError,'Fresh'):self.e.execute('stale','flatten',p)
        self.assertEqual(len(self.scope()['orders']),1);self.e.execute('cxl','cancel_orders',p);self.assertFalse(self.scope()['orders'])
    def test_cross_account_and_instrument_refs_rejected(self):
        self.order(kind='limit',price='90');p=self.scope();b=self.e.execute('other','account',{'name':'Other','capital':'1000'})['id']
        for change in ({'account_id':b},{'instrument':'hyperliquid:ETH'}):
            with self.assertRaisesRegex(ValueError,'changed'):self.e.execute('wrong'+str(change),'cancel_orders',{**p,**change})
        self.assertEqual(len(self.scope()['orders']),1)
    def test_quantity_amendment_precision_power_and_spot_reservations(self):
        o=self.order(kind='limit',price='90');p={'account_id':self.a,'id':o['id'],'revision':1,'price':'90','qty':'2'};r=self.e.execute('size','amend',p);self.assertEqual(r['qty'],'2')
        for qty,err in (('.0001','multiple'),('200','buying power')):
            with self.assertRaisesRegex(ValueError,err):self.e.execute('bad'+qty,'amend',{**p,'revision':2,'qty':qty})
        i='coinbase:BTC-USD';self.quote(100,101,i);self.order('spot',instrument=i,qty='2');o=self.order('sell1',instrument=i,kind='limit',side='sell',price='120');self.order('sell2',instrument=i,kind='limit',side='sell',price='121')
        with self.assertRaisesRegex(ValueError,'owned'):self.e.execute('oversell','amend',{'account_id':self.a,'id':o['id'],'revision':1,'price':'120','qty':'2'})
    def test_spot_reverse_cannot_cancel_orders_or_open_short(self):
        self.i='coinbase:BTC-USD';self.quote(100,101);self.order();self.order('wait',kind='limit',price='90')
        with self.assertRaisesRegex(ValueError,'Spot'):self.e.execute('revspot','reverse',self.scope())
        self.assertEqual(len(self.scope()['orders']),1);self.assertEqual(self.state()['positions'][0]['side'],'buy')


del PaperTests
