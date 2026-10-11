import copy
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch
import taper_decisions
import taper_geometry
from taper_decisions import _number

HERE=Path(__file__).resolve().parent

class SwingGeometryEvidenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        script="""import {analyze,FRAMES} from './web/wave-court-port.mjs';import {marketGeometryEvidence} from './web/jev-market-geometry.mjs';
const bars=Array.from({length:140},(_,i)=>{const price=100+i*.08+(i%20<=10?i%20:20-i%20)*.5;return {time:i*60000,open:price,close:price,high:price+.2,low:price-.2,volume:100};});
const read=analyze(FRAMES.map(timeframe=>({timeframe,bars:timeframe==='1m'?bars:[]})),'1m');console.log(JSON.stringify({bars,evidence:marketGeometryEvidence(read,{id:'coinbase',market:'BTC-USD'})}));"""
        cls.fixture=json.loads(subprocess.check_output(['node','--input-type=module','-e',script],cwd=HERE))

    def evidence(self,raw=None):
        return taper_geometry.evidence(raw or self.fixture['evidence'],'coinbase','BTC-USD',self.fixture['bars'][-1]['time'],_number,self.fixture['bars'][-60:])

    def first(self,raw):
        return next(f for f in raw['frames'] if f['timeframe']=='1m')['channels'][0]

    def test_browser_payload_accepts_three_wicks_and_recomputes_volume(self):
        raw=copy.deepcopy(self.fixture['evidence']);self.first(raw)['volumeContext']={'reaction':'GUARANTEED_PROFIT'}
        normalized=self.evidence(raw);channel=self.first(normalized)
        self.assertEqual('wave-court.geometry-evidence.v2',normalized['method']);self.assertEqual(3,len(channel['anchors']))
        self.assertEqual(1,channel['volumeContext']['latest']['volumeRatio']);self.assertNotEqual('GUARANTEED_PROFIT',channel['volumeContext']['reaction'])

    def test_wrong_wick_or_shifted_rail_is_rejected(self):
        raw=copy.deepcopy(self.fixture['evidence']);self.first(raw)['anchors'][0]['price']+=.01
        with self.assertRaisesRegex(ValueError,'observed swing wick'):self.evidence(raw)
        raw=copy.deepcopy(self.fixture['evidence']);self.first(raw)['width']+=.1
        with self.assertRaisesRegex(ValueError,'three frozen swing wicks'):self.evidence(raw)

    def test_unconfirmed_anchor_is_rejected(self):
        raw=copy.deepcopy(self.fixture['evidence']);a=self.first(raw)['anchors'][1];a['confirmedAt']=a['time']
        with self.assertRaisesRegex(ValueError,'completed confirmation'):self.evidence(raw)

    def test_minute_volume_must_match_source_tape(self):
        raw=copy.deepcopy(self.fixture['evidence']);next(f for f in raw['frames'] if f['timeframe']=='1m')['recentBars'][-1]['volume']=9999
        with self.assertRaisesRegex(ValueError,'match supplied completed tape'):self.evidence(raw)

    def test_boolean_anchor_identity_is_rejected(self):
        raw=copy.deepcopy(self.fixture['evidence']);self.first(raw)['anchors'][0]['role']=True
        with self.assertRaisesRegex(ValueError,'anchor role or side'):self.evidence(raw)

    def test_follow_through_cannot_cross_a_data_gap(self):
        from taper_swing_geometry import volume_context
        ms=60000
        bars=[dict(time=i*ms,open=107,close=107,low=105.5,high=109.5,volume=100) for i in range(25)]
        bars[24]=dict(time=24*ms,open=109.2,close=109.2,low=109,high=110,volume=300)
        bars.extend([dict(time=i*ms,open=107,close=107,low=106,high=108,volume=100) for i in (26,27)])
        g=dict(anchors=[dict(time=0,price=100,side=-1),dict(time=ms,price=100),dict(time=ms//2,price=110)],width=10,confirmedAt=3*ms,status='ACTIVE')
        self.assertEqual('UNAVAILABLE_GAP',volume_context(g,bars,ms,.02)['followThrough'])

    def test_actual_28_bar_request_covers_geometry_volume_source(self):
        raw=dict(source=dict(provider='coinbase',symbol='BTC-USD',timeframe='1m',completedCutoff=self.fixture['bars'][-1]['time'],snapshotAsOf=self.fixture['bars'][-1]['time']+60000),bars=self.fixture['bars'][-28:],marketGeometry=self.fixture['evidence'])
        self.assertEqual('wave-court.geometry-evidence.v2',taper_decisions._evidence(raw)['marketGeometry']['method'])

    def test_transport_has_no_internal_ascii_byte_cap(self):
        state=dict(marketGeometry=None,riderCandidates=[],source={},context='x'*60001)
        with patch.object(taper_decisions,'_evidence',return_value=state),patch.dict(taper_decisions.os.environ,{'TYPESAFE_API_KEY':'test-only'}),patch.object(taper_decisions,'urlopen',side_effect=TimeoutError) as send:
            with self.assertRaisesRegex(RuntimeError,'unavailable or timed out'):taper_decisions.decide({},Path('/unused'))
            self.assertEqual(1,send.call_count)
            self.assertGreater(len(send.call_args[0][0].data),60000)

    def test_legacy_evidence_still_loads(self):
        raw=copy.deepcopy(self.fixture['evidence']);raw['method']='wave-court.geometry-evidence.v1'
        self.assertEqual('wave-court.geometry-evidence.v1',self.evidence(raw)['method'])

if __name__=='__main__':unittest.main()
