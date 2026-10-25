import unittest
import json
from swing_metrics import forecast_metrics

def sample(**kw):
    return dict(at=1000,prediction_bar=60000,service='AVAILABLE',received_at=1010,label='up',tick=1,
                forecast=json.dumps({'choice':'up','probabilities':{'up':.6,'down':.3,'flat':.1}}),
                last_bar=json.dumps({'open':100,'close':99}),**kw)

class ForecastMetricsTests(unittest.TestCase):
    def test_same_primary_rows_score_forecast_and_baseline_without_intrabar_inflation(self):
        r=forecast_metrics([sample()],observations=4)
        self.assertEqual(r['n'],1);self.assertEqual(r['accuracy'],1);self.assertEqual(r['baseline_accuracy'],0)
        self.assertEqual(r['intrabar_samples'],3);self.assertAlmostEqual(r['brier'],.26)

    def test_excluded_rows_reconcile_with_primary_total_and_never_become_zero_scores(self):
        rows=[sample(),{**sample(),'service':'UNAVAILABLE'},{**sample(),'label':None},
              {**sample(),'label':'unknown'},{**sample(),'received_at':60001}]
        r=forecast_metrics(rows,observations=5,ended=True)
        self.assertEqual(r['primary_samples'],5);self.assertEqual(r['n'],1)
        self.assertEqual(r['unresolved_primary'],2);self.assertEqual(r['unavailable_primary'],1)
        self.assertEqual(r['invalid_primary'],1);self.assertEqual(r['pending_primary'],0)
        self.assertIsNone(forecast_metrics([],0)['accuracy'])

    def test_malformed_forecasts_and_invalid_baseline_prices_are_not_scored(self):
        rows=[{**sample(),'forecast':'{}'},{**sample(),'forecast':'invalid'},
              {**sample(),'last_bar':'null'},{**sample(),'tick':0},
              {**sample(),'forecast':json.dumps({'choice':'up','probabilities':['up','down','flat']})}]
        r=forecast_metrics(rows,5);self.assertEqual(r['invalid_primary'],5);self.assertEqual(r['n'],0)

if __name__=='__main__':unittest.main()
