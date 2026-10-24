"""Server-side TypeSafe adapter; narrow typed judgments, no trade authority."""
import json
import math
import os
from urllib.request import Request, urlopen

MODEL='jev-1.14.0'
PROMPT_VERSION='swing-observer.2'
QUESTIONS={
    'directional_lean':{'type':'choice','instructions':'Classify the currently supported directional thesis from this timestamped swing snapshot. This is a contextual LONG / SHORT / NEUTRAL lean, not a trade command and not the next candle direction. Use only recognized structure and observed price action; incomplete evidence, conflicting signals, or price between useful locations can justify neutral.','criteria':{'long':'The observed swing and local response coherently support an upward thesis over a downward one.','short':'The observed swing and local response coherently support a downward thesis over an upward one.','neutral':'Neither direction is sufficiently distinguished: evidence is incomplete, conflicting, or lacks a useful response at recognized structure.'}},
    'next_bar':{'type':'choice','instructions':'Using only the timestamped swing state and price evidence, estimate the direction of the NEXT full 1-minute candle, whose start is prediction_bar. Compare its closing price with its opening price. This is a forecast, not a statement about the forming candle. No outcome or future data is provided.','criteria':{'up':'Next full candle closes at least one tick above its open.','down':'Next full candle closes at least one tick below its open.','flat':'Next full candle closes less than one tick from its open.'}},
    'pattern':{'type':'choice','instructions':'Classify the current observed price behavior from the supplied completed candles, candidates, known pivots and explicitly forming candle. A forming-bar touch is not a confirmed sweep or entry. Select no_match when evidence does not distinguish the alternatives.','criteria':{'reversal':'A recognized liquidity reference was penetrated and reclaimed, with a directional rejection suggesting reversal.','breakout':'Price extends beyond recognized structure and shows acceptance rather than an immediate reclaim.','retracement':'Price corrects inside an existing recognized swing without confirmed reversal or breakout.','no_match':'Ambiguous, insufficient or conflicting evidence.'}},
    'long_fit':{'type':'noul','instructions':'Does the supplied current pattern support a developing LONG reversal thesis? Judge contextual coherence, not permission to trade or expected profit. A falling candle alone is not a long signal.','criteria':{'true':'Recognized downside location, failed selling and an upward reclaim make the long reversal thesis coherent.','false':'Evidence is absent, conflicting or suggests continued selling.'}},
    'short_fit':{'type':'noul','instructions':'Does the supplied current pattern support a developing SHORT reversal thesis? Judge contextual coherence, not permission to trade or expected profit. A rising candle alone is not a short signal.','criteria':{'true':'Recognized upside location, failed buying and a downward reclaim make the short reversal thesis coherent.','false':'Evidence is absent, conflicting or suggests continued buying.'}}
}

def probability(v):
    return type(v) in (int,float) and math.isfinite(v) and 0<=v<=1

def validate_response(value):
    if not isinstance(value,dict) or value.get('model')!=MODEL:raise ValueError('Unexpected model')
    answers=value.get('answers',{})
    for key,q in QUESTIONS.items():
        a=answers.get(key,{})
        if a.get('type')!=q['type']:raise ValueError('Unexpected answer type')
        if q['type']=='noul':
            if not probability(a.get('noul')):raise ValueError('Invalid probability')
        else:
            dist=a.get('probabilities',{})
            if set(dist)!=set(q['criteria']) or not all(probability(v) for v in dist.values()) or abs(sum(dist.values())-1)>.001:raise ValueError('Invalid distribution')
            if a.get('choice') not in dist or dist[a['choice']]<max(dist.values())-1e-6 or not probability(a.get('confidence')):raise ValueError('Invalid choice')
    return {'model':value['model'],'answers':answers,'usage':value.get('usage',{})}

class Jev:
    @property
    def configured(self):return bool(os.environ.get('TYPESAFE_API_KEY'))
    def judge(self,state):
        if not self.configured:raise ValueError('Jev key unavailable')
        request=Request('https://api.typesafe.ai/v1/systemone',data=json.dumps({'model':MODEL,'state':state,'questions':QUESTIONS},allow_nan=False).encode(),headers={'Content-Type':'application/json','Authorization':'Bearer '+os.environ['TYPESAFE_API_KEY']})
        with urlopen(request,timeout=2) as response:value=json.load(response)
        return validate_response(value)
