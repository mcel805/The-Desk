"""Server-side TypeSafe adapter; narrow typed judgments, no trade authority."""
import json
import math
import os
import threading
import time
import random
from copy import deepcopy
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from jev_costs import safe_usage
from jev_keychain import MacKeychain, KeychainError

MODEL='jev-1.14.0'
PROMPT_VERSION='swing-observer.7-house-abc.1'
QUESTIONS={
    'directional_lean':{'type':'choice','instructions':'Classify the currently supported directional thesis from this timestamped swing snapshot. This is a contextual LONG / SHORT / NEUTRAL lean, not a trade command and not the next candle direction. Use only recognized structure and observed price action; incomplete evidence, conflicting signals, or price between useful locations can justify neutral.','criteria':{'long':'The observed swing and local response coherently support an upward thesis over a downward one.','short':'The observed swing and local response coherently support a downward thesis over an upward one.','neutral':'Neither direction is sufficiently distinguished: evidence is incomplete, conflicting, or lacks a useful response at recognized structure.'}},
    'next_bar':{'type':'choice','instructions':'Using only the timestamped swing state and price evidence, estimate the direction of the NEXT full 1-minute candle, whose start is prediction_bar. Compare its closing price with its opening price. This is a forecast, not a statement about the forming candle. No outcome or future data is provided.','criteria':{'up':'Next full candle closes at least one tick above its open.','down':'Next full candle closes at least one tick below its open.','flat':'Next full candle closes less than one tick from its open.'}},
    'pattern':{'type':'choice','instructions':'Classify the current observed price behavior from the supplied completed candles, candidates, known pivots and explicitly forming candle. A forming-bar touch is not a confirmed sweep or entry. Select no_match when evidence does not distinguish the alternatives.','criteria':{'reversal':'A recognized liquidity reference was penetrated and reclaimed, with a directional rejection suggesting reversal.','breakout':'Price extends beyond recognized structure and shows acceptance rather than an immediate reclaim.','retracement':'Price corrects inside an existing recognized swing without confirmed reversal or breakout.','no_match':'Ambiguous, insufficient or conflicting evidence.'}},
    'long_fit':{'type':'noul','instructions':'Does the supplied current pattern support a developing LONG reversal thesis? Judge contextual coherence, not permission to trade or expected profit. A falling candle alone is not a long signal.','criteria':{'true':'Recognized downside location, failed selling and an upward reclaim make the long reversal thesis coherent.','false':'Evidence is absent, conflicting or suggests continued selling.'}},
    'short_fit':{'type':'noul','instructions':'Does the supplied current pattern support a developing SHORT reversal thesis? Judge contextual coherence, not permission to trade or expected profit. A rising candle alone is not a short signal.','criteria':{'true':'Recognized upside location, failed buying and a downward reclaim make the short reversal thesis coherent.','false':'Evidence is absent, conflicting or suggests continued buying.'}}
}

