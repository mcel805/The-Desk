"""Taper's local, paper-only TypeSafe Jev read of completed 1-minute tape.

The endpoint classifies supplied evidence. It never places or edits an order.
Only metadata and token usage are retained; raw market bars stay in the request.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
import os
import re
import secrets
import threading
import time
from rider_playbooks import questions as rider_questions
import taper_geometry
import taper_volume
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


MODEL = "jev-1.13.0"  # Pinned for reproducible decisions and pricing.
METHOD = "taper.tape-read.v0.4.volume"
INPUT_USD_PER_MILLION = 0.042  # docs.typesafe.ai/models, retrieved 2026-10-09.
MAX_REQUEST_USD = 64_000 * INPUT_USD_PER_MILLION / 1_000_000
API_URL = "https://api.typesafe.ai/v1/systemone"
_LOCK = threading.Lock()


def status() -> dict:
    configured = bool(os.environ.get("TYPESAFE_API_KEY", "").strip())
    return {"agent": "Taper", "method": METHOD, "provider": "typesafe", "configured": configured,
            "credentialEnv": "TYPESAFE_API_KEY", "connection": "credentials_present_unverified" if configured else "missing_key",
            "mode": "paper research; no order route", "model": MODEL, "inputUsdPerMillion": INPUT_USD_PER_MILLION,
            "maxRequestUsd": MAX_REQUEST_USD, "questionPack":taper_volume.PACK, "questionPlan":decision_questions(True, True), "inputMode": "completed OHLCV, recomputed volume and structured Wave Court state; text only"}


def _number(value, field: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field} must be a finite number") from None
    if not math.isfinite(number):
        raise ValueError(f"{field} must be a finite number")
    return number


def _evidence(payload: dict) -> dict:
    source = payload.get("source")
    bars = payload.get("bars")
    if not isinstance(source, dict) or not isinstance(bars, list) or not 20 <= len(bars) <= 60:
        raise ValueError("Taper needs a source and 20–60 completed one-minute bars")
    if str(source.get("timeframe", "")).lower() != "1m":
        raise ValueError("Taper reads a completed 1-minute chart only")
    provider = str(source.get("provider", ""))[:40]
    symbol = str(source.get("symbol", ""))[:80]
    if not provider or not symbol:
        raise ValueError("Source provider and symbol are required")
    cutoff = int(_number(source.get("completedCutoff"), "completedCutoff"))
    asof = int(_number(source.get("snapshotAsOf"), "snapshotAsOf"))
    if cutoff + 60_000 > asof:
        raise ValueError("The final 1-minute bar has not completed")
    if asof - cutoff - 60_000 > 300_000:
        raise ValueError("The 1-minute source is over five minutes stale; refresh before Taper reads")
    clean = []
    prior = -1
    for row in bars:
        if not isinstance(row, dict):
            raise ValueError("Bars must be objects")
        bar = {field: _number(row.get(field), field) for field in ("time", "open", "high", "low", "close")}
        if bar["time"] % 60_000 or bar["time"] <= prior or bar["time"] > cutoff:
            raise ValueError("Bars must be ordered, unique, and no later than the cutoff")
        if prior >= 0 and bar["time"] - prior != 60_000:
            raise ValueError("Taper needs contiguous completed one-minute bars")
        if bar["low"] <= 0 or bar["high"] < max(bar["open"], bar["close"], bar["low"]) or bar["low"] > min(bar["open"], bar["close"]):
            raise ValueError("A bar has invalid OHLC geometry")
        if row.get("volume") is not None:
            bar["volume"] = _number(row["volume"], "volume")
            if isinstance(row["volume"], bool) or bar["volume"] < 0:
                raise ValueError("Volume must be nonnegative, finite and not boolean")
        clean.append(bar)
        prior = bar["time"]
    if int(clean[-1]["time"]) != cutoff:
        raise ValueError("The last bar does not match the declared completed cutoff")
    frames = payload.get("frames", [])
    levels = payload.get("levels", {})
    if not isinstance(frames, list) or len(frames) > 7 or not isinstance(levels, dict):
        raise ValueError("Invalid Wave Court context")
    bounded_frames = []
    for frame in frames:
        if not isinstance(frame, dict):
            continue
        bounded_frames.append({"timeframe": str(frame.get("timeframe", ""))[:8], "cutoff": frame.get("cutoff"),
                               "status": str(frame.get("status", ""))[:90], "bars": frame.get("bars"),
                               "degrees": frame.get("degrees", [])[:3] if isinstance(frame.get("degrees"), list) else []})
    bounded_levels = {}
    for side in ("HIGH", "LOW"):
        rows = levels.get(side, [])
        bounded_levels[side] = [{key: row.get(key) for key in ("timeframe", "price", "weight", "kind", "confirmedTime")}
                                for row in rows[:4] if isinstance(row, dict)] if isinstance(rows, list) else []
    game = payload.get("game")
    bounded_game = None
    if game is not None:
        if not isinstance(game, dict):
            raise ValueError("Game context must be an object")
        markets = {"binance": {"BTC": "BTCUSDT", "ETH": "ETHUSDT", "SOL": "SOLUSDT"},
                   "coinbase": {"BTC": "BTC-USD", "ETH": "ETH-USD", "SOL": "SOL-USD"},
                   "hyperliquid": {"BTC": "BTC", "ETH": "ETH", "SOL": "SOL"}}
        asset = str(game.get("asset", ""))
        if markets.get(provider, {}).get(asset) != symbol:
            raise ValueError("BTC, ETH, or SOL game source does not match the selected provider")
        instrument_type = "perpetual" if provider == "hyperliquid" else "spot"
        if game.get("instrumentType") != instrument_type:
            raise ValueError("Game instrument type does not match its provider")
        if game.get("fieldProvider") != provider or game.get("fieldSymbol") != symbol:
            raise ValueError("The frozen 15-minute field does not match the tape source")
        low = _number(game.get("fieldLow"), "fieldLow")
        high = _number(game.get("fieldHigh"), "fieldHigh")
        if not 0 < low < high:
            raise ValueError("The frozen 15-minute field is invalid")
        field_version = str(game.get("fieldVersion", ""))[:80]
        if not field_version:
            raise ValueError("A frozen 15-minute field version is required")
        field_cutoff = int(_number(game.get("fieldCutoff"), "fieldCutoff"))
        if field_cutoff > cutoff:
            raise ValueError("The frozen field cutoff is newer than the tape")
        mode = str(game.get("accountMode", ""))
        if mode not in ("sim", "robinhood"):
            raise ValueError("Unknown game account mode")
        raw_levels = game.get("eligibleLevels", [])
        if not isinstance(raw_levels, list) or len(raw_levels) > 12:
            raise ValueError("Invalid active field liquidity levels")
        eligible = []
        for level in raw_levels:
            if not isinstance(level, dict) or level.get("status") != "active":
                raise ValueError("Game level is not active")
            price = _number(level.get("price"), "level price")
            if not low <= price <= high:
                raise ValueError("Game level is outside the frozen field")
            eligible.append({"id": str(level.get("id", ""))[:100], "side": str(level.get("side", ""))[:12], "price": price})
        bounded_game = {"asset": asset, "accountMode": mode, "instrumentType": instrument_type,
                        "fieldFresh": game.get("fieldFresh") is True and field_cutoff == cutoff, "fieldCutoff": field_cutoff, "fieldVersion": field_version,
                        "fieldLow": low, "fieldHigh": high, "eligibleLevels": eligible,
                        "entryRule": "Manual paper ticket at an active confirmed level in the frozen field"}
    hunt = payload.get("hunt")
    bounded_hunt = None
    if isinstance(hunt, dict):
        levels = hunt.get("levels", [])
        if not isinstance(levels, list) or not 1 <= len(levels) <= 30:
            raise ValueError("Hunt requires 1 to 30 selected levels")
        bounded_hunt = {"selectedLevels": [{"id": str(x.get("id", ""))[:100], "price": _number(x["price"], "hunt price"),
                         "side": x["side"], "tf": x["tf"], "origin": x.get("origin", "indicator"), "weight": _number(x.get("weight", 0), "hunt weight")} for x in levels],
                        "ruleProposals": [{key: x.get(key) for key in ("barTime", "stage", "bias", "entry", "stop", "target", "rr", "risk", "reason")}
                                          for x in hunt.get("candidates", [])[:30]],
                        "policy": {key: hunt.get("policy", {}).get(key) for key in
                                   ("id", "confirmBars", "maxStopTicks", "minRR", "preferredRR", "useExchangeTicks",
                                    "riskTickBTC", "riskTickETH", "riskTickSOL", "expiryBars", "minQuality")},
                        "role": "Assess completed tape at the selected levels. Proposals are conditional rules, not orders or profit probabilities."}
    if bounded_hunt is not None:
        learning = hunt.get("learning", {})
        reviews = learning.get("reviews", []) if isinstance(learning, dict) else []
        bounded_hunt["learningContext"] = {"reviews": [
            {key: item.get(key) for key in ("session", "revision", "publishedAt", "samples", "correct", "accuracy", "pending", "missing", "measurement")}
            for item in reviews[:3] if isinstance(item, dict) and isinstance(item.get("publishedAt"), (int, float)) and item["publishedAt"] <= cutoff + 60000],
            "minimumSamples": 30,
            "authority": "Historical observational context only; no model training, profit probability or automatic policy adoption."}
    return {"riderCandidates": payload.get("riderCandidates", [])[:4], "method": METHOD, "source": {"provider": provider, "symbol": symbol, "timeframe": "1m",
            "completedCutoff": cutoff, "snapshotAsOf": asof}, "frames": bounded_frames,
            "levels": bounded_levels, "game": bounded_game, "hunt": bounded_hunt, "bars": clean,
            "marketGeometry": taper_geometry.evidence(payload.get("marketGeometry"),provider,symbol,cutoff,_number,clean),
            "volumeEvidence": taper_volume.evidence(payload.get("volumeHistory"), {"provider":provider,"symbol":symbol,"completedCutoff":cutoff}, clean)}


class JevResponseError(RuntimeError):
    """Keep measurable usage even when the typed model response is unusable."""
    def __init__(self, message, usage=None, estimated_usd=None):
        super().__init__(message)
        self.retryable = True
        self.receipt = {"provider": "typesafe", "model": MODEL, "usage": usage or {},
                        "estimatedUsd": estimated_usd if estimated_usd is not None else MAX_REQUEST_USD,
                        "costUnknown": estimated_usd is None, "classificationRecorded": False}


def validated_usage(usage):
    if not isinstance(usage, dict):
        raise JevResponseError("TypeSafe Jev response omitted measurable usage")
    for key in ("input_tokens", "output_tokens"):
        value = usage.get(key)
        if type(value) is not int or not 0 <= value <= 1_000_000:
            raise JevResponseError("TypeSafe Jev returned invalid token usage")
    return {**usage, "total_tokens": usage["input_tokens"] + usage["output_tokens"]}


def normalize_answers(raw, questions):
    """Adapt the documented answer map to the existing ledger/UI list contract."""
    if not isinstance(raw, dict) or set(raw) != set(questions):
        raise ValueError("Missing or unexpected answer IDs")
    answers = []
    for name, q in questions.items():
        a = raw[name]
        if not isinstance(a, dict) or a.get("type") != q["type"]:
            raise ValueError("Mismatched answer type")
        confidence = _number(a.get("confidence"), "confidence")
        if not 0 <= confidence <= 1:
            raise ValueError("Confidence outside 0–1")
        expected = set(q["criteria"]) if q["type"] == "choice" else {str(i) for i in range(len(q["criteria"]))}
        probs = a.get("probabilities")
        if not isinstance(probs, dict) or set(probs) != expected:
            raise ValueError("Incomplete probability distribution")
        values = [_number(v, "probability") for v in probs.values()]
        if any(not 0 <= v <= 1 for v in values) or abs(sum(values) - 1) > .005:
            raise ValueError(f"Invalid probability distribution for {name}: sum={sum(values):.6f}")
        if q["type"] == "choice":
            if a.get("choice") not in expected:
                raise ValueError("Choice outside criteria")
        else:
            score = _number(a.get("score"), "score")
            if not 0 <= score <= len(q["criteria"]) - 1:
                raise ValueError("Score outside criteria")
            if not isinstance(a.get("legend"), dict) or set(a["legend"]) != expected:
                raise ValueError("Missing score legend")
        answers.append({**a, "name": name})
    return answers


def decision_questions(include_geometry=False, include_volume=False):
    """Exact public questions and criteria; no model reasoning trace."""
    questions = {
        "tape_state": {"type": "choice", "instructions":
            "Classify the latest completed 1-minute tape around confirmed liquidity in `state`. "
            "Use only supplied bars and levels; infer no unseen candle or order-book depth. "
            "When `hunt` exists, prioritize `hunt.selectedLevels` and assess its conditional rule proposals. "
            "Historical learningContext is observational context, not proof of improvement.",
            "criteria": {
                "reject_high": "Price touched an upper liquidity level and completed back below it.",
                "reject_low": "Price touched a lower liquidity level and completed back above it.",
                "accept_above": "Completed closes accepted above an upper liquidity level.",
                "accept_below": "Completed closes accepted below a lower liquidity level.",
                "range": "Recent bars remain in a range with no qualified level resolution.",
                "unclear": "Mixed evidence, unresolved direction, or required context unavailable."}},
        "research_bias": {"type": "choice", "instructions":
            "Select a watch bias from supplied completed candles, confirmed levels and Wave Court context. "
            "This is paper research, never an order or probability of profit. When `hunt` exists, assess only "
            "its selected levels using its frozen policy: max 30 risk ticks, minimum 3R, prefer 5R+, "
            "nearest active opposite liquidity target. Missing risk scale or unqualified proposals mean WAIT. "
            "For `game`, only eligible levels in the matching frozen field govern a paper entry. "
            "Higher-frame context and learningContext cannot create new levels or bypass risk gates. "
            "Prefer WAIT when evidence is conflicting or insufficient.",
            "criteria": {
                "WATCH_LONG": "Completed tape supports watching a qualified long setup at a selected level.",
                "WATCH_SHORT": "Completed tape supports watching a qualified short setup at a selected level.",
                "WAIT": "No qualified supported setup; confirmation, risk scale, context or evidence missing."}},
        "structure_clarity": {"type": "score", "instructions":
            "Rate agreement between supplied completed-bar structure, confirmed liquidity and available "
            "higher-frame Wave Court candidates. Missing parent counts reduce clarity. This question "
            "cannot see answers to other questions in this request.",
            "criteria": [
                "Weak: conflicting or insufficient completed tape and required parent context missing.",
                "Mixed: some agreement, but an important confirmation or context is absent.",
                "Clear: completed structure, nearby confirmed liquidity and available parent context agree."]},
    }

    if include_geometry:questions.update(taper_geometry.questions())
    if include_volume:
        questions.update(taper_volume.questions())
        questions["research_bias"]["instructions"] += " Use volumeEvidence as supplemental context. Missing volume cannot support a directional claim. No volume signal may create levels or bypass completed price confirmation or frozen risk gates."
    return questions


FRAMES=('1d','4h','1h','30m','15m','5m','1m')
def request_groups(evidence,questions):
 """Scope independent judgments after validating the full local evidence.

 Direction reads keep all seven complete channel anchors. Cross-frame reads
 retain execution geometry and measured parent summaries. No answer from one
 group feeds another; source, cutoff, selected levels and risk stay frozen.
 """
 groups=[];remaining=dict(questions);geometry=evidence.get('marketGeometry')
 if geometry:
  selected={name:remaining.pop(name) for tf in FRAMES if (name:='geometry_'+tf) in remaining}
  if selected:
   scoped=copy.deepcopy(geometry)
   for frame in scoped['frames']:
    for channel in frame.get('channels',[]):channel.pop('volumeContext',None)
   state={'source':evidence['source'],'marketGeometry':scoped,'coverage':'Independent frame-direction questions receive all seven validated frames and their complete channel anchors, rails and breaks. Volume is out of scope for these direction questions; it is evaluated in the context request.'}
   groups.append((state,selected))
 if remaining:
  state=copy.deepcopy(evidence)
  if geometry:
   for frame in state['marketGeometry']['frames']:
    for c in frame.get('channels',[]):
     for k in ('anchorTimes','anchorPrices'):c.pop(k,None)
     for a in c.get('anchors',[]):a.pop('bar',None)
     v=c.get('volumeContext')
     if v:
      v.pop('recentContacts',None)
      v.pop('baseline',None);v.pop('semantics',None)
      v['latest']={k:value for k,value in v['latest'].items() if k not in ('high','low','close','volume','range','density','time','knownAt')}
    if frame['timeframe']!='1m':
     parent_fields=('id','status','direction','wickContacts','confirmedAt','tradableAfter','breakState','breakDirection','breakAgeBars','volumeContext')
     frame['channels']=[{**{k:c[k] for k in parent_fields if k in c},'anchorReactionATR':[a['reactionATR'] for a in c.get('anchors',[])]} for c in frame.get('channels',[])]
    frame['evidenceScope']='All retained channels and all direction counts. Execution-frame server-validated wick anchors retain role, time, price, side, confirmation and reaction. Parent summaries retain channel state, confirmation, corroboration and anchor reaction; full parent anchors remain local and are supplied when independent frame-direction questions are requested. Last-bar OHLC is in lastBar. Volume keeps latest normalized measurements, reaction and computed follow-through; historical contact rows and redundant raw fields remain in the local full evidence, not this cross-frame read.'
   state['marketGeometry']['volumeSemantics']={'baseline':'20 prior completed bars of reported venue volume and volume/range; not same-time RVOL','semantics':'Server-computed supporting evidence. High effort with limited progress is a stall hypothesis, not institutional identity or an order. Median is derived; anchors remain observed wicks.'}
  groups.append((state,remaining))
 return groups

def decide(payload: dict, ledger_path: Path) -> dict:
    evidence = _evidence(payload)
    api_key = os.environ.get("TYPESAFE_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("Taper needs TYPESAFE_API_KEY in the Count Desk server environment")
    questions = decision_questions(evidence.get("marketGeometry") is not None, True)
    if evidence.get("riderCandidates"):
        questions={k:v for k,v in questions.items() if k in ("tape_state","structure_clarity")}
    questions.update(rider_questions(evidence.get("riderCandidates", [])))
    started = time.monotonic()
    attempts = []
    usage = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
    cost_unknown = False

    def send(selected, request_state, scope):
        nonlocal cost_unknown
        body = json.dumps({"model": MODEL, "state": request_state, "questions": selected},
                          separators=(",", ":"), allow_nan=False).encode()
        request = Request(API_URL, data=body,
                          headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}, method="POST")
        attempt = {"questionIds": list(selected), "requestBytes": len(body), "scope": scope,
                   "stateHash": hashlib.sha256(json.dumps(request_state, sort_keys=True).encode()).hexdigest()}
        attempts.append(attempt)
        try:
            with urlopen(request, timeout=20) as response:
                result = json.load(response)
            measured = validated_usage(result.get("usage") if isinstance(result, dict) else None)
            attempt.update(usage=measured, rawAnswers=result.get("answers"), model=result.get("model"))
            for key in usage:
                usage[key] += measured[key]
            return result
        except HTTPError as exc:
            # Retain provider diagnostics, never the Authorization header or echoed key.
            try:
                error_body = json.loads(exc.read(8192).decode("utf-8", errors="replace"))
            except (ValueError, OSError):
                error_body = {}
            details = []
            def extract(value):
                if isinstance(value, str):
                    details.append(value)
                elif isinstance(value, list):
                    for item in value[:8]: extract(item)
                elif isinstance(value, dict):
                    for key in ("error", "error_type", "code", "type", "message", "detail", "msg"):
                        if key in value: extract(value[key])
            extract(error_body)
            detail = " · ".join(details).replace(api_key, "[redacted]")
            detail = re.sub(r"(?i)bearer\s+\S+", "Bearer [redacted]", detail)
            detail = " ".join(detail.split())[:500]
            labels = {400:"request rejected",401:"API key rejected",403:"account access denied",
                      422:"request validation failed",429:"rate limited",529:"service overloaded"}
            if "max_tokens_exceeded" in detail:
                detail = "request exceeds Jev context limit (max_tokens_exceeded)"
            message = labels.get(exc.code, "provider error") + (": " + detail if detail else " (provider gave no readable details)")
            error = JevResponseError(f"TypeSafe Jev HTTP {exc.code}: {message}; no classification recorded")
            error.retryable = exc.code in (408,429,500,502,503,504,529)
            error.receipt.update(httpStatus=exc.code, providerMessage=detail, retryable=error.retryable,
                                 retryPolicy="next fresh completed minute" if error.retryable else "review request before re-arm")
            cost_unknown = True
            attempt.update(httpStatus=exc.code, providerMessage=detail, costUnknown=True)
            raise error from None
        except (URLError, TimeoutError):
            cost_unknown = True
            attempt.update(costUnknown=True, failure="connection_or_timeout")
            raise JevResponseError("TypeSafe Jev unavailable or timed out; no classification recorded; billing may be unknown") from None
        except (ValueError, TypeError):
            cost_unknown = True
            attempt.update(costUnknown=True, failure="invalid_json")
            raise JevResponseError("TypeSafe Jev returned invalid JSON") from None
        except JevResponseError:
            cost_unknown = True
            attempt.update(costUnknown=True, failure="invalid_usage")
            raise

    initial_raw = {}
    raw = {}
    try:
        for request_state, selected in request_groups(evidence, questions):
            scope = "frame_directions" if all(name in {"geometry_"+tf for tf in FRAMES} for name in selected) else "execution_and_context"
            result = send(selected, request_state, scope)
            if result.get("model") != MODEL:
                error = JevResponseError("Unexpected Jev model version; review pricing before using its output")
                error.retryable = False
                raise error
            group_raw = result.get("answers")
            if not isinstance(group_raw, dict) or set(group_raw) != set(selected):
                raise JevResponseError("TypeSafe Jev returned missing or unexpected answer IDs")
            initial_raw.update(group_raw)
            # Retry only invalid questions once, against the identical scoped state.
            # Never normalize probabilities or fill in missing answers.
            invalid = {}
            for name, question in selected.items():
                try:
                    normalize_answers({name: group_raw[name]}, {name: question})
                except (ValueError, TypeError) as exc:
                    invalid[name] = str(exc)
            if invalid:
                attempts[-1]["validationErrors"] = invalid
                retry_questions = {name: selected[name] for name in invalid}
                repaired = send(retry_questions, request_state, scope)
                if repaired.get("model") != MODEL:
                    error = JevResponseError("Unexpected Jev model version during answer retry")
                    error.retryable = False
                    raise error
                normalize_answers(repaired.get("answers"), retry_questions)
                group_raw = {**group_raw, **repaired["answers"]}
            raw.update(group_raw)
        answers = normalize_answers(raw, questions)
    except (JevResponseError, ValueError, TypeError) as exc:
        error = exc if isinstance(exc, JevResponseError) else JevResponseError("TypeSafe Jev returned an unexpected typed response: " + str(exc)[:160])
        estimate = round(usage["input_tokens"] * INPUT_USD_PER_MILLION / 1_000_000, 8)
        error.receipt.update(usage=usage, estimatedUsd=estimate, costUnknown=cost_unknown,
                             costReservedUsd=sum(MAX_REQUEST_USD for a in attempts if a.get("costUnknown")),
                             apiRequests=len(attempts), attempts=attempts, retryable=error.retryable)
        raise error from None
    estimate = round(usage["input_tokens"] * INPUT_USD_PER_MILLION / 1_000_000, 8)
    latency_ms = round((time.monotonic() - started) * 1000)
    decision_id = "taper-" + secrets.token_hex(10)
    game = evidence.get("game")
    bias_answer = next((answer for answer in answers if answer.get("name") == "research_bias"), {})
    bias = bias_answer.get("choice") if bias_answer.get("type") == "choice" else None
    if not game:
        paper_gate = {"status": "context_only", "reason": "No game field; paper entry unavailable"}
    elif game["accountMode"] != "sim":
        paper_gate = {"status": "context_only", "reason": "Switch to Practice SIM to review a paper entry"}
    elif not game["fieldFresh"] or not game["eligibleLevels"]:
        paper_gate = {"status": "wait", "reason": "Refresh the frozen field; no active eligible paper level"}
    elif bias == "WATCH_SHORT" and game["instrumentType"] == "spot":
        paper_gate = {"status": "wait", "reason": "Spot source has no modeled borrow or margin for a short"}
    elif bias in ("WATCH_LONG", "WATCH_SHORT"):
        paper_gate = {"status": "manual_review", "reason": "Watch only; choose and confirm an active field level in the SIM ticket"}
    else:
        paper_gate = {"status": "wait", "reason": "No paper setup from the current completed-bar read"}
    record = {"decisionId": decision_id, "agent": "Taper", "method": METHOD,
              "riderCandidates": evidence.get("riderCandidates", []), "source": evidence["source"], "evidenceHash": hashlib.sha256(json.dumps(evidence, sort_keys=True).encode()).hexdigest(),
              "provider": "typesafe", "model": result["model"], "answers": answers, "questions": questions, "questionPack":taper_volume.PACK, "volumeEvidence":evidence.get("volumeEvidence"), "marketGeometry":evidence.get("marketGeometry"), "rawAnswers": raw, "initialRawAnswers": initial_raw, "apiRequests": len(attempts), "attempts": attempts, "usage": usage,
              "latencyMs": latency_ms, "requestBytes": sum(a["requestBytes"] for a in attempts),
              "pricing": {"inputUsdPerMillion": INPUT_USD_PER_MILLION, "outputUsdPerMillion": 0,
                          "source": "https://docs.typesafe.ai/models", "asOf": "2026-10-09", "model": MODEL},
              "estimatedUsd": estimate, "createdAt": int(time.time() * 1000),
              "mode": "paper research; no order submitted", "paperGate": paper_gate,
              "game": {key: game[key] for key in ("asset", "instrumentType", "fieldVersion") if key in game} if game else None}
    ledger_path.parent.mkdir(parents=True, exist_ok=True)
    with _LOCK, ledger_path.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(record, separators=(",", ":")) + "\n")
    return record
