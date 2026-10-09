"""Isolated paper execution tests; no live sessions, network or paid model calls."""
import json
import sqlite3
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
import crypto_day_desk as desk
import crypto_hunt_sessions as hunts
import rider_auto as rider
import server
from rider_playbooks import detect, questions


class RiderAutoTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.old_path=desk.DB_PATH;self.old_now=desk.now
        desk.DB_PATH=Path(self.tmp.name)/'desk.sqlite3'
        self.now=int(time.time()*1000)//60000*60000+5000
        desk.now=lambda:self.now
        self.addCleanup(setattr,desk,'DB_PATH',self.old_path);self.addCleanup(setattr,desk,'now',self.old_now)
        self.db=server.connect(Path(self.tmp.name)/'sim.sqlite3');self.addCleanup(self.db.close)
        self.account=desk.cycle_account(self.db)['account'];self.db.commit();rider.schema(self.db)
        self.p={**desk.DEFAULT_POLICY,'id':'test','riskTickBTC':.2,'feeBps':0,'slippageBps':0,'minQuality':0}
        self.base=self.now//60000*60000-30*60000
        self.level={'id':'manual:test','price':100,'side':-1,'tf':6,'weight':0,'born':self.base,'takenAt':0,'origin':'manual'}
        self.bars=[{'time':self.base+i*60000,'open':102,'high':103,'low':101.6,'close':102,'volume':10} for i in range(20)]
        self.bars += [self.bar(20,101,102,99.5,101),self.bar(21,102,103,101.5,102.5),self.bar(22,101.2,101.5,100.05,100.8),self.bar(23,100.8,102.5,100.7,102)]
        self.s={'id':'s','provider':'coinbase','symbol':'BTC-USD','account':self.account['account_id'],'started':self.base,'ended':None,'levels':[self.level],'indicatorSettings':{},'policy':self.p,'apiRequested':True,'levelRevision':1,'startCutoff':self.base-60000,'initialBalance':500,'accountName':'Isolated paper test','name':'Test hunt'}
        with patch.object(desk.taper_decisions,'status',return_value={'configured':True}):
            self.s['auto']=rider.config({'enabled':True,'targetPrice':120},self.s,{'lastPrice':102,'levels':[]},desk)
        self.s['auto']['after']=self.base
        self.s['auto']['expiresAt']=self.now+3600000
        with desk.connection() as db:
            db.execute('INSERT INTO hunt_sessions VALUES(?,?,?,?,?,NULL,?,NULL,NULL)',('s','coinbase','BTC-USD',self.s['account'],self.base,desk.encode(self.s)))

    def bar(self,i,o,h,l,c):return {'time':self.base+i*60000,'open':o,'high':h,'low':l,'close':c,'volume':20}
    def candidate(self):
        out=rider.candidates(self.bars,self.s,desk);self.assertTrue(out);return out[0]
    def receipt(self,c=None):
        c=c or self.candidate();self.now=c['barTime']+60000+5000
        return {'source':{'provider':'coinbase','symbol':'BTC-USD','completedCutoff':c['barTime']},'huntSessionId':'s','levelRevision':1,'decisionId':'jev-test','riderCandidates':[c],'answers':[{'name':'rider_entry_0','choice':'ENTER','confidence':1,'probabilities':{'ENTER':1,'WAIT':0,'INVALIDATED':0}}]}
    def pending(self):
        r=self.receipt();rider.queue_signal(r,self.s,self.db,desk);return self.db.execute('SELECT * FROM rider_auto_orders').fetchone()
    def test_rejection_requires_departure_retest_and_later_trigger(self):
        self.assertFalse(any(c['fresh'] for c in detect(self.bars[:-1],self.level,self.p)))
        c=self.candidate();self.assertEqual('rejection_retest',c['playbook']);self.assertLess(c['retestTime'],c['triggerTime'])
    def test_break_acceptance_and_retest(self):
        bars=self.bars[:20];bars[-1]=self.bar(19,99,99.8,98,99)
        bars += [self.bar(20,99,101.5,99,101),self.bar(21,101,103,100.7,102),self.bar(22,102,104,101.5,103),self.bar(23,102,102,100.05,100.8),self.bar(24,100.8,103,100.5,102.5)]
        c=next(c for c in detect(bars,self.level,self.p,['break_retest']) if c['fresh']);self.assertEqual(1,c['direction'])
    def test_mirrored_short_rejection(self):
        bars=[{**b,'open':200-b['open'],'high':200-b['low'],'low':200-b['high'],'close':200-b['close']} for b in self.bars]
        c=next(c for c in detect(bars,{**self.level,'side':1},self.p) if c['fresh']);self.assertEqual(-1,c['direction'])
    def test_no_retest_is_not_ready(self):
        bars=[{**b,'low':101.6,'high':103,'open':102,'close':102} if i>=22 else b for i,b in enumerate(self.bars)]
        self.assertFalse(any(c['fresh'] for c in detect(bars,self.level,self.p)))
    def test_gap_blocks_sequence(self):
        self.assertFalse(any(c['fresh'] for c in detect(self.bars[:21]+self.bars[22:],self.level,self.p)))
    def test_stale_confirmation_not_replayed(self):
        bars=self.bars+[self.bar(24,102,103,101,102)]
        self.assertFalse(any(c['fresh'] for c in detect(bars,self.level,self.p)))
    def test_jev_wait_and_low_confidence_do_not_queue(self):
        r=self.receipt();r['answers'][0]['choice']='WAIT';rider.queue_signal(r,self.s,self.db,desk)
        r['answers'][0].update(choice='ENTER',confidence=.5);rider.queue_signal(r,self.s,self.db,desk)
        self.assertEqual(0,self.db.execute('SELECT COUNT(*) FROM rider_auto_orders').fetchone()[0])
    def test_mismatched_revision_source_and_stale_do_not_queue(self):
        for change in ('revision','source','stale'):
            r=self.receipt()
            if change=='revision':r['levelRevision']=2
            elif change=='source':r['source']['symbol']='ETH-USD'
            else:self.now+=46000
            rider.queue_signal(r,self.s,self.db,desk)
        self.assertEqual(0,self.db.execute('SELECT COUNT(*) FROM rider_auto_orders').fetchone()[0])
    def test_duplicate_signal_has_one_pending_order(self):
        r=self.receipt();rider.queue_signal(r,self.s,self.db,desk);rider.queue_signal(r,self.s,self.db,desk)
        self.assertEqual(1,self.db.execute('SELECT COUNT(*) FROM rider_auto_orders').fetchone()[0])
    def test_no_retroactive_fill_and_future_fill_is_idempotent(self):
        order=self.pending();rider.advance(self.s,self.bars,self.db,desk,server)
        self.assertEqual(0,self.db.execute('SELECT COUNT(*) FROM quant_lab_sim_positions').fetchone()[0])
        b={'time':order['eligible'],'open':102,'high':103,'low':101,'close':102,'volume':1};self.now=b['time']+65000
        rider.advance(self.s,self.bars+[b],self.db,desk,server);rider.advance(self.s,self.bars+[b],self.db,desk,server)
        pos=self.db.execute('SELECT * FROM quant_lab_sim_positions').fetchone()
        self.assertEqual(b['time']//1000,pos['entry_bar_time']);self.assertEqual('open',pos['status'])
        self.assertEqual(1,self.db.execute('SELECT COUNT(*) FROM quant_lab_sim_positions').fetchone()[0])
    def test_same_fill_bar_stop_first_and_net_fees(self):
        self.s['auto']['policy']['feeBps']=1
        o=self.pending();b={'time':o['eligible'],'open':102,'high':121,'low':98,'close':100,'volume':1};self.now=b['time']+65000
        rider.advance(self.s,self.bars+[b],self.db,desk,server)
        pos=self.db.execute('SELECT * FROM quant_lab_sim_positions').fetchone();self.assertEqual('closed',pos['status']);self.assertEqual('rider_stop_first_ambiguous',pos['close_reason'])
        trade=json.loads(self.db.execute('SELECT body FROM rider_auto_trades').fetchone()[0]);self.assertLess(trade['netPnl'],pos['gross_pnl'])
    def test_excess_entry_drift_cancels(self):
        o=self.pending();b={'time':o['eligible'],'open':110,'high':111,'low':109,'close':110,'volume':1};self.now=b['time']+65000
        rider.advance(self.s,self.bars+[b],self.db,desk,server)
        self.assertEqual('cancelled',self.db.execute('SELECT status FROM rider_auto_orders').fetchone()[0])
    def test_pause_cancels_pending_but_preserves_position_brackets(self):
        self.pending();rider.control({'session':'s','action':'pause'},self.db,desk)
        self.assertEqual('cancelled',self.db.execute('SELECT status FROM rider_auto_orders').fetchone()[0])
        with desk.connection() as db:self.assertFalse(hunts.unpack(db.execute('SELECT * FROM hunt_sessions').fetchone())['auto']['armed'])
    def test_time_exit_works_when_disarmed(self):
        self.s['auto']['maxHoldBars']=1
        o=self.pending();b={'time':o['eligible'],'open':102,'high':103,'low':101,'close':102,'volume':1};self.now=b['time']+65000
        rider.advance(self.s,self.bars+[b],self.db,desk,server)
        self.s['auto']['armed']=False;b2={**b,'time':b['time']+60000};self.now=b2['time']+65000
        rider.advance(self.s,self.bars+[b,b2],self.db,desk,server)
        self.assertEqual('rider_time_exit',self.db.execute('SELECT close_reason FROM quant_lab_sim_positions').fetchone()[0])
    def test_manual_level_source_and_price_validation(self):
        payload={'manualLevels':[{'id':'manual:a','drawingId':'a','type':'hline','provider':'coinbase','symbol':'BTC-USD','price':100,'side':-1}]}
        a=hunts.manual_levels(payload,'coinbase','BTC-USD',desk)[0];self.assertEqual('manual',a['origin'])
        payload['manualLevels'][0]['symbol']='ETH-USD'
        with self.assertRaises(ValueError):hunts.manual_levels(payload,'coinbase','BTC-USD',desk)
    def test_manual_price_is_frozen(self):
        with desk.connection() as db:s=hunts.unpack(db.execute('SELECT * FROM hunt_sessions').fetchone())
        original=s['levels'][0]['price'];self.level['price']=101
        with desk.connection() as db:self.assertEqual(original,hunts.unpack(db.execute('SELECT * FROM hunt_sessions').fetchone())['levels'][0]['price'])
    def test_risk_unit_missing_blocks_arming(self):
        self.s['policy']={**self.p,'riskTickBTC':0}
        with patch.object(desk.taper_decisions,'status',return_value={'configured':True}),self.assertRaises(ValueError):rider.config({'enabled':True,'targetPrice':120},self.s,{'lastPrice':102,'levels':[]},desk)
    def test_armed_level_changes_blocked(self):
        with self.assertRaisesRegex(ValueError,'Pause Rider'):hunts.update_levels({'session':'s','revision':1,'source':{'provider':'coinbase','symbol':'BTC-USD','timeframe':'1m'},'add':[],'remove':['manual:test']},desk)
    def test_daily_cap_and_existing_position_block_entries(self):
        c=self.candidate();self.s['auto']['maxTrades']=1
        self.db.execute("INSERT INTO quant_lab_sim_positions(position_id,account_id,provider,symbol,timeframe,side,quantity,multiplier,entry_price,entry_bar_time,entry_source,entry_recorded_at,status,gross_pnl,exit_price,exit_recorded_at,exit_bar_time,checked_through_bar_time) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",('prior',self.s['account'],'coinbase','BTC-USD','1m','long',1,1,100,1,'test',server.utc_now(),'closed',0,100,server.utc_now(),2,2));self.db.commit()
        with self.assertRaisesRegex(ValueError,'Daily entry limit'):rider.entry_gate(self.db,self.s,self.s['auto'],c,c['entry'])
        self.db.execute("UPDATE quant_lab_sim_positions SET status='open'");self.db.commit()
        with self.assertRaisesRegex(ValueError,'Existing account'):rider.entry_gate(self.db,self.s,self.s['auto'],c,c['entry'])
    def test_signal_distribution_must_support_enter(self):
        r=self.receipt();r['answers'][0]['probabilities']={'ENTER':.1,'WAIT':.9,'INVALIDATED':0}
        rider.queue_signal(r,self.s,self.db,desk);self.assertEqual(0,self.db.execute('SELECT COUNT(*) FROM rider_auto_orders').fetchone()[0])
    def test_worker_restart_disarms_then_background_cycle_fills(self):
        # Run the exact worker loop synchronously with fixture transport, isolated DBs
        # and no browser, paid inference, journal network or real account state.
        self.now=self.bars[-1]['time']+65000
        target=[]
        class Thread:
            def __init__(other,**kw):target.append(kw['target'])
            def start(other):pass
            def is_alive(other):return False
        old_thread=rider._thread;self.addCleanup(setattr,rider,'_thread',old_thread)
        with patch.object(rider.threading,'Thread',Thread):rider.start_worker(server,desk,Path(self.tmp.name)/'sim.sqlite3')
        with desk.connection() as db:
            saved=hunts.unpack(db.execute('SELECT * FROM hunt_sessions').fetchone());self.assertFalse(saved['auto']['armed'])
            rider.save_auto(db,'s',self.s['auto'],desk)
        cycles=[0]
        def transport(s):
            bars=self.bars.copy()
            if cycles[0]:
                o=self.db.execute('SELECT * FROM rider_auto_orders').fetchone()
                bars.append({'time':o['eligible'],'open':102,'high':103,'low':101,'close':102,'volume':1});self.now=bars[-1]['time']+65000
            source={'provider':'coinbase','symbol':'BTC-USD','timeframe':'1m','completedCutoff':bars[-1]['time'],'snapshotAsOf':self.now}
            return {'source':source,'bars':bars,'raw':[],'frames':[],'series':[],'indicatorSettings':{},'method':'TEST FIXTURE',
              'evidence':{'source':source,'bars':bars[-24:],'frames':[],'levels':{}}}
        def inference(evidence,path):
            import taper_decisions
            qs=taper_decisions.decision_questions(False,True)
            if evidence['riderCandidates']:qs={k:v for k,v in qs.items() if k in ('tape_state','structure_clarity')}
            qs.update(questions(evidence['riderCandidates']));raw={}
            for k,q in qs.items():
                labels=list(q['criteria']) if q['type']=='choice' else [str(i) for i in range(len(q['criteria']))]
                chosen='ENTER' if k.startswith('rider_entry_') else labels[-1]
                a={'type':q['type'],'confidence':1,'probabilities':{x:float(x==chosen) for x in labels}}
                if q['type']=='choice':a['choice']=chosen
                else:a.update(score=len(labels)-1,legend={x:q['criteria'][int(x)] for x in labels})
                raw[k]=a
            return {'decisionId':'fixture-'+str(cycles[0]),'source':evidence['source'],'model':taper_decisions.MODEL,'questions':qs,
                'answers':taper_decisions.normalize_answers(raw,qs),'riderCandidates':evidence['riderCandidates'],'usage':{'input_tokens':0,'output_tokens':0},'estimatedUsd':0}
        def sleep(seconds):
            cycles[0]+=1
            if cycles[0]>=2:raise SystemExit()
        with patch.object(rider,'snapshot',side_effect=transport),patch.object(rider.time,'sleep',side_effect=sleep),patch.object(desk.taper_decisions,'status',return_value={'configured':True}),patch.object(desk.taper_decisions,'decide',side_effect=inference),patch.object(hunts,'sync_journal',return_value={'synced':True}):
            with self.assertRaises(SystemExit):target[0]()
        pos=self.db.execute('SELECT * FROM quant_lab_sim_positions').fetchone();self.assertIsNotNone(pos,rider.STATUS)
        self.assertEqual('open',pos['status']);self.assertEqual('filled',self.db.execute('SELECT status FROM rider_auto_orders').fetchone()[0])
    def test_worker_waits_for_first_new_minute_without_disarming(self):
        self.now=self.bars[-1]['time']+65000;self.s['startCutoff']=self.bars[-1]['time']
        with desk.connection() as db:db.execute('UPDATE hunt_sessions SET body=? WHERE id=?',(desk.encode(self.s),'s'))
        captured=[]
        class Thread:
            def __init__(other,**kw):captured.append(kw['target'])
            def start(other):pass
            def is_alive(other):return False
        old=rider._thread;self.addCleanup(setattr,rider,'_thread',old)
        with patch.object(rider.threading,'Thread',Thread):rider.start_worker(server,desk,Path(self.tmp.name)/'sim.sqlite3')
        with desk.connection() as db:rider.save_auto(db,'s',self.s['auto'],desk)
        source={'provider':'coinbase','symbol':'BTC-USD','timeframe':'1m','completedCutoff':self.bars[-1]['time'],'snapshotAsOf':self.now}
        data={'source':source,'bars':self.bars,'raw':[],'frames':[],'series':[],'indicatorSettings':{},'evidence':{}}
        with patch.object(rider,'snapshot',return_value=data),patch.object(rider.time,'sleep',side_effect=SystemExit),patch.object(hunts,'sync_journal',return_value={}),patch.object(desk,'model_read') as model:
            with self.assertRaises(SystemExit):captured[0]()
        model.assert_not_called()
        with desk.connection() as db:self.assertTrue(hunts.unpack(db.execute('SELECT * FROM hunt_sessions').fetchone())['auto']['armed'])
    def test_clock_out_cancels_pending_before_next_session(self):
        self.pending()
        with patch.object(hunts,'sync_journal',return_value={'synced':True}):
            result=desk.clock_out({'session':'s'},self.db)
        self.assertIsNotNone(result['session']['ended']);self.assertFalse(result['session']['auto']['armed'])
        self.assertEqual('cancelled',self.db.execute('SELECT status FROM rider_auto_orders').fetchone()[0])
    def test_model_read_retains_longer_causal_history_than_model_tape(self):
        self.p['expiryBars']=40
        bars=self.bars[:22]+[self.bar(i,102,103,101.6,102) for i in range(22,52)]
        bars += [self.bar(52,101.2,101.5,100.05,100.8),self.bar(53,100.8,102.5,100.7,102)]
        self.now=bars[-1]['time']+65000
        with desk.connection() as db:db.execute('UPDATE hunt_sessions SET body=? WHERE id=?',(desk.encode(self.s),'s'))
        source={'provider':'coinbase','symbol':'BTC-USD','timeframe':'1m','completedCutoff':bars[-1]['time'],'snapshotAsOf':self.now}
        captured=[]
        def decide(evidence,path):
            captured.append(evidence)
            return {'decisionId':'history-test','source':source,'answers':[],'riderCandidates':evidence['riderCandidates'],'estimatedUsd':0}
        with patch.object(desk.taper_decisions,'status',return_value={'configured':True}),patch.object(desk.taper_decisions,'decide',side_effect=decide):
            desk.model_read({'evidence':{'source':source,'bars':bars[-24:],'frames':[]}},playbook_bars=bars)
        c=captured[0]['riderCandidates'][0]
        self.assertLess(c['reactionTime'],captured[0]['bars'][0]['time']);self.assertTrue(c['fresh'])
    def test_entry_question_is_bound_to_candidate(self):
        q=questions([self.candidate()]);self.assertIn('riderCandidates[0]',q['rider_entry_0']['instructions']);self.assertEqual({'ENTER','WAIT','INVALIDATED'},set(q['rider_entry_0']['criteria']))

if __name__=='__main__':unittest.main()
