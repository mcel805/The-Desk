import copy
import math
import tempfile
import threading
import time
import unittest
from pathlib import Path
from engine import Engine
from chart_chat import ChartChat,snapshot,tools,PLAN,REVIEW,ANSWER,web_research_complete

def chart(n=180,tf='1m'):
    ms=60000 if tf=='1m' else 1800000;end=int(time.time()*1000)//ms*ms
    bars=[]
    for i in range(n):
        p=100+math.sin(i*math.pi/12)*8+i*.01
        bars.append({'time':end-(n-i)*ms,'open':p-.2,'high':p+1,'low':p-1,'close':p+.2,'volume':10+i})
    return {'symbol':'fixture:TEST','timeframe':tf,'cellId':'c1','style':'candles','cutoff':end,'bars':bars}

class FakeSession:
    calls=[]
    def __init__(self,**kw):self.kw=kw
    def ensure_thread(self,instructions):self.instructions=instructions
    def run(self,prompt,schema,**kw):
        self.calls.append((self.instructions,prompt,self.kw))
        if schema==PLAN:return {'action':'liquidity','reason':'fixture route'},[]
        if schema==REVIEW:
            searches=[{'type':'webSearch','action':{'type':'search','query':'fixture'}},{'type':'webSearch','action':{'type':'openPage','url':'https://example.com/fixture'}}] if self.kw.get('web_search')=='live' else []
            for item in searches:self.kw['on_event']('search',{'action':item['action'],'status':'completed'})
            return {'summary':'Synthetic specialist review','evidenceIds':[],'limitations':'Synthetic chart only'},searches
        return {'answer':'Synthetic final analysis','followups':['Explain the strongest pool']},[]
    def close(self):pass

