"""Synthetic adapter/callback contracts only; no IBKR account or wire-server claims."""
import math
import sys
import threading
import time
import unittest
from pathlib import Path
from types import SimpleNamespace as NS
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ibkr_data import IBKRData, GatewayTransport, FeedUnavailable, normalize_bar, session_anchor, demo_bar

NOW = 1792256407
ENV = {'DESK_IBKR_CONTRACT_MONTH': '202612', 'DESK_IBKR_MARKET_DATA_CONFIRMED': '1',
       'DESK_IBKR_LOCAL_DISPLAY_CONFIRMED': '1'}
CONTRACT = {'instrument': 'ibkr:MYM-202612', 'symbol': 'MYM', 'expiry': '202612',
            'exchange': 'CBOT', 'currency': 'USD', 'conId': 123, 'tick': 1., 'multiplier': .5, 'synthetic': False}
def bar(stamp=NOW // 60 * 60, **kw):
    return NS(**dict({'date': str(stamp), 'open': 40000, 'high': 40010, 'low': 39990,
                     'close': 40005, 'volume': 10}, **kw))

class DataTests(unittest.TestCase):
    def test_off_and_demo_never_load_or_connect_to_ibkr(self):
        with patch('ibkr_data.api_types', side_effect=AssertionError('must not import')):
            off = IBKRData();off.start();self.assertEqual(off.status()['phase'], 'off')
            demo = IBKRData('demo', clock=lambda: NOW);demo.start()
            result = demo.bars('ibkr:MYM-202612', '1m')
            self.assertEqual(len(result['bars']), 600)
            self.assertEqual(result['mode'], 'DEMO_DATA')
            self.assertIsNone(result['contract']['conId'])
            self.assertFalse(result['orders_enabled']);self.assertTrue(result['read_only'])
            self.assertIsNone(demo.thread)

    def test_demo_intervals_completed_cutoff_and_range(self):
        feed = IBKRData('demo', clock=lambda: NOW)
        for tf, seconds in [('1m',60),('5m',300),('1h',3600),('4h',14400)]:
            data=feed.bars(feed.instrument,tf,10)
            rows=data['bars'];self.assertEqual(len(rows),10)
            self.assertEqual(rows[-1]['time']-rows[-2]['time'],seconds*1000)
            self.assertLessEqual(rows[-1]['time'],NOW*1000)
            self.assertGreater(rows[-1]['time']+seconds*1000,NOW*1000)
            self.assertEqual(data['last_completed'],rows[-2]['time'])
            ranged=feed.bars(feed.instrument,tf,10,rows[2]['time'],rows[4]['time'])['bars']
            self.assertEqual(ranged,rows[2:5])
        self.assertEqual(datetime_hour(session_anchor(NOW)),17)

    def test_demo_pause_resume_catches_up_without_changing_identity(self):
        now=[NOW];feed=IBKRData('demo',clock=lambda:now[0])
        before=feed.bars(feed.instrument,'1m')
        feed.pause_demo(True);now[0]+=180
        paused=feed.bars(feed.instrument,'1m')
        self.assertFalse(paused['connected']);self.assertTrue(paused['history_stale'])
        self.assertEqual(before['bars'],paused['bars'])
        self.assertIsNone(paused['quote'])
        feed.pause_demo(False);after=feed.bars(feed.instrument,'1m')
        self.assertEqual(after['bars'][-1]['time']-before['bars'][-1]['time'],180000)
        self.assertEqual(after['contract'],before['contract']);self.assertEqual(after['mode'],'DEMO_DATA')

    def test_forming_synthetic_high_low_and_volume_never_reverse(self):
        for stamp in [NOW // 60 * 60 - i * 60 for i in range(12)]:
            rows=[demo_bar(stamp,60,stamp+progress) for progress in range(60)]
            self.assertEqual([r['high'] for r in rows],sorted(r['high'] for r in rows))
            self.assertEqual([r['low'] for r in rows],sorted((r['low'] for r in rows),reverse=True))
            self.assertEqual([r['volume'] for r in rows],sorted(r['volume'] for r in rows))

    def test_worker_retries_a_failed_connection_without_loading_ibapi(self):
        calls=[]
        class Transport:
            def __init__(self,feed):self.feed=feed
            def connect(self,settings):
                calls.append('connect')
                if calls.count('connect')==1:raise OSError('synthetic failure')
                self.feed.accept_contract(CONTRACT)
            def close(self):calls.append('close')
        feed=IBKRData('gateway',env=ENV,transport_factory=Transport)
        try:
            feed.start();deadline=time.monotonic()+4
            while not feed.connected and time.monotonic()<deadline:time.sleep(.01)
            self.assertTrue(feed.connected);self.assertEqual(calls.count('connect'),2)
        finally:feed.close()
        self.assertFalse(feed.thread.is_alive());self.assertEqual(calls.count('close'),3)

    def test_bad_contract_timeframe_range_and_config(self):
        feed=IBKRData('demo',clock=lambda:NOW)
        for args in [('ibkr:MYM-202603','1m'),(feed.instrument,'1w'),(feed.instrument,'1m',601),
                     (feed.instrument,'1m',1,float('nan')),(feed.instrument,'1m',1,10,9)]:
            with self.subTest(args=args),self.assertRaises(ValueError):feed.bars(*args)
        with self.assertRaises(ValueError):feed.pause_demo('true')
        for env in [{},{**ENV,'DESK_IBKR_HOST':'public.example'}, {**ENV,'DESK_IBKR_PORT':'0'},
                    {**ENV,'DESK_IBKR_CONTRACT_MONTH':'202613'}, {**ENV,'DESK_IBKR_LOCAL_DISPLAY_CONFIRMED':'0'}]:
            configured=IBKRData('gateway',env=env);configured.start()
            self.assertEqual(configured.status()['phase'],'setup_required');self.assertIsNone(configured.thread)
        with self.assertRaises(ValueError):IBKRData().pause_demo(True)

    def test_normalization_duplicate_updates_bounds_and_bad_values(self):
        feed=IBKRData('gateway',env=ENV,clock=lambda:NOW)
        feed.receive_bar('1m',bar());feed.receive_bar('1m',bar(NOW//60*60-60))
        feed.receive_bar('1m',bar(close=40006))
        self.assertEqual(len(feed.history['1m']),2)
        self.assertEqual(feed.history['1m'][NOW//60*60000]['close'],40006)
        for b in [bar(close=float('nan')),bar(volume=-1),bar(low=40007),bar(date='20261017'),bar(high=float('inf'))]:
            with self.subTest(bar=b),self.assertRaises(ValueError):normalize_bar(b)
        for i in range(700):feed.receive_bar('1m',bar(NOW//60*60-i*60))
        self.assertEqual(len(feed.history['1m']),600)

    def test_data_modes_partial_and_stale_quotes_are_honest(self):
        now=[NOW];feed=IBKRData('gateway',env=ENV,clock=lambda:now[0]);feed.accept_contract(CONTRACT)
        feed.receive_quote('bid',40000)
        self.assertTrue(feed.status()['quote']['stale']);self.assertEqual(feed.status()['mode'],'UNKNOWN')
        feed.set_data_type(3);feed.receive_quote('ask',40001)
        self.assertEqual(feed.status()['mode'],'DELAYED');self.assertFalse(feed.status()['quote']['stale'])
        now[0]+=16;feed.receive_quote('last',40001)
        self.assertTrue(feed.status()['quote']['stale']) # last trades cannot refresh old bid/ask
        feed.set_data_type(2);self.assertEqual(feed.status()['mode'],'FROZEN')
        feed.disconnect();self.assertIsNone(feed.status()['quote']);self.assertEqual(feed.status()['mode'],'UNKNOWN')

    def test_status_refresh_preserves_stale_history_even_with_fresh_quotes(self):
        now=[NOW];feed=IBKRData('gateway',env=ENV,clock=lambda:now[0]);feed.accept_contract(CONTRACT)
        feed.receive_bar('1m',bar());feed.history_end('1m')
        now[0]+=31;feed.receive_quote('bid',40000);feed.receive_quote('ask',40001)
        self.assertFalse(feed.status()['quote']['stale']);self.assertTrue(feed.status()['history_stale'])

    def test_history_wait_deduplicates_requests_and_reconnect_clears_cache(self):
        feed=IBKRData('gateway',env=ENV,clock=lambda:NOW);feed.accept_contract(CONTRACT)
        class Transport:
            calls=0
            def request_history(self,tf):self.calls+=1
        feed.transport=Transport()
        with self.assertRaises(FeedUnavailable):feed.bars(feed.instrument,'1m',wait=.01)
        feed.receive_bar('1m',bar());feed.history_end('1m')
        self.assertEqual(len(feed.bars(feed.instrument,'1m')['bars']),1)
        self.assertEqual(feed.transport.calls,1)
        feed.accept_contract(CONTRACT)
        self.assertFalse(feed.history);self.assertFalse(feed.history_ready)
        with self.assertRaises(FeedUnavailable):feed.bars(feed.instrument,'1m',wait=.01)
        self.assertEqual(feed.transport.calls,2)
        feed.history_error('1m',162)
        with self.assertRaisesRegex(FeedUnavailable,'162'):feed.bars(feed.instrument,'1m')

class FakeClient:
    instances=[]
    def __init__(self,wrapper):self.wrapper=wrapper;self.calls=[];self.done=threading.Event();self.instances.append(self)
    def connect(self,*args):self.calls.append(('connect',args));self.wrapper.nextValidId(42)
    def run(self):self.done.wait(1)
    def reqContractDetails(self,req,contract):
        self.calls.append(('contract',contract));contract.conId=123;contract.multiplier='0.5'
        contract.lastTradeDateOrContractMonth='20261218'
        self.wrapper.contractDetails(req,NS(contract=contract,minTick=1))
        self.wrapper.contractDetailsEnd(req)
    def reqMarketDataType(self,mode):self.calls.append(('mode',mode))
    def reqMktData(self,*args):
        self.calls.append(('quote',args));self.wrapper.marketDataType(2,3)
        self.wrapper.tickPrice(2,66,40000,None);self.wrapper.tickPrice(2,67,40001,None)
    def reqHistoricalData(self,*args):
        self.calls.append(('history',args));req=args[0]
        self.wrapper.historicalData(req,bar());self.wrapper.historicalData(req,bar(NOW//60*60-60))
        self.wrapper.historicalData(req,bar(close=40006));self.wrapper.historicalDataEnd(req,'','')
    def cancelHistoricalData(self,req):self.calls.append(('cancel_history',req))
    def cancelMktData(self,req):self.calls.append(('cancel_quote',req))
    def disconnect(self):self.done.set()

class OfficialCallbackTests(unittest.TestCase):
    def setUp(self):
        self.feed=IBKRData('gateway',env=ENV,clock=lambda:NOW)
        self.transport=GatewayTransport(self.feed);self.feed.transport=self.transport
        self.patch=patch('ibkr_data.api_types',return_value=(FakeClient,type('Wrapper',(),{}),NS));self.patch.start()
        self.transport.connect(self.feed.settings)
    def tearDown(self):self.transport.close();self.patch.stop()
    def test_exact_contract_request_quote_modes_and_history_callback_flow(self):
        self.assertEqual(self.feed.status()['contract']['expiry'],'202612')
        self.assertEqual(self.feed.status()['mode'],'DELAYED')
        self.assertEqual(self.feed.status()['quote']['bid'],40000)
        result=self.feed.bars(self.feed.instrument,'1m')
        self.assertEqual([b['time'] for b in result['bars']],[(NOW//60*60-60)*1000,NOW//60*60000])
        self.assertEqual(result['bars'][-1]['close'],40006)
        request=next(c[1] for c in self.transport.app.calls if c[0]=='history')
        self.assertEqual(request[2],'');self.assertEqual(request[4],'1 min')
        self.assertEqual(request[5:9],('TRADES',0,2,True))
        requested=next(c[1] for c in self.transport.app.calls if c[0]=='contract')
        self.assertEqual((requested.symbol,requested.secType,requested.exchange),('MYM','FUT','CBOT'))
        self.transport.app.historicalDataUpdate(100,bar(close=40007))
        self.assertEqual(self.feed.bars(self.feed.instrument,'1m')['bars'][-1]['close'],40007)
        self.transport.close();self.assertIn(('cancel_history',100),self.transport.app.calls)
    def test_closed_transport_callbacks_cannot_revive_or_relabel_data(self):
        app=self.transport.app;self.transport.close()
        app.marketDataType(2,1);app.tickPrice(2,1,99999,None)
        app.error(2,10089,'private account text')
        self.assertFalse(self.feed.status()['connected'])
        self.assertIsNone(self.feed.status()['quote'])
        self.assertEqual(self.feed.status()['mode'],'UNKNOWN')

    def test_old_and_current_error_signatures_do_not_expose_private_messages(self):
        for args in [(10089,'private account text'),(NOW*1000,10089,'private account text','')]:
            self.transport.app.error(2,*args)
            self.assertEqual(self.feed.status()['phase'],'subscription_required')
            self.assertNotIn('private',self.feed.status()['message'])
    def test_connection_loss_wakes_waiters_and_clears_quote(self):
        self.transport.app.connectionClosed()
        self.assertFalse(self.feed.status()['connected']);self.assertIsNone(self.feed.status()['quote'])
        with self.assertRaises(FeedUnavailable):self.feed.bars(self.feed.instrument,'1m')

def datetime_hour(stamp):
    from datetime import datetime
    from zoneinfo import ZoneInfo
    return datetime.fromtimestamp(stamp,ZoneInfo('America/Chicago')).hour

if __name__=='__main__':unittest.main()