# The original next-candle diagnostic is retained. These questions describe
# different dimensions and are never merged into an invented win probability.
QUESTIONS.update({
    'delivery_state': {'type':'choice', 'instructions':'Using liquidity_study.metrics and completed bars, classify the observed delivery. Compare equal-duration windows and retain signed direction. A slowdown does not prove reversal. If measured state is unavailable choose insufficient.', 'criteria':{
        'accelerating':'Same-direction net progress per minute is increasing.',
        'steady':'Directional progress is broadly steady.',
        'slowing':'Same-direction progress is weakening or stalled without a confirmed opposite swing.',
        'direction_changed':'Recent signed progress reversed relative to the preceding window.',
        'insufficient':'Missing, mixed or insufficient completed-bar measurement evidence.'}},
    'liquidity_response': {'type':'choice', 'instructions':'Classify the response at an actually contacted reference in liquidity_study.campaigns. Use the campaign reference, contact cutoff and subsequent completed bars. A forming candle is not a completed reclaim. Do not invent resting orders or a Spider liquidity block.', 'criteria':{
        'rejection':'Completed penetration/reclaim and departure support rejection of the contacted reference.',
        'acceptance':'Completed price action holds or extends beyond the contacted reference, favoring acceptance.',
        'unresolved':'A known reference was contacted but rejection versus acceptance remains ambiguous.',
        'no_location':'No eligible contacted reference is supplied.'}},
    'parent_alignment': {'type':'choice', 'instructions':'Compare the local tracker trend with liquidity_study.context.parent_direction and the separately declared manual_bias. Preserve timeframe conflicts. This classification cannot grant side permission.', 'criteria':{
        'aligned':'Available parent context and local directional structure agree without an opposing manual bias.',
        'conflict':'Observed local direction opposes the parent or declared manual bias.',
        'unresolved':'Parent history, directional structure or agreement is insufficient.'}},
    'long_continuation_fit': {'type':'noul', 'instructions':'Does the supplied DRAW_CONTINUATION long campaign coherently support participation toward its frozen upper HTF objective? Require an available upward parent, permitted side, corrective local pullback and observed continuation evidence. Judge context, not expected profit or trade permission. Without such a supplied campaign answer false.', 'criteria':{'true':'The supplied long continuation campaign has coherent parent, local correction/response and an unconsumed objective.', 'false':'No applicable campaign, missing parent/location, conflict, consumed objective or failed structure.'}},
    'short_continuation_fit': {'type':'noul', 'instructions':'Does the supplied DRAW_CONTINUATION short campaign coherently support participation toward its frozen lower HTF objective? Require an available downward parent, permitted side, corrective local pullback and observed continuation evidence. Judge context, not expected profit or trade permission. Without such a supplied campaign answer false.', 'criteria':{'true':'The supplied short continuation campaign has coherent parent, local correction/response and an unconsumed objective.', 'false':'No applicable campaign, missing parent/location, conflict, consumed objective or failed structure.'}},
})
for key, side in (('long_fit','LONG'), ('short_fit','SHORT')):
    QUESTIONS[key]['instructions'] += (' When liquidity_study is supplied, evaluate only its active HTF_REVERSAL '+side+' campaigns, using their frozen location/objective, completed rejection evidence and separate manual permission. No applicable campaign means false. A local reversal label alone is insufficient. This contextual label does not approve a specific plan.')
QUESTIONS['directional_lean']['instructions'] += ' Keep parent direction, manual bias, provisional draw and local swing state separate using liquidity_study when available. Neutral is appropriate for unresolved parent/local conflict.'

# One additional independent judgment in the same request; no new sampling slots.
QUESTIONS['volume_pattern']={'type':'choice',
    'instructions':'Classify the strongest current participation pattern from `market_synth`, its completed-bar history and candidate legs, in the context of known swing structure. A/B use fixed Desk defaults, not chart-edited settings or proprietary Cipher formulas. A ribbon is lagging price context; B flow_proxy, fast wave, RSI and dots are price-derived, not traded volume. Use actual raw/relative volume, CMF/MFI proxies and price response together. High volume alone is not reversal, absorption, manipulation, buying delta or selling delta. Missing/zero baselines, warmup and conflicting observations justify no_match. Ignore partial forming-bar volume for confirmation. This is research classification, not a trade command.',
    'criteria':{
        'up_swing_exhaustion':'An upward swing has diminishing participation or high-volume upper rejection, with weakening B momentum and a response at recognized upside structure; reversal remains conditional.',
        'down_swing_exhaustion':'A downward swing has diminishing participation or high-volume lower rejection, with improving B momentum and a response at recognized downside structure; reversal remains conditional.',
        'up_participation':'Closed upward displacement or continuation is supported by actual relative volume and coherent price acceptance; no stronger exhaustion case is present.',
        'down_participation':'Closed downward displacement or continuation is supported by actual relative volume and coherent price acceptance; no stronger exhaustion case is present.',
        'no_match':'No distinct participation or exhaustion pattern: evidence is missing, warming, mixed, price-only, or lacks a useful structural response.'}}
for _name in tuple(k for k in QUESTIONS if k!='volume_pattern'):
    QUESTIONS[_name]['instructions']+=' Use completed `market_synth` evidence as support. A/B are correlated price-derived signals; only volume fields use traded volume. Keep exhaustion hypothetical and retain neutral/no-match for conflicts.'

