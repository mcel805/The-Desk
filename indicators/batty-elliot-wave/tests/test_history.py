import random
import unittest
from pathlib import Path
from history_reference import build,cover,exhaustive,pivots,reduce_pivots

class History(unittest.TestCase):
    def test_full_history_spans_400_legs_not_last_swing(self):
        prices=[100.0]
        for _ in range(50):
            origin=prices[-1]
            prices.extend(origin+v for v in [10,4,24,15,29,19,25,10])
        layers,nodes=build(pivots(prices)); score,path=cover(layers,nodes,0)
        self.assertEqual(path[0][0],0);self.assertEqual(path[-1][1],400)
        self.assertEqual(sum(b-a for a,b,n in path if n is not None),400)
        self.assertTrue(all(path[i][1]==path[i+1][0] for i in range(len(path)-1)))
        self.assertGreater(len(path),90)
    def test_no_forced_impulse(self):
        layers,nodes=build(pivots([0,10,-2,9,-4,8,-6]))
        score,path=cover(layers,nodes,0)
        self.assertTrue(any(idx is None for a,b,idx in path))
        self.assertFalse(any(n.family=='Impulse' and n.hi-n.lo==5 for n in nodes))
    def test_beam_best_against_exhaustive_small_fixture(self):
        for values in [[0,10,4,24,15,29,19,25,10], [0,10,4,24,15,29], [0,10,-4,20,1,25,-2]]:
            layers,nodes=build(pivots(values))
            self.assertAlmostEqual(cover(layers,nodes,0)[0],exhaustive(layers,nodes,0)[0][0])
    def test_alternates_are_distinct_connected_paths(self):
        layers,nodes=build(pivots([0,10,4,24,15,29,19,25,10]))
        paths=[cover(layers,nodes,0,r)[1] for r in range(4)]
        self.assertEqual(len(set(paths)),4)
        for path in paths:
            self.assertEqual(path[0][0],0);self.assertEqual(path[-1][1],8)
    def test_reduction_subset_boundaries_and_alternation(self):
        rng=random.Random(822)
        for _ in range(100):
            prices=[10000]
            for i in range(200):prices.append(prices[-1]+(1 if i%2==0 else -1)*rng.randint(1,300))
            src=pivots(prices);out=reduce_pivots(src)
            self.assertEqual(out[0],src[0]);self.assertEqual(out[-1],src[-1])
            self.assertTrue(all(q in src for q in out))
            self.assertTrue(all(a.x<b.x and a.side!=b.side for a,b in zip(out,out[1:])))
    def test_children_share_exact_endpoints_and_expected_family(self):
        rng=random.Random(93);prices=[10000]
        for i in range(600):prices.append(prices[-1]+(1 if i%2==0 else -1)*rng.randint(2,200))
        layers,nodes=build(pivots(prices))
        checked=0
        for node in nodes:
            parent=layers[node.degree][0][node.lo:node.hi+1]
            for leg,child_id in enumerate(node.children):
                if child_id is None: continue
                checked+=1;child=nodes[child_id];cp=layers[child.degree][0]
                self.assertLess(child.degree,node.degree)
                self.assertEqual(cp[child.lo].x,parent[leg].x)
                self.assertEqual(cp[child.hi].x,parent[leg+1].x)
                self.assertEqual(child.family,'Impulse' if leg%2==0 else 'Zigzag')
        self.assertGreater(checked,0)
    def test_mirrored_market_same_segmentation(self):
        values=[100,110,104,124,115,129,119,125,110]
        a,an=build(pivots(values));b,bn=build(pivots([300-x for x in values]))
        self.assertEqual(cover(a,an,0),cover(b,bn,0))
    def test_reload_deterministic(self):
        values=[100,110,104,124,115,129,119,125,110]
        a,an=build(pivots(values));b,bn=build(pivots(values))
        self.assertEqual(a,b);self.assertEqual(an,bn)
    def test_viewport_not_an_engine_dependency(self):
        source=(Path(__file__).parents[1]/'Batty-Elliot-Wave.pine').read_text()
        engine=source[source.index('f_append('):source.index('f_visible(')]
        self.assertNotIn('chart.left_visible',engine);self.assertNotIn('chart.right_visible',engine)
        self.assertNotIn('displayStart',engine);self.assertNotIn('visibleLayers',engine)
        self.assertIn('xloc=xloc.bar_time',source)
    def test_no_performance_from_retrospective_counts(self):
        source=(Path(__file__).parents[1]/'Batty-Elliot-Wave.pine').read_text()
        self.assertIn('if barstate.isrealtime and barstate.isconfirmed and array.size(scenarios) > 0',source)

if __name__=='__main__':unittest.main(verbosity=2)
