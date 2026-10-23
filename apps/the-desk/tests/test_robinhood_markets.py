"""Executable broker-boundary tests. Synthetic responses; no actual orders."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import unittest
import test_robinhood_workspace as workspace_tests
from datetime import datetime,timezone


class MarketTests(unittest.TestCase):
    setUp = workspace_tests.WorkspaceTests.setUp
    def ticket(self,**kw):
        return {'accountId':self.aid,'kind':'crypto','symbol':'BTC-USD','side':'buy','quantity':'0.5','dollarAmount':None,'orderType':'limit','limitPrice':'100.00','chartInstrument':'hyperliquid:BTC',**kw}

    def test_catalog_account_override_halts_and_pagination(self):
        original=self.broker.call
        def pages(owner,name,args):
            if name!='get_currency_pairs': return original(owner,name,args)
            p={**self.broker.pairs[0]}
            if args.get('cursor'): p.update(id='pair-eth',symbol='ETH-USD',halted=True,halted_regions=['NY'])
            else: p['tradability_by_account_type']={'individual':'sell_only'}
            return {'results':[p],'next':'' if args.get('cursor') else 'page2'}
        self.broker.call=pages
        result=self.service.crypto_catalog(self.owner,self.aid)
        self.assertTrue(result['complete']);self.assertEqual(len(result['assets']),2)
        self.assertEqual(result['assets'][0]['restriction'],'sell_only');self.assertFalse(result['assets'][1]['eligible'])

    def test_repeated_cursor_denies_complete_catalog(self):
        self.broker.call=lambda *a:{'results':self.broker.pairs,'next':'repeat'}
        with self.assertRaisesRegex(ValueError,'advance'):self.service.crypto_catalog(self.owner,self.aid)

    def test_equity_search_is_account_checked_and_not_full_catalog(self):
        result=self.service.equity_search(self.owner,self.aid,'Apple')
        self.assertFalse(result['complete']);self.assertTrue(result['assets'][0]['eligible'])
        check=next(c for c in self.broker.calls if c[1]=='get_equity_tradability')
        self.assertEqual(check[2]['account_number'],'TEST_MCP_55556666')

    def test_equity_account_restriction_overrides_global_flag(self):
        original=self.broker.call
        def call(owner,name,args):
            result=original(owner,name,args)
            if name=='get_equity_tradability':result['results'][0]['account_type_tradabilities'][0]['account_type_tradability']='untradable'
            return result
        self.broker.call=call
        self.assertFalse(self.service.equity_search(self.owner,self.aid,'AAPL')['assets'][0]['eligible'])

    def test_broker_quote_exact_symbol_and_account_routing(self):
        q=self.service.broker_quote(self.owner,self.aid,'crypto','BTC-USD')
        self.assertEqual(q['symbol'],'BTC-USD');self.assertEqual(q['bid'],'100.00')
        self.assertEqual(self.broker.calls[-1][2]['rhs_account_number'],'55556666')
        q=self.service.broker_quote(self.owner,self.aid,'equity','AAPL');self.assertEqual(q['ask'],'100.10')

    def test_inactive_or_never_traded_equity_quote_is_unavailable(self):
        original=self.broker.call
        for overrides in [{'state':'inactive'},{'has_traded':False}]:
            def call(owner,name,args):
                result=original(owner,name,args)
                if name=='get_equity_quotes': result['results'][0]['quote'].update(overrides)
                return result
            self.broker.call=call
            with self.assertRaisesRegex(ValueError,'inactive|never traded'):
                self.service.broker_quote(self.owner,self.aid,'equity','AAPL')
        self.broker.call=original

    def test_historical_bars_preserve_provider_identity_and_ohlc(self):
        bars=self.service.equity_bars(self.owner,self.aid,'AAPL','60')
        self.assertEqual(bars['bars'][0]['close'],100.5);self.assertEqual(bars['symbol'],'AAPL')
        self.assertEqual(self.broker.calls[-1][2]['bounds'],'regular')
        with self.assertRaises(ValueError):self.service.equity_bars(self.owner,self.aid,'AAPL','2')

    def test_reference_chart_limit_reviews_native_spot_without_placing(self):
        result=self.service.ticket_review(self.owner,self.ticket())
        self.assertTrue(result['liveEnabled']);self.assertEqual(result['intent']['chartInstrument'],'hyperliquid:BTC')
        preview=self.broker.calls[-1];self.assertEqual(preview[1],'NATIVE_PREVIEW')
        self.assertEqual(preview[2]['symbol'],'BTC-USD');self.assertEqual(preview[2]['asset'],'crypto')
        self.assertNotIn('place_',str(self.broker.calls));self.assertNotIn('TEST_MCP_55556666',str(result))

    def test_crypto_usd_market_preview_keeps_notional_and_never_places(self):
        p=self.ticket(quantity=None,dollarAmount='50.00',orderType='market',limitPrice=None)
        result=self.service.ticket_review(self.owner,p)
        self.assertEqual(result['preview']['intent']['dollar_amount'],'50.00')
        self.assertEqual(result['preview']['intent']['type'],'market')
        self.assertNotIn('place_',str(self.broker.calls))

    def test_order_status_reads_selected_account_and_journals_only_completed_fills(self):
        original=self.broker.call
        def call(owner,name,args):
            if name=='get_crypto_orders':
                self.broker.calls.append((owner,name,args))
                return {'results':[{'id':'order-eth-1','symbol':'ETH-USD','side':'buy','state':'filled','filled_quantity':'0.02','average_price':'2500','fee':'0.05','updated_at':'2026-10-22T12:00:00Z'}]}
            return original(owner,name,args)
        self.broker.call=call
        delivered=[];self.service.journal_delivery=delivered.append
        result=self.service.orders(self.owner,self.aid,'crypto')
        self.assertEqual(result['orders'][0]['state'],'filled')
        read=next(c for c in self.broker.calls if c[1]=='get_crypto_orders')
        self.assertEqual(read[2]['rhs_account_number'],'55556666')
        account,fill=delivered
        self.assertEqual(account['eventType'],'account');self.assertRegex(account['account']['id'],r'^rh-[a-f0-9]{32}$')
        self.assertEqual(fill['eventType'],'execution');self.assertEqual(fill['execution']['symbol'],'ETH-USD')
        self.assertEqual(fill['execution']['quantity'],0.02);self.assertEqual(fill['execution']['price'],2500)

    def test_preview_rejects_wrong_reference_asset_and_readonly_account(self):
        for payload in [self.ticket(chartInstrument='hyperliquid:ETH'),self.ticket(accountId=next(a['id'] for a in self.accounts if not a['tradable']))]:
            with self.assertRaises(ValueError):self.service.ticket_review(self.owner,payload)
        self.assertFalse(any(c[1]=='NATIVE_PREVIEW' for c in self.broker.calls))

    def test_preview_rechecks_halt_step_notional_and_quote_freshness(self):
        self.broker.pairs[0]['halted']=True
        with self.assertRaisesRegex(ValueError,'restricted'):self.service.ticket_review(self.owner,self.ticket())
        self.broker.pairs[0]['halted']=False
        for kw in [{'quantity':'0.000001'},{'quantity':'0.00001'},{'limitPrice':'100.001'}]:
            with self.assertRaises(ValueError):self.service.ticket_review(self.owner,self.ticket(**kw))
        self.broker.quote_age=16
        with self.assertRaisesRegex(ValueError,'15 seconds'):self.service.ticket_review(self.owner,self.ticket())

    def test_equity_preview_requires_whole_shares_and_exact_chart(self):
        p=self.ticket(kind='equity',symbol='AAPL',chartInstrument='robinhood:AAPL',quantity='2')
        self.assertEqual(self.service.ticket_review(self.owner,p)['intent']['symbol'],'AAPL')
        with self.assertRaisesRegex(ValueError,'whole'):self.service.ticket_review(self.owner,{**p,'quantity':'0.5'})

    def test_three_and_fifteen_minute_charts_aggregate_complete_source_buckets(self):
        for tf,step in [('3',60),('15',300)]:
            bucket=int(self.now//(step*3))*(step*3)-step*3
            original=self.broker.call
            def call(owner,name,args):
                if name!='get_equity_historicals':return original(owner,name,args)
                rows=[{'begins_at':datetime.fromtimestamp(bucket+i*step,timezone.utc).isoformat(),'open_price':str(100+i),'high_price':str(103+i),'low_price':str(99+i),'close_price':str(101+i),'volume':'10'} for i in range(3)]
                # An incomplete neighboring bucket is excluded rather than padded.
                rows.append({**rows[0],'begins_at':datetime.fromtimestamp(bucket-step*3,timezone.utc).isoformat()})
                return {'results':[{'symbol':'AAPL','bars':rows}]}
            self.broker.call=call
            bars=self.service.equity_bars(self.owner,self.aid,'AAPL',tf)['bars']
            self.assertEqual(bars,[{'time':bucket*1000,'open':100.,'high':105.,'low':99.,'close':103.,'volume':30.}])
            self.broker.call=original

    def test_initial_minute_lookback_spans_weekends_and_holidays(self):
        self.service.equity_bars(self.owner,self.aid,'AAPL','1')
        args=self.broker.calls[-1][2]
        delta=datetime.fromisoformat(args['end_time'])-datetime.fromisoformat(args['start_time'])
        self.assertGreaterEqual(delta.total_seconds(),10*86400)

    def test_disconnected_and_foreign_account_denied(self):
        with self.assertRaises(ValueError):self.service.crypto_catalog(self.owner,'other')
        self.service.disconnect(self.owner)
        with self.assertRaises(ValueError):self.service.broker_quote(self.owner,self.aid,'crypto','BTC-USD')