REQUEST_BUDGET_SECONDS=2.7
MAX_REQUEST_BYTES=63_000  # Conservative UTF-8 bounds for the two independent token limits.
QUESTIONS['swing_warning_response']={'type':'choice',
    'instructions':'Classify whether the supplied `swing_warnings` show a developing reversal in the observed delivery direction. Use closed state for confirmation and mark provisional state as tentative. Correlated SLOW, CHOP and DIVERGENCE share a family cap. Repaired or cleared episodes stop contributing. Compare deliverySupport and recognized protected-pivot breaks with the warnings. Pressure is not a calibrated probability, and warning counts, model probabilities and entry permissions are separate. Choose insufficient when this evidence is absent or unavailable.',
    'criteria':{'building':'Warnings remain active but a protected-pivot break and local-turn confirmation are still absent.',
                'repaired_or_tracking':'Price repairs warnings or continues delivery without an active reversal case.',
                'confirmed_local_turn':'The CLOSED warning state confirms a local turn after protected-pivot failure and failed reclaim or opposite departure.',
                'insufficient':'Warning evidence is missing, unavailable, or contradictory enough to withhold a classification.'}}

# The house ABC result is computed from completed bars by the 1.7 Pine study.
# It is contextual evidence in the existing request, not another paid call.
QUESTIONS['directional_lean']['instructions'] += (' If `house_abc.status` is AVAILABLE, use its separately timestamped house O-A-B-C stage and uncalibrated exhaustion contributions as contextual evidence. Developing points can move; do not assert confirmation before the recorded known time. A different exhaustion root describes a different delivery. If unavailable, do not infer it.')
QUESTIONS['swing_warning_response']['instructions'] += (' When `house_abc.status` is AVAILABLE, consider the separate 1.7 exhaustion score and coverage alongside, not added to, the existing warning score. Both are uncalibrated and may refer to different roots. Do not infer missing evidence or entry permission.')

MAX_QUESTION_BYTES=32_000
RETRY_STATUSES=frozenset({429,500,502,503,504,529})

def prepare_state(state):
    """Bound model evidence; complete source/study records stay in the local ledger."""
    result=deepcopy(state)
    study=result.get('liquidity_study')
    if isinstance(study,dict):
        for key in ('summaries','plans','counts','cost_scope'):study.pop(key,None)
        context=study.get('context',{})
        if 'levels' in study:context.pop('levels',None)
        for frame in context.get('frames',{}).values():
            evidence=frame.get('evidence',[])
            frame['evidence']=evidence[-6:]
            frame['evidence_omitted']=max(0,len(evidence)-6)
        # Keep nearby references per own timeframe/side, all manual references,
        # and all contacted/frozen references in the active campaigns themselves.
        levels=study.get('levels',[]);selected={x['id'] for x in levels if x.get('source')=='manual'}
        midpoint=(result.get('bid',0)+result.get('ask',0))/2
        groups={(x.get('timeframe'),x.get('side')) for x in levels}
        for frame,side in groups:
            ordered=sorted((x for x in levels if x.get('timeframe')==frame and x.get('side')==side),key=lambda x:abs(x['price']-midpoint))
            selected.update(x['id'] for x in ordered[:1])
        study['levels']=[x for x in levels if x['id'] in selected]
        study['levels_omitted']=len(levels)-len(study['levels'])
        study['model_evidence_scope']='Nearest reference per timeframe/side plus manual references; active campaigns retain their frozen reference and target. HTF evidence is the last 6 completed bars per frame. Complete records remain local.'
        for campaign in study.get('campaigns',[]):
            # Retain contact candle, timestamps, permission, frozen anchors and
            # current measured state; old receipts/variant bookkeeping stay local.
            for key in ('model_receipts','variants','key','context_hash','metrics_at_contact'):
                campaign.pop(key,None)
    bars=result.get('closed_bars',[])
    window=(study or {}).get('settings',{}).get('study_window',5)
    retained=max(12,2*window+1)
    result['closed_bars']=bars[-retained:]
    result['closed_bars_omitted']=max(0,len(bars)-retained)
    synth=result.get('market_synth')
    if isinstance(synth,dict):
        recent=synth.get('recent',[]);synth['recent']=recent[-3:]
        synth['recent_omitted']=max(0,len(recent)-3)
    warnings=result.get('swing_warnings')
    if isinstance(warnings,dict):
        # Keep complete episodes and raw configuration locally. The model needs
        # measured values, active severity, support and the last event changes.
        for key in ('closed','provisional'):
            sample=warnings.get(key)
            if isinstance(sample,dict):
                for field in ('featureConfig','episodes','liveEpisodes'):sample.pop(field,None)
        events=warnings.get('events',[])
        warnings['events']=events[-8:]
        warnings['events_omitted']=max(0,len(events)-8)
    return result

