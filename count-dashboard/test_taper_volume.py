import copy
import json
import math
from pathlib import Path
import subprocess
import unittest
import taper_volume as tv

HERE = Path(__file__).resolve().parent
JS = HERE / 'taper-volume.mjs' if (HERE / 'taper-volume.mjs').exists() else HERE / 'web/taper-volume.mjs'

def fixture(n=80):
    return [{'time':i*60000,'open':100+(i%7)*.2,'high':102+(i%9)*.3,'low':98-(i%5)*.1,'close':100+(i%8)*.25,'volume':100+(i%11)*23} for i in range(n)]

class VolumeTests(unittest.TestCase):
    def test_javascript_python_raw_parity_and_causality(self):
        bars=fixture();bars[55]['volume']=2500;bars[63]['volume']=None;bars[68]['high']=bars[68]['low']=bars[68]['open']=bars[68]['close']=100
        script="import {analyzeVolume} from "+json.dumps(JS.as_uri())+";import fs from 'node:fs';const a=JSON.parse(fs.readFileSync(0,'utf8'));console.log(JSON.stringify(analyzeVolume(a,'1m',a.at(-1).time+60000)));"
        js=json.loads(subprocess.check_output(['node','--input-type=module','-e',script],input=json.dumps(bars).encode(),cwd=HERE))
        py=tv.calculate(bars)
        for a,b in zip(py['rows'],js['rows']):
            for key in a:
                if key not in b: continue
                if isinstance(a[key],float):self.assertAlmostEqual(a[key],b[key],places=8,msg=key)
                else:self.assertEqual(a[key],b[key],key)
        for key in ['status','extremeLines','followThrough','divergences','sessionCoverage']:self.assertEqual(py[key],js[key],key)
        for n in (20,40,56,65):self.assertEqual(tv.calculate(bars[:n])['rows'],py['rows'][:n])

    def test_same_slot_excludes_current_and_session_ratio(self):
        bars=[]
        for day in range(16):
            for minute in range(22):bars.append({'time':day*tv.DAY+minute*60000,'open':100,'high':101,'low':99,'close':100.5,'volume':100 if day<15 else 300})
        r=tv.calculate(bars)
        self.assertEqual(r['latest']['referenceCount'],15)
        self.assertEqual(r['latest']['rvol'],300)
        self.assertEqual(r['sessionRvol'],300)
        self.assertTrue(r['sessionCoverage']['fullSessionStartCovered'])
        self.assertIsNone(tv.calculate(bars[:22])['sessionRvol'])

    def test_missing_zero_and_gap_are_distinct(self):
        bars=fixture(30);bars[-1]['volume']=None
        self.assertEqual(tv.calculate(bars)['status'],'unavailable')
        self.assertIsNone(tv.calculate(bars)['latest']['deltaProxy'])
        bars[-1]['volume']=0;self.assertEqual(tv.calculate(bars)['status'],'available')
        self.assertFalse(tv.calculate(bars)['latest']['climaxSignal'])
        bars[-1]['time']+=60000;self.assertEqual(tv.calculate(bars)['status'],'gapped')
        zero=[{**b,'volume':0} for b in fixture(30)]
        self.assertFalse(any(b['climaxSignal'] or b['churnSignal'] for b in tv.calculate(zero)['rows']))

    def test_source_and_exact_history_binding(self):
        bars=fixture();src={'provider':'coinbase','symbol':'BTC-USD','completedCutoff':bars[-1]['time']};raw={'method':tv.METHOD,'source':src,'bars':bars}
        result=tv.evidence(raw,src,bars[-60:]);self.assertEqual(len(result['rows']),8);self.assertEqual(result['historyCount'],80)
        for field,value in [('volume',-1),('volume',True),('volume',float('nan')),('close',500)]:
            bad=copy.deepcopy(raw);bad['bars'][-1][field]=value
            with self.assertRaises(ValueError):tv.evidence(bad,src,bars[-60:])
        bad=copy.deepcopy(raw);bad['source']['symbol']='ETH-USD'
        with self.assertRaises(ValueError):tv.evidence(bad,src,bars[-60:])
        bad=copy.deepcopy(raw);bad['bars'][-1]['volume']+=1
        with self.assertRaises(ValueError):tv.evidence(bad,src,bars[-60:])

    def test_followthrough_waits_and_does_not_invent_reversal(self):
        bars=fixture(30);bars[-3]['volume']=10000
        for b in bars[-2:]:b.update(open=100,high=101,low=99,close=100)
        before=tv.calculate(bars[:-2]);event=before['followThrough'][-1];self.assertEqual(event['state'],'PENDING');self.assertIsNone(event['knownAt'])
        event=next(e for e in tv.calculate(bars)['followThrough'] if e['anchorTime']==bars[-3]['time']);self.assertEqual(event['state'],'UNRESOLVED');self.assertEqual(event['knownAt'],bars[-1]['time']+60000)

    def test_question_contract(self):
        qs=tv.questions();self.assertEqual(len(qs),11)
        self.assertTrue(all(q['type']=='choice' and 'UNAVAILABLE' in q['criteria'] for q in qs.values()))
        self.assertTrue(all('volumeEvidence' in q['instructions'] for q in qs.values()))

    def test_integrated_recompute_ignores_forged_browser_metrics(self):
        try: import taper_decisions as td
        except ImportError: self.skipTest('Run in count-dashboard for integration validation')
        bars=fixture(80);src={'provider':'coinbase','symbol':'BTC-USD','timeframe':'1m','completedCutoff':bars[-1]['time'],'snapshotAsOf':bars[-1]['time']+60000}
        payload={'source':src,'bars':bars[-24:],'volumeHistory':{'method':tv.METHOD,'source':src,'bars':bars},'volumeEvidence':{'status':'available','latest':{'rvol':999999}}}
        evidence=td._evidence(payload)
        self.assertEqual(evidence['volumeEvidence']['historyCount'],80)
        self.assertIsNone(evidence['volumeEvidence']['latest']['rvol'])
        self.assertEqual(len(evidence['volumeEvidence']['rows']),8)
        bad=copy.deepcopy(payload);bad['volumeHistory']=copy.deepcopy(bad['volumeHistory']);bad['volumeHistory']['bars'][-1]['volume']+=1
        with self.assertRaises(ValueError):td._evidence(bad)

    def test_full_typed_pack_rejects_invalid_distributions(self):
        try: import taper_decisions as td
        except ImportError: self.skipTest('Run in count-dashboard for integration validation')
        qs=td.decision_questions(True,True);self.assertEqual(len(qs),28)
        answers={}
        for name,q in qs.items():
            keys=list(q['criteria']) if q['type']=='choice' else [str(i) for i in range(len(q['criteria']))]
            a={'type':q['type'],'confidence':1,'probabilities':{k:int(i==0) for i,k in enumerate(keys)}}
            if q['type']=='choice':a['choice']=keys[0]
            else:a.update(score=0,legend={str(i):v for i,v in enumerate(q['criteria'])})
            answers[name]=a
        self.assertEqual(len(td.normalize_answers(answers,qs)),28)
        bad=copy.deepcopy(answers);bad['volume_supplement']['probabilities']['NEUTRAL']=.2
        with self.assertRaises(ValueError):td.normalize_answers(bad,qs)

if __name__=='__main__':unittest.main()
