import unittest
from reference import Pivot, impulse,zigzag,target5,ingest,detect,outcome

class Rules(unittest.TestCase):
    def test_valid_impulse_bull_bear_translation_scale(self):
        for scale in [1,2,5,10,20]:
            for offset in [-1000,0,52000]:
                for direction in [-1,1]:
                    self.assertTrue(impulse([offset+direction*scale*v for v in [0,10,4,24,15,29]]))
    def test_wave2_origin_and_equality(self):
        for x in [-2,0,10,12]: self.assertFalse(impulse([0,10,x]))
    def test_wave3_must_exceed_one(self):
        for x in [8,10]: self.assertFalse(impulse([0,10,4,x]))
    def test_wave4_overlap_and_equality(self):
        for x in [5,10,24]: self.assertFalse(impulse([0,10,4,24,x]))
    def test_wave3_shortest_rejected(self):
        self.assertFalse(impulse([0,10,9,17,11,22]))
    def test_equal_lengths_not_shortest(self):
        self.assertTrue(impulse([0,10,9,19,11,21]))
    def test_truncation_not_supported(self):
        self.assertFalse(impulse([0,10,4,24,15,23]))
    def test_zigzag_origin_and_new_extreme(self):
        for sign in [-1,1]:
            self.assertTrue(zigzag([sign*v for v in [0,10,4,15]]))
            for invalid in [[0,10,-1],[0,10,0],[0,10,4,9],[0,10,4,10]]:
                self.assertFalse(zigzag([sign*v for v in invalid]))
    def test_fifth_target_cap(self):
        for sign in [-1,1]:
            p=[sign*v for v in [0,10,9,17,11]]
            a,b=target5(p)
            self.assertGreater((a-p[3])*sign,0)
            self.assertLessEqual(abs(b-p[4]),8)
    def test_invalid_input_size(self):
        for p in [[],[0],[0,1],[0,10,4,24,15,29,20]]: self.assertFalse(impulse(p))

class Timing(unittest.TestCase):
    def test_ties_keep_earlier_canonical_pivot(self):
        first=Pivot(1,10,1,3);stream=[first]
        ingest(stream,Pivot(2,10,1,4));self.assertEqual(stream,[first])
    def test_same_side_revision_does_not_mutate_frozen_reference(self):
        first=Pivot(1,10,1,3);stream=[first]
        ingest(stream,Pivot(2,12,1,4));self.assertEqual(first.price,10);self.assertEqual(stream[-1].price,12)
    def test_pivot_confirmation_delay(self):
        bars=[(v+1,v-1) for v in [5,7,12,7,4,8,13,9,3,7,11,8,5]]
        _,ev=detect(bars,2)
        self.assertGreater(len(ev),0)
        self.assertTrue(all(p.known-p.x==2 for p in ev))
    def test_prefix_replay_invariance(self):
        bars=[(v+1,v-1) for v in [5,7,12,7,4,8,13,9,3,7,11,8,5,8,16,9,2]]
        _,all_events=detect(bars,2)
        for cut in range(5,len(bars)):
            _,prefix=detect(bars[:cut],2)
            self.assertEqual(prefix,[p for p in all_events if p.known<cut])
    def test_outside_bar_ambiguous_pivot_skipped(self):
        _,ev=detect([(5,4),(6,3),(20,-10),(6,3),(5,4)],2)
        self.assertEqual(ev,[])
    def test_issue_bar_not_scored(self):
        self.assertEqual(outcome(5,25,110,90,1,[(5,120,80)]),('Open',None))
    def test_both_touched_is_ambiguous(self):
        self.assertEqual(outcome(5,25,110,90,1,[(6,111,89)]),('Ambiguous',6))
    def test_first_touch_not_later_best_outcome(self):
        self.assertEqual(outcome(5,25,110,90,1,[(6,105,89),(7,115,100)]),('Invalidation first',6))
    def test_short_symmetry(self):
        self.assertEqual(outcome(5,25,90,110,-1,[(6,109,89)]),('Target first',6))
    def test_expiry(self):
        self.assertEqual(outcome(5,25,110,90,1,[(25,105,95)]),('Expired',25))
    def test_boundary_hit_on_expiry_is_resolved(self):
        self.assertEqual(outcome(5,25,110,90,1,[(25,110,95)]),('Target first',25))

if __name__=='__main__': unittest.main(verbosity=2)
