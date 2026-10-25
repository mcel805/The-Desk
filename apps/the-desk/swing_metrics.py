"""Read-only full-run candle forecast scoring, independent of UI row limits."""
import json
import math

LABELS={'up','down','flat'}

def finite(v):
    return type(v) in (int,float) and math.isfinite(v)

def forecast_metrics(rows,observations=0,ended=False):
    counts=dict(unavailable_primary=0,pending_primary=0,unresolved_primary=0,invalid_primary=0)
    n=correct=baseline=0;brier=0
    for r in rows:
        if r['service']!='AVAILABLE':counts['unavailable_primary']+=1;continue
        if r['label'] is None:
            counts['unresolved_primary' if ended else 'pending_primary']+=1;continue
        if r['label']=='unknown':counts['unresolved_primary']+=1;continue
        try:
            f=json.loads(r['forecast']);bar=json.loads(r['last_bar']);p=f['probabilities'];tick=r['tick']
            valid=(isinstance(p,dict) and isinstance(bar,dict) and r['label'] in LABELS and f['choice'] in LABELS and set(p)==LABELS and
                   all(finite(v) and 0<=v<=1 for v in p.values()) and abs(sum(p.values())-1)<1e-6 and
                   finite(tick) and tick>0 and all(finite(bar[k]) for k in ('open','close')) and
                   finite(r['received_at']) and r['at']<=r['received_at']<=r['prediction_bar'])
            if not valid:raise ValueError('Unscorable forecast provenance')
        except (ValueError,TypeError,KeyError):counts['invalid_primary']+=1;continue
        n+=1;correct+=f['choice']==r['label']
        brier+=sum((v-int(k==r['label']))**2 for k,v in p.items())
        delta=bar['close']-bar['open']
        baseline+=('up' if delta>=tick-1e-9 else 'down' if delta<=-tick+1e-9 else 'flat')==r['label']
    return {'n':n,'correct':correct,'accuracy':correct/n if n else None,
            'baseline_correct':baseline,'baseline_accuracy':baseline/n if n else None,'brier':brier/n if n else None,
            'observation_count':observations,'primary_samples':len(rows),'intrabar_samples':max(0,observations-len(rows)),**counts,
            'scope':'Selected market, entire latest run; one recorded primary forecast per minute. '
                    'History table shows only the latest 300 snapshots. Serial dependence remains; these are candle forecasts, not trades or a trading win rate.'}