class JevRequestError(ValueError):
    def __init__(self,diagnostics):
        super().__init__('Jev request unavailable')
        self.diagnostics=diagnostics

class JevResponseError(ValueError):
    """Retain only safe billable counters when typed-answer validation fails."""
    def __init__(self,value,reason='invalid_response'):
        super().__init__('Invalid typed Jev response')
        self.safe_usage=safe_usage(value.get('usage')) if isinstance(value,dict) else None
        self.response_model=value.get('model') if isinstance(value,dict) and isinstance(value.get('model'),str) else None
        self.diagnostics={'error_code':reason}

def probability(v):
    return type(v) in (int,float) and math.isfinite(v) and 0<=v<=1

def validate_response(value):
    if not isinstance(value,dict) or value.get('model')!=MODEL:raise ValueError('Unexpected model')
    answers=value.get('answers',{})
    if not isinstance(answers,dict):raise ValueError('answers: invalid_object')
    for key,q in QUESTIONS.items():
        a=answers.get(key,{})
        if not isinstance(a,dict) or a.get('type')!=q['type']:raise ValueError(key+': invalid_type')
        if q['type']=='noul':
            if not probability(a.get('noul')):raise ValueError(key+': invalid_probability')
        else:
            dist=a.get('probabilities',{})
            if not isinstance(dist,dict) or set(dist)!=set(q['criteria']) or not all(probability(v) for v in dist.values()):raise ValueError(key+': invalid_distribution')
            # The wire contract allows approximate sums. Accept only the error
            # bounded by rounding each option to two decimal places; keep raw values.
            rounded=all(abs(v*100-round(v*100))<1e-8 for v in dist.values())
            tolerance=len(dist)*.005+1e-9 if rounded else .001
            if abs(sum(dist.values())-1)>tolerance:raise ValueError(key+': distribution_sum')
            if a.get('choice') not in dist or dist[a['choice']]<max(dist.values())-1e-6 or not probability(a.get('confidence')):raise ValueError(key+': invalid_choice')
    return {'model':value['model'],'answers':answers,'usage':value.get('usage',{})}

