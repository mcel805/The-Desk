import threading
import time
import unittest
from house_abc import HouseABC


def bar(t):
    return {'time':t,'open':100,'high':102,'low':99,'close':101,'volume':10}


class HouseABCTests(unittest.TestCase):
    def test_results_wait_for_receipt_and_match_completed_cutoff(self):
        release=threading.Event();calls=[]
        def runner(bars,symbol,tick,frame):
            calls.append((bars,symbol,tick,frame));release.wait(2)
            return {'version':'desk-house-abc.1','cutoff':bars[-1]['time']+60000,'abc':{'id':7}}
        clock=[180000]
        h=HouseABC(runner,lambda:clock[0]);self.addCleanup(h.close)
        a=[bar(60000)]
        self.assertEqual(h.observe(a,'hyperliquid:BTC',1,5,120000)['reason'],'EVALUATING')
        release.set()
        for _ in range(100):
            if h.pending.done():break
            time.sleep(.005)
        # A result computed after the observation cannot be backdated.
        self.assertEqual(h.observe(a,'hyperliquid:BTC',1,5,120000)['reason'],'EVALUATING')
        result=h.observe(a,'hyperliquid:BTC',1,5,180000)
        self.assertEqual(result['status'],'AVAILABLE');self.assertEqual(result['received_at'],180000)
        self.assertEqual(len(calls),1)
        # Never carry an old score forward to a newer closed bar.
        self.assertEqual(h.observe(a+[bar(120000)],'hyperliquid:BTC',1,5,180000)['status'],'UNAVAILABLE')

    def test_failure_is_unavailable_and_not_silently_retried_in_same_candle(self):
        calls=[]
        def runner(*args):calls.append(1);raise RuntimeError('provider details are private')
        h=HouseABC(runner,lambda:180000);self.addCleanup(h.close)
        h.observe([bar(60000)],'hyperliquid:BTC',1,5,180000)
        for _ in range(100):
            if h.pending.done():break
            time.sleep(.005)
        result=h.observe([bar(60000)],'hyperliquid:BTC',1,5,180000)
        self.assertEqual(result['reason'],'EVALUATION_FAILED');self.assertEqual(result['error_class'],'RuntimeError')
        self.assertEqual(len(calls),1);self.assertNotIn('provider details',str(result))


class HouseServiceIntegrationTests(unittest.TestCase):
    def test_collector_sends_same_causal_house_evidence_to_jev_and_checkpoint(self):
        import tempfile
        from pathlib import Path
        from unittest.mock import patch
        from test_swing_tracker import FakeGateway, FakeJudge, response, BASE
        from swing_research import SwingResearch
        now=BASE+9010000;gateway=FakeGateway(now);calls=[];judge=FakeJudge()
        judge.judge=lambda state:(calls.append(state) or response())
        class ReadyHouse:
            def observe(self,bars,symbol,tick,frame,observed_at):
                return {'status':'AVAILABLE','version':'desk-house-abc.1','cutoff':bars[-1]['time']+60000,
                        'received_at':observed_at,'abc':{'root_id':4,'stage':3},'exhaustion':{'root_id':4,'score':6,'available':10},
                        'events':[{'scope':'RECONSTRUCTED','family':0}]}
            def close(self):pass
        with tempfile.TemporaryDirectory() as d, patch('swing_research.HouseABC',ReadyHouse):
            svc=SwingResearch(gateway,Path(d),judge)
            try:
                with patch('swing_research.time.time',return_value=now/1000):
                    svc.command({'action':'configure','symbol':'hyperliquid:BTC','config':{'jev_enabled':True}})
                    svc.command({'action':'start','symbol':'hyperliquid:BTC'})
                    svc.sample('hyperliquid:BTC',svc.active['hyperliquid:BTC'])
                self.assertEqual(len(calls),1)
                self.assertEqual(calls[0]['house_abc']['exhaustion']['score'],6)
                self.assertNotIn('events',calls[0]['house_abc'])
                snap=svc.last['hyperliquid:BTC']['snapshot']
                self.assertEqual(snap['house_abc']['cutoff'],snap['cutoff'])
                self.assertEqual(snap['house_abc']['events'][0]['scope'],'RECONSTRUCTED')
                with svc.read_db() as db:
                    import json
                    record=db.execute('SELECT state FROM predictions').fetchone()
                    state=json.loads(record['state'])
                self.assertEqual(state['house_abc']['received_at'],now)
                self.assertEqual(state['house_abc']['exhaustion']['available'],10)
            finally:svc.close()

if __name__=='__main__':unittest.main()
