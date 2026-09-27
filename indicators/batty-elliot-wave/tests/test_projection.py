"""Numerical oracle checks prompted by the full-BTC negative linear-target regression."""
import math
import unittest


def projection(anchor,origin,end,ratio,mode):
    if mode=='Log':
        if min(anchor,origin,end)<=0:return None
        return anchor*(end/origin)**ratio
    return anchor+(end-origin)*ratio


def fifth(p,mode):
    direction=1 if p[1]>p[0] else -1
    a=projection(p[4],p[0],p[1],1,mode)
    b=projection(p[4],p[0],p[1],1.618,mode)
    if a is None or b is None:return None
    w1=abs(p[1]-p[0]);w3=abs(p[3]-p[2])
    if w3<w1:
        cap=p[4]+direction*w3
        a=min(a,cap) if direction>0 else max(a,cap)
        b=min(b,cap) if direction>0 else max(b,cap)
    if (b-p[3])*direction<=0:return None
    floor=p[3]+direction*.01
    a=max(a,floor) if direction>0 else min(a,floor)
    return a,b

class Projection(unittest.TestCase):
    def test_btc_large_decline_log_target_remains_positive(self):
        self.assertLess(projection(82283,126296,57717.55,1.618,'Linear'),0)
        self.assertAlmostEqual(projection(82283,126296,57717.55,1.618,'Log'),23177.03698241807,places=6)
    def test_log_nonpositive_anchors_unavailable(self):
        for args in [(0,1,2),(-1,1,2),(1,0,2),(1,2,-1)]:
            self.assertIsNone(projection(*args,1.618,'Log'))
    def test_linear_can_handle_negative_commodity_prices(self):
        self.assertEqual(projection(-5,-10,10,1,'Linear'),15)
    def test_log_inverse_price_symmetry(self):
        p=projection(150,100,200,.618,'Log')
        inv=projection(1/150,1/100,1/200,.618,'Log')
        self.assertAlmostEqual(p*inv,1)
    def test_fifth_cap_uses_hard_price_lengths_even_with_log_fibs(self):
        a,b=fifth([100,110,109,117,111],'Log')
        self.assertLessEqual(a-111,8);self.assertLessEqual(b-111,8)
        self.assertGreater(a,117);self.assertGreater(b,117)
    def test_impossible_fifth_has_no_target(self):
        self.assertIsNone(fifth([100,110,109,117,108],'Log'))
    def test_retracement_between_anchors(self):
        for mode in ['Linear','Log']:
            for ratio in [.236,.382,.618]:
                p=projection(200,200,100,ratio,mode)
                self.assertGreater(p,100);self.assertLess(p,200)
    def test_closed_btc_local_A_formula(self):
        self.assertAlmostEqual(projection(82283,82283,62209.81,.236,'Log'),77027.823082141,places=6)

    def test_reached_target_is_not_recycled_after_rebound(self):
        from reference import outcome
        # Once reached, a later rebound does not undo the target-first observation.
        self.assertEqual(outcome(0,20,90,110,-1,[(1,103,89),(2,102,95)]),('Target first',1))
        source=(__import__('pathlib').Path(__file__).parents[1]/'Batty-Elliot-Wave.pine').read_text()
        alive=source[source.index('f_alive(Candidate c)'):source.index('// Active scenarios')]
        self.assertIn('if reached2',alive)
        self.assertIn('else if reached1',alive)
        self.assertIn('c.t1 := c.t2',alive)
        self.assertIn('T2-continuation',alive)

if __name__=='__main__':unittest.main(verbosity=2)