class Jev:
    def __init__(self,store=None):
        self._key_override=None
        self._key_lock=threading.RLock()
        self._saved_key='';self._storage_error=None
        try:
            self._store=MacKeychain() if store is None else store
            if self._store:self._saved_key=self._store.load()
        except (KeychainError,OSError):
            self._storage_error='Saved key unavailable. Unlock your login Keychain and choose Load saved key.'
            if not hasattr(self,'_store'):self._store=None

    def _key(self):
        with self._key_lock:
            return self._key_override if self._key_override is not None else self._saved_key or os.environ.get('TYPESAFE_API_KEY','')

    @property
    def configured(self):return bool(self._key())

    @property
    def key_source(self):
        with self._key_lock:
            if self._key_override is not None:return 'server_memory' if self._key_override else None
            if self._saved_key:return 'macos_keychain'
            return 'environment' if os.environ.get('TYPESAFE_API_KEY') else None

    @property
    def key_storage(self):
        with self._key_lock:return {'backend':'macos_keychain','available':bool(self._store),
            'saved':bool(self._saved_key),'error':self._storage_error}

    def save_key(self,key):
        with self._key_lock:
            if not self._store:raise KeychainError('Secure Jev storage requires macOS Keychain. No plaintext fallback is available.')
            self._store.save(key)
            self._saved_key=key;self._key_override=None;self._storage_error=None

    def forget_key(self):
        with self._key_lock:
            if self._store:self._store.delete()
            self._saved_key='';self._key_override='';self._storage_error=None

    def load_saved_key(self):
        with self._key_lock:
            if not self._store:raise KeychainError('macOS Keychain storage is unavailable.')
            key=self._store.load(prompt=True)
            self._saved_key=key;self._key_override=None;self._storage_error=None

    def set_session_key(self,key):
        # A blank override disables this session even if an environment key exists.
        with self._key_lock:self._key_override=key

    def judge(self,state):
        key=self._key()
        if not key:raise ValueError('Jev key unavailable')
        model_state=prepare_state(state)
        encoded=lambda questions:json.dumps({'model':MODEL,'state':model_state,'questions':questions},allow_nan=False,separators=(',',':')).encode()
        payload=encoded(QUESTIONS)
        question_bytes=max(len(encoded({k:q})) for k,q in QUESTIONS.items())
        if len(payload)>MAX_REQUEST_BYTES or question_bytes>MAX_QUESTION_BYTES:
            raise JevRequestError({'error_code':'local_context_budget_exceeded','request_bytes':len(payload),'largest_question_bytes':question_bytes,'attempt_count':0})
        deadline=time.monotonic()+REQUEST_BUDGET_SECONDS
        prediction=state.get('prediction_bar')
        if type(prediction) is int:deadline=min(deadline,time.monotonic()+max(0,prediction/1000-time.time()-.05))
        attempts=[]
        for index in range(3):
            remaining=deadline-time.monotonic()
            if remaining<=.05:break
            request=Request('https://api.typesafe.ai/v1/systemone',data=payload,headers={'Content-Type':'application/json','Authorization':'Bearer '+key})
            try:
                with urlopen(request,timeout=min(1.8,remaining)) as response:value=json.load(response)
                try:result=validate_response(value)
                except (ValueError,TypeError,AttributeError) as e:
                    error=JevResponseError(value,str(e));error.diagnostics.update(attempt_count=len(attempts)+1,request_bytes=len(payload),attempt_errors=attempts)
                    raise error from None
                result['transport']={'attempt_count':len(attempts)+1,'attempt_errors':attempts,'request_bytes':len(payload),'projection':PROMPT_VERSION,
                                     'unpriced_attempts':sum(a.get('http_status') not in (429,529) for a in attempts)}
                return result
            except HTTPError as e:
                code=None
                try:
                    detail=json.loads(e.read(4096)).get('detail',{})
                    # Never persist arbitrary provider text or an echoed request.
                    code=detail.get('error_type') if isinstance(detail,dict) else None
                except (ValueError,OSError,AttributeError):pass
                known={'max_tokens_exceeded','invalid_api_key','rate_limit_exceeded','overloaded'}
                error={'http_status':e.code,'error_code':code if code in known else 'http_error'}
                delay=.15*2**index+random.uniform(0,.05)
                retry_after=e.headers.get('Retry-After') if e.headers else None
                retry_ms=e.headers.get('retry-after-ms') if e.headers else None
                try:
                    if retry_ms is not None:delay=max(delay,float(retry_ms)/1000)
                    if retry_after is not None:
                        try:seconds=float(retry_after)
                        except ValueError:seconds=(parsedate_to_datetime(retry_after)-datetime.now(timezone.utc)).total_seconds()
                        delay=max(delay,seconds)
                except (ValueError,TypeError,OverflowError):delay=REQUEST_BUDGET_SECONDS
                e.close()
                retry=e.code in RETRY_STATUSES
            except (URLError,TimeoutError,OSError,json.JSONDecodeError):
                # A lost response may have been billable. Do not issue another
                # potentially duplicate inference without an idempotency contract.
                error={'error_code':'connection_or_response_error'};delay=0;retry=False
            attempts.append(error)
            if not retry or index==2 or delay+.05>=deadline-time.monotonic():
                raise JevRequestError({**error,'attempt_count':len(attempts),'attempt_errors':attempts,'request_bytes':len(payload)}) from None
            time.sleep(delay)
        raise JevRequestError({'error_code':'freshness_deadline','attempt_count':len(attempts),'attempt_errors':attempts,'request_bytes':len(payload)})