class ChatTests(unittest.TestCase):
    def test_web_research_requires_ordered_search_then_explicit_public_open(self):
        search={'type':'webSearch','action':{'type':'search','query':'liquidity'}}
        opened={'type':'webSearch','action':{'type':'openPage','url':'https://example.com/source'}}
        self.assertTrue(web_research_complete([search,opened]))
        self.assertFalse(web_research_complete([opened,search]))
        self.assertFalse(web_research_complete([search,{'type':'webSearch','sources':[{'url':'https://example.com/source'}]}]))
        self.assertFalse(web_research_complete([search,{'type':'webSearch','action':{'type':'openPage','sources':[{'url':'https://example.com/source'}]}}]))
        self.assertFalse(web_research_complete([search,{'type':'webSearch','action':{'type':'findInPage','url':'https://example.com/source'}}]))
        self.assertFalse(web_research_complete([search,{'type':'webSearch','action':{'type':'openPage','url':'file:///private/source'}}]))

    def test_returned_and_callback_events_require_the_same_ordered_explicit_open(self):
        class EvidenceChannels(FakeSession):
            def __init__(self,mode,**kw):
                super().__init__(**kw);self.mode=mode
            def run(self,prompt,schema,**kw):
                if schema==REVIEW and self.kw.get('web_search')=='live':
                    search={'type':'webSearch','action':{'type':'search','query':'fixture'}}
                    opened={'type':'webSearch','action':{'type':'openPage','url':'https://example.com/fixture'}}
                    if self.mode=='sources':events=[search,{'type':'webSearch','sources':[{'url':'https://example.com/fixture'}]}]
                    elif self.mode=='find':events=[search,{'type':'webSearch','action':{'type':'findInPage','url':'https://example.com/fixture'}}]
                    else:events=[search,opened]
                    if self.mode!='returned-only':
                        callback_events=list(reversed(events)) if self.mode=='reversed-callback' else events
                        for item in callback_events:self.kw['on_event']('search',{**item,'status':'completed'})
                    returned=[] if self.mode=='callback-only' else events
                    return {'summary':'Synthetic specialist review','evidenceIds':[],'limitations':'Synthetic chart only'},returned
                return super().run(prompt,schema,**kw)

        for mode,expected in (('ordered','ready'),('returned-only','failed'),('callback-only','failed'),('reversed-callback','failed'),('sources','failed'),('find','failed')):
            with self.subTest(mode=mode),tempfile.TemporaryDirectory() as tmp:
                factory=lambda mode=mode,**kw:EvidenceChannels(mode,**kw)
                service=ChartChat(Engine(Path(tmp)/'desk.sqlite3'),factory)
                run=service.begin({'text':'Rank liquidity','snapshot':chart(),'web':True})
                for _ in range(100):
                    run=service.read(run['id'])
                    if run['status']!='running':break
                    time.sleep(.01)
                self.assertEqual(run['status'],expected,run.get('error'))
                service.close()
    def test_chart_chat_delivers_the_swing_rider_rulebook_contract(self):
        from swing_advisors import instructions
        FakeSession.calls=[]
        with tempfile.TemporaryDirectory() as tmp:
            service=ChartChat(Engine(Path(tmp)/'desk.sqlite3'),FakeSession)
            run=service.begin({'text':'Rank liquidity','snapshot':chart()})
            for _ in range(100):
                run=service.read(run['id'])
                if run['status']!='running':break
                time.sleep(.01)
            self.assertEqual(run['status'],'ready',run.get('error'))
            swing_prompt=instructions('rider')
            marker='\n\nSTRATEGY SOURCE SNAPSHOT\n'
            self.assertIn(marker,swing_prompt)
            shared=swing_prompt.split(marker,1)[1]
            rider_prompt=next(call[0] for call in FakeSession.calls if call[0].startswith('You are RIDER,') and 'PINNED SPECIALIST RULEBOOK' in call[0])
            self.assertIn('\nPINNED SPECIALIST RULEBOOK\n'+shared,rider_prompt)
            service.close()
    def test_completed_snapshot_hash_and_ohlc_validation(self):
        c=chart();c['bars'].append({**c['bars'][-1],'time':c['cutoff']})
        s=snapshot(c);self.assertEqual(len(s['bars']),180);self.assertEqual(snapshot(c)['sha256'],s['sha256'])
        c['bars'][0]['close']=999
        with self.assertRaisesRegex(ValueError,'geometry'):snapshot(c)
    def test_invalid_input_and_transformed_candles(self):
        for change in ({'style':'heikinashi'},{'timeframe':'1s'},{'symbol':'TEST'},{'bars':[]},{'cutoff':float('nan')}):
            with self.assertRaises(ValueError):snapshot({**chart(),**change})
    def test_profiles_are_anchored_to_completed_alternating_swings(self):
        s=snapshot(chart());r=tools('volume_profile',s)
        self.assertGreater(len(r['drawings']),5)
        self.assertEqual(len(r['drawings']),len(r['evidence']))
        for d,e in zip(r['drawings'],r['evidence']):
            self.assertEqual(d['type'],'fixedrangevp');self.assertNotEqual(e['start']['side'],e['end']['side'])
            self.assertLess(e['end']['knownAt'],s['completedCutoff'])
            self.assertEqual(d['options']['anchors'][0]['time'],e['start']['time'])
    def test_volume_unavailable_never_gets_a_fake_profile(self):
        for volume in (None,0):
            c=chart()
            for b in c['bars']:b['volume']=volume
            with self.assertRaisesRegex(ValueError,'Volume'):tools('volume_profile',snapshot(c))
    def test_profile_does_not_bridge_missing_bars(self):
        c=chart();s=snapshot(c);all_count=len(tools('volume_profile',s)['drawings'])
        c['bars'].pop(20);r=tools('volume_profile',snapshot(c));self.assertLess(len(r['drawings']),all_count)
    def test_liquidity_ranks_and_prices_are_supported_by_their_own_frame(self):
        s=snapshot(chart(tf='30m'));r=tools('liquidity',s)
        self.assertGreater(len(r['evidence']),1)
        self.assertEqual([x['rank'] for x in r['evidence']],list(range(1,len(r['evidence'])+1)))
        self.assertEqual([x['score'] for x in r['evidence']],sorted([x['score'] for x in r['evidence']],reverse=True))
        times={x['time']:x for x in s['bars']}
        for e,d in zip(r['evidence'],r['drawings']):
            self.assertAlmostEqual(e['price'],sum(p['price'] for p in e['anchors'])/len(e['anchors']))
            for p in e['anchors']:self.assertEqual(p['price'],times[p['time']][p['side']])
            self.assertEqual(d['options']['anchors'][0]['price'],e['price'])
    def test_rebuilt_pool_does_not_reuse_reactions_before_clearance(self):
        c=chart(n=50)
        for b in c['bars']:b.update(open=95,high=97,low=93,close=95)
        for i,high in ((10,100),(20,110),(30,100.01)):c['bars'][i]['high']=high
        for i in (15,25):c['bars'][i]['low']=85
        r=tools('liquidity',snapshot(c))
        rebuilt=next(e for e in r['evidence'] if abs(e['price']-100.01)<.001)
        self.assertEqual(rebuilt['touches'],1);self.assertEqual(rebuilt['state'],'rebuilt-candidate')
    def test_real_orchestrator_invokes_both_specialist_interfaces_and_persists(self):
        FakeSession.calls=[]
        with tempfile.TemporaryDirectory() as tmp:
            engine=Engine(Path(tmp)/'desk.sqlite3');service=ChartChat(engine,FakeSession)
            r=service.begin({'text':'Rank liquidity','snapshot':chart(tf='30m'),'web':True})
            for _ in range(100):
                saved=service.read(r['id'])
                if saved['status']!='running':break
                time.sleep(.01)
            self.assertEqual(saved['status'],'ready',saved)
            self.assertEqual([x['agent'] for x in saved['reviews']],['RIDER','Spider'])
            self.assertTrue(any(x[2]['web_search']=='live' for x in FakeSession.calls))
            self.assertEqual(len(FakeSession.calls),4)
            self.assertEqual(saved['sources'],['https://example.com/fixture'])
            self.assertIn('lead trader',FakeSession.calls[2][0].lower())
            self.assertIn('RIDER SUPPORTING REVIEW',FakeSession.calls[2][1])
            self.assertIn('Spider lead',FakeSession.calls[3][0])
            with self.assertRaisesRegex(ValueError,'mismatch'):service.applied({'id':r['id'],'sha256':'bad'})
            done=service.applied({'id':r['id'],'sha256':saved['snapshot']['sha256'],'outcome':'18 drawings applied'})
            self.assertEqual(done['status'],'complete')
            self.assertEqual(service.applied({'id':r['id'],'sha256':saved['snapshot']['sha256'],'outcome':'18 drawings applied'})['status'],'complete')
            self.assertEqual(ChartChat(engine,FakeSession).history(r['chatId'])['runs'][0]['answer'],'Synthetic final analysis')
            retracted=service.applied({'id':r['id'],'sha256':saved['snapshot']['sha256'],'rolledBack':True})
            self.assertEqual(retracted['application'],'Not applied · chart batch rolled back')
            with self.assertRaisesRegex(ValueError,'no longer ready'):service.applied({'id':r['id'],'sha256':saved['snapshot']['sha256'],'outcome':'18 drawings applied'})
    def test_stop_rejects_late_application(self):
        with tempfile.TemporaryDirectory() as tmp:
            engine=Engine(Path(tmp)/'desk.sqlite3');service=ChartChat(engine,FakeSession)
            r=service.begin({'text':'Rank liquidity','snapshot':chart()})
            service.cancel(r['id'])
            with self.assertRaisesRegex(ValueError,'no longer ready'):service.applied({'id':r['id'],'sha256':r['snapshot']['sha256']})
            service.close()
    def test_restart_marks_inflight_analysis_failed(self):
        with tempfile.TemporaryDirectory() as tmp:
            e=Engine(Path(tmp)/'desk.sqlite3');s=ChartChat(e,FakeSession)
            s.save({'id':'a','chatId':'b','createdAt':1,'status':'running'})
            self.assertEqual(ChartChat(e,FakeSession).read('a')['status'],'failed')
    def test_malformed_specialist_schema_is_repaired_before_ready(self):
        class RepairSession(FakeSession):
            def __init__(self,**kw):super().__init__(**kw);self.repaired=False
            def run(self,prompt,schema,**kw):
                if schema==REVIEW and not self.repaired:
                    self.repaired=True;return {'unexpected':'invalid analyst response'},[]
                return super().run(prompt,schema,**kw)
        with tempfile.TemporaryDirectory() as tmp:
            s=ChartChat(Engine(Path(tmp)/'desk.sqlite3'),RepairSession)
            r=s.begin({'text':'Rank liquidity','snapshot':chart()})
            for _ in range(100):
                r=s.read(r['id'])
                if r['status']!='running':break
                time.sleep(.01)
            self.assertEqual(r['status'],'ready',r.get('error'))
            self.assertEqual(sum('Repairing' in e['message'] for e in r['events']),2)
            s.close()
    def test_unperformed_web_research_fails_without_ready_markup(self):
        class NoWeb(FakeSession):
            def run(self,prompt,schema,**kw):
                if schema==REVIEW and self.kw.get('web_search')=='live':
                    return {'summary':'Synthetic specialist review','evidenceIds':[],'limitations':'Synthetic chart only'},[]
                return super().run(prompt,schema,**kw)
        with tempfile.TemporaryDirectory() as tmp:
            s=ChartChat(Engine(Path(tmp)/'desk.sqlite3'),NoWeb)
            r=s.begin({'text':'Rank liquidity','snapshot':chart(),'web':True})
            for _ in range(100):
                r=s.read(r['id'])
                if r['status']!='running':break
                time.sleep(.01)
            self.assertEqual(r['status'],'failed');self.assertIn('Web research did not complete',r['error']);s.close()
    def test_search_only_web_research_fails_without_ready_markup(self):
        class SearchOnly(FakeSession):
            def run(self,prompt,schema,**kw):
                if schema==REVIEW and self.kw.get('web_search')=='live':
                    return {'summary':'Synthetic specialist review','evidenceIds':[],'limitations':'Synthetic chart only'},[{'type':'webSearch','action':{'type':'search','query':'fixture'}}]
                return super().run(prompt,schema,**kw)
        with tempfile.TemporaryDirectory() as tmp:
            s=ChartChat(Engine(Path(tmp)/'desk.sqlite3'),SearchOnly)
            r=s.begin({'text':'Rank liquidity','snapshot':chart(),'web':True})
            for _ in range(100):
                r=s.read(r['id'])
                if r['status']!='running':break
                time.sleep(.01)
            self.assertEqual(r['status'],'failed');self.assertIn('search followed by an explicit public source open',r['error']);s.close()
    def test_support_then_spider_lead_reviews_volume_profile_requests(self):
        class VolumePlan(FakeSession):
            def run(self,prompt,schema,**kw):
                if schema==PLAN:return {'action':'volume_profile','reason':'fixture route'},[]
                return super().run(prompt,schema,**kw)
        with tempfile.TemporaryDirectory() as tmp:
            s=ChartChat(Engine(Path(tmp)/'desk.sqlite3'),VolumePlan)
            r=s.begin({'text':'Profile each swing','snapshot':chart(tf='1m')})
            for _ in range(100):
                r=s.read(r['id'])
                if r['status']!='running':break
                time.sleep(.01)
            self.assertEqual(r['status'],'ready',r.get('error'))
            self.assertEqual([x['agent'] for x in r['reviews']],['RIDER','Spider'])
            self.assertEqual(r['result']['action'],'volume_profile')
            s.close()
    def test_stop_interrupts_in_memory_even_when_storage_is_unavailable(self):
        from unittest.mock import patch
        entered=threading.Event();release=threading.Event()
        class Slow(FakeSession):
            def run(self,prompt,schema,**kw):entered.set();release.wait(2);return super().run(prompt,schema,**kw)
        with tempfile.TemporaryDirectory() as tmp:
            s=ChartChat(Engine(Path(tmp)/'desk.sqlite3'),Slow)
            r=s.begin({'text':'Rank liquidity','snapshot':chart()});self.assertTrue(entered.wait(2))
            with patch.object(s,'save',side_effect=OSError('fixture storage unavailable')):
                stopped=s.cancel(r['id'])
                self.assertEqual(stopped['status'],'cancelled');self.assertTrue(s.running[r['chatId']][1].is_set())
            release.set();s.close()

if __name__=='__main__':unittest.main()
