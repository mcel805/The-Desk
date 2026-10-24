"""Role isolation, evidence validation and persistence; no model calls."""
from copy import deepcopy
from pathlib import Path
import json
import tempfile
import time
import unittest
from unittest.mock import patch
from swing_advisors import SwingAdvisors, validate_advice, instructions
from swing_research import SwingResearch
from swing_liquidity import identity
from test_swing_tracker import FakeGateway, FakeJudge
from test_swing_liquidity import study, observe, BASE, SYMBOL


class FakeSession:
    calls=[]
    def __init__(self,cwd,**kwargs):
        self.options=kwargs;self.closed=False
        type(self).calls.append(self)
    def ensure_thread(self,source):self.source=source
    def run(self,prompt,schema,**kwargs):
        packet=json.loads(prompt.split('PACKET ',1)[1]);role=self.options['service_name'].split('-')[-1]
        return {'role':role,'packet_hash':packet['hash'],'stance':'wait','playbook':'BOTH',
                'summary':'SYNTHETIC TEST · '+role+' separate review. No market/model claim.',
                'evidence_ids':[next(iter(packet['evidence_catalog']))],
                'missing_evidence':['Qualified Spider block/trap evidence is not supplied.'],
                'next_event':'Wait for the declared entry family.','invalidation':'The frozen structural stop.',
                'limitations':['Synthetic response; not an actual model review.']},[]
    def close(self):self.closed=True


class AdvisorTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.research=SwingResearch(FakeGateway(BASE+10000),Path(self.tmp.name),FakeJudge())
        self.study=study();observe(self.study,0,l=99)
        with self.research.db() as db:
            db.execute('INSERT INTO study_state VALUES(?,?,?,?)',('test-run',SYMBOL,BASE+70000,json.dumps(self.study.snapshot())))
        self.research.last[SYMBOL]={'run':'test-run','status':'PAUSED','observed_at':BASE+70000,'snapshot':{'display_bars':[self.study.last_bar]},'jev':{'status':'DISABLED'}}
        FakeSession.calls=[];self.advisors=SwingAdvisors(self.research,FakeSession)
    def tearDown(self):self.advisors.close();self.research.close();self.tmp.cleanup()
    def wait(self):
        for _ in range(200):
            if not self.advisors.busy:return
            time.sleep(.005)
        self.fail('Fixture advisor failed to finish')
    def test_both_roles_share_packet_but_have_distinct_instruction_sources(self):
        result=self.advisors.request({'symbol':SYMBOL,'role':'both'});self.wait()
        rows=self.advisors.status(SYMBOL)['reviews']
        self.assertEqual(len(rows),2);self.assertTrue(all(r['status']=='COMPLETE' for r in rows))
        self.assertEqual({r['packet_hash'] for r in rows},{result['packet_hash']})
        self.assertEqual({r['role'] for r in rows},{'rider','spider'})
        self.assertNotEqual(FakeSession.calls[0].source,FakeSession.calls[1].source)
        self.assertTrue(all(s.options['web_search']=='disabled' and s.closed for s in FakeSession.calls))
        self.assertTrue(all(r['historical'] for r in rows))
    def test_review_cannot_change_collector_settings_or_its_saved_plan(self):
        before=self.research.study_report(SYMBOL)
        settings=deepcopy(self.research.configs)
        self.advisors.request({'symbol':SYMBOL,'role':'rider'});self.wait()
        self.assertEqual(before,self.research.study_report(SYMBOL));self.assertEqual(settings,self.research.configs)
        saved=self.advisors.export(SYMBOL)['reviews'][0]
        self.assertEqual(saved['packet']['hash'],identity({k:v for k,v in saved['packet'].items() if k!='hash'}))
        self.assertIn('STRATEGY SOURCE SNAPSHOT',saved['instructions'])
    def test_unknown_evidence_wrong_role_or_changed_packet_fails_validation(self):
        p=self.advisors.packet(SYMBOL)
        session=FakeSession(Path('.'),service_name='the-desk-swing-rider')
        good,_=session.run('PACKET '+json.dumps(p),{})
        for change in ({'role':'spider'},{'packet_hash':'later'},{'evidence_ids':['invented-price']},{'stance':'supports','evidence_ids':[]}):
            with self.assertRaises(ValueError):validate_advice({**good,**change},'rider',p)
    def test_manual_request_and_existing_study_are_required(self):
        for payload in ({'symbol':SYMBOL,'role':'execution'}, {'symbol':SYMBOL,'role':'rider','account':'x'}, {'symbol':'coinbase:BTC-USD','role':'both'}):
            with self.assertRaises(ValueError):self.advisors.request(payload)
        self.assertFalse(FakeSession.calls)
    def test_interrupted_jobs_are_not_resumed_after_restart(self):
        self.advisors.request({'symbol':SYMBOL,'role':'rider'});self.wait()
        with self.research.db() as db:
            row=db.execute('SELECT id,state FROM swing_advisories LIMIT 1').fetchone()
            data=json.loads(row['state']);data['status']='RUNNING'
            db.execute('UPDATE swing_advisories SET state=? WHERE id=?',(json.dumps(data),row['id']))
        restarted=SwingAdvisors(self.research,FakeSession)
        self.assertEqual(restarted.status(SYMBOL)['reviews'][0]['status'],'INTERRUPTED')
        self.assertFalse(restarted.busy);restarted.close()
    def test_sources_preserve_different_entry_families_and_no_automatic_consensus(self):
        self.assertIn('house ABC',instructions('rider'))
        self.assertIn('secondary-pool run',instructions('spider'))
        self.assertIn('independent statistical',instructions('spider'))


if __name__=='__main__':unittest.main()
