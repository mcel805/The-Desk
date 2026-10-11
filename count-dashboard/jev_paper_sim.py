"""Deterministic one-candle USD paper simulator. No broker/account/order APIs."""
import math

VERSION = 'jev.sar-directed-channel-resting-limit-swing.paper.v5'
PRICE_ACTION_VERSION = 'jev.sar-pullback-cost-aware.paper.v6'
FIVE_MINUTE_VERSION = 'jev.5m-sar-1m-pullback.paper.v7'
EXPLORATION_VERSION = 'jev.5m-sar-passive-exploration.paper.v8'
BUFFERED_VERSION = 'jev.5m-sar-passive-1m-volatility-stop.paper.v9'
PREVIOUS_VERSION = 'jev.sar-directed-channel-band-touch-target.paper.v4'
LEGACY_QUICK_EXIT_VERSION = 'jev.sar-directed-channel-quick-exit.paper.v3'
DEFAULTS = {'capital':10000.0,'riskProfile':'balanced','riskPct':.5,'maxRiskUsd':50.0,'maxNotional':500.0,'feeBps':5.0,'slippageBps':1.0,'sessionMinutes':5}
RISK_PROFILES = {'conservative':.25,'balanced':.5,'aggressive':1.0}

def validate_config(value):
    if value is None or value is False: return None
    if not isinstance(value,dict): raise ValueError('Paper simulation settings must be an object')
    out={}
    profile=value.get('riskProfile',DEFAULTS['riskProfile'])
    if not isinstance(profile,str) or profile not in RISK_PROFILES: raise ValueError('Choose a supported risk profile')
    out['riskProfile']=profile
    for key,default in DEFAULTS.items():
        if key=='riskProfile': continue
        raw=value.get(key,default)
        if isinstance(raw,bool): raise ValueError('Invalid paper '+key)
        try: n=float(raw)
        except (TypeError,ValueError): raise ValueError('Invalid paper '+key) from None
        if not math.isfinite(n): raise ValueError('Invalid paper '+key)
        out[key]=n
    if not 100<=out['capital']<=1000000: raise ValueError('Paper capital must be $100–$1,000,000')
    out['riskPct']=RISK_PROFILES[profile]
    if not .01<=out['riskPct']<=2: raise ValueError('Paper risk must be 0.01–2% per trade')
    if not .01<=out['maxRiskUsd']<=out['capital']: raise ValueError('Maximum dollar risk must be between $0.01 and starting capital')
    if not 10<=out['maxNotional']<=out['capital']: raise ValueError('Paper position cap must be $10–starting capital')
    if not 0<=out['feeBps']<=100 or not 0<=out['slippageBps']<=100: raise ValueError('Fee and slippage assumptions must be 0–100 bps')
    if not out['sessionMinutes'].is_integer() or not 1<=out['sessionMinutes']<=120: raise ValueError('Paper Jev sessions must be 1–120 minutes')
    strategy=value.get('strategy','band-swing')
    if strategy not in ('band-swing','price-action','five-minute'): raise ValueError('Choose a supported paper strategy')
    out['sessionMinutes']=int(out['sessionMinutes']);out['version']=PRICE_ACTION_VERSION if strategy=='price-action' else VERSION
    if strategy in ('price-action','five-minute'): out['strategy']=strategy
    if strategy=='five-minute':
        raw=value.get('takerFeeBps',4.5)
        if isinstance(raw,bool): raise ValueError('Invalid taker fee')
        try: fee=float(raw)
        except (TypeError,ValueError): raise ValueError('Invalid taker fee') from None
        if not math.isfinite(fee) or not 0<=fee<=100: raise ValueError('Taker fee must be 0–100 bps')
        if out['sessionMinutes']%5: raise ValueError('Five-minute strategy needs a session length divisible by five')
        out.update(version=FIVE_MINUTE_VERSION,takerFeeBps=fee,forecastMinutes=5,executionMinutes=1,maxHoldMinutes=15,limitTtlMinutes=5)
        preset=value.get('entryPreset','strict')
        if preset not in ('strict','exploration'): raise ValueError('Choose strict or exploration entry preset')
        if preset=='exploration':
            out.update(version=EXPLORATION_VERSION,entryPreset=preset,stopModel='calibrated-band-structure',entryConfirmation='passive',reserveTargetSlippage=False)
            for key,default,lo,hi in [('costMargin',1.25,1,5),('minNetRewardRisk',.25,.05,5)]:
                raw=value.get(key,default)
                if isinstance(raw,bool): raise ValueError('Invalid '+key)
                try: n=float(raw)
                except (TypeError,ValueError): raise ValueError('Invalid '+key) from None
                if not math.isfinite(n) or not lo<=n<=hi: raise ValueError(key+' outside supported bounds')
                out[key]=n
            if 'stopBufferAtr' in value:
                raw=value['stopBufferAtr']
                if isinstance(raw,bool): raise ValueError('Invalid stop volatility buffer')
                try: buffer=float(raw)
                except (TypeError,ValueError): raise ValueError('Invalid stop volatility buffer') from None
                if not math.isfinite(buffer) or not 0<=buffer<=3: raise ValueError('Stop volatility buffer must be 0–3 times 1m ATR')
                if buffer>0: out.update(version=BUFFERED_VERSION,stopBufferAtr=buffer,stopModel='calibrated-band-structure-1m-atr')
    return out

def _percentile(values, fraction):
    if not values: return 0.0
    ordered=sorted(values);position=(len(ordered)-1)*fraction;lower=math.floor(position);upper=math.ceil(position)
    return ordered[lower]+(ordered[upper]-ordered[lower])*(position-lower)

def _sar_direction(bars):
    """Return the last completed-bar PSAR direction and value (0.02 / 0.20)."""
    if len(bars)<3:return None,None
    up=bars[1]['close']>=bars[0]['close']
    sar=min(bars[0]['low'],bars[1]['low']) if up else max(bars[0]['high'],bars[1]['high'])
    extreme=max(bars[0]['high'],bars[1]['high']) if up else min(bars[0]['low'],bars[1]['low'])
    af=.02
    for i in range(2,len(bars)):
        bar=bars[i];next_sar=sar+af*(extreme-sar)
        next_sar=min(next_sar,bars[i-1]['low'],bars[i-2]['low']) if up else max(next_sar,bars[i-1]['high'],bars[i-2]['high'])
        if up and bar['low']<=next_sar:
            up=False;sar=extreme;extreme=bar['low'];af=.02
        elif not up and bar['high']>=next_sar:
            up=True;sar=extreme;extreme=bar['high'];af=.02
        else:
            sar=next_sar
            if up and bar['high']>extreme:extreme=bar['high'];af=min(.20,af+.02)
            if not up and bar['low']<extreme:extreme=bar['low'];af=min(.20,af+.02)
    return ('UP' if up else 'DOWN'),sar

def plan(row,previous,config):
    if config.get('version') in (FIVE_MINUTE_VERSION,EXPLORATION_VERSION,BUFFERED_VERSION):
        from jev_five_minute import plan as five_plan
        return five_plan(row,previous,config)
    if config.get('version')==PRICE_ACTION_VERSION:
        from jev_price_action import plan as price_plan
        return price_plan(row,previous,config,_plan_band,_sar_direction)
    return _plan_band(row,previous,config)

def _plan_band(row,previous,config):
    """Freeze a new edge entry or carry a paper position before target OHLC is known."""
    prior=[r for r in previous if r['targetTime']<row['targetTime'] and r.get('actual') and r.get('resolvedAt',float('inf'))<=row['createdAt']]
    balance=config['capital']+sum(r.get('paperTrade',{}).get('netPnl',0) for r in prior)
    scored=[r for r in prior if r.get('comparisonEligible') and r.get('jev',{}).get('result')][-10:]
    hits=sum(bool(r['jev']['result']['contained']) for r in scored)
    score=(hits+1)/(len(scored)+2)  # Smoothed prior containment, not win probability.
    low_misses=[max(0.0,r['jev']['low']-r['actual']['low']) for r in scored]
    high_misses=[max(0.0,r['actual']['high']-r['jev']['high']) for r in scored]
    low_positive=[x for x in low_misses if x>0];high_positive=[x for x in high_misses if x>0]
    frozen=row.get('returnedAt',row['createdAt'])
    p={'version':config.get('version',VERSION),'targetTime':row['targetTime'],'status':'skipped','reason':'No timely valid Jev channel','balanceBefore':round(balance,8),'priorSamples':len(scored),'priorContained':hits,'containmentScore':score,'stopFraction':.25+.5*(1-score),'lowMissSamples':len(low_positive),'highMissSamples':len(high_positive),'frozenAt':frozen,'sessionClose':len(previous)+1>=config['sessionMinutes']}
    last_outcome=previous[-1].get('paperTrade',{}) if previous else {}
    open_trade=last_outcome if last_outcome.get('status')=='open' else None
    working_order=last_outcome if last_outcome.get('status')=='working' else None
    valid=row.get('status')=='predicted' and row.get('comparisonEligible') and row.get('jev')
    tick=row['tick']
    if not valid and not open_trade:
        if working_order:
            age=int(working_order.get('orderAge',0))+1
            if age>=5:
                p.update(status='cancelled',reason='Resting limit canceled after five candles without a fresh valid Jev channel',side=working_order['side'],entry=working_order['entry'],orderAge=age,orderAction='CANCELLED',entryEdge=working_order.get('entryEdge'))
                return p
            p.update({k:working_order.get(k) for k in ('side','entry','target','stop','initialStop','quantity','riskBudget','maxRiskUsd','plannedRisk','entryEdge','channelLow','channelHigh','rangeWidth','sarDirection','sarValue','orderPlacedAt')})
            p.update(status='working',reason='Keep resting limit while Jev is unavailable; cancel after five candles without a fresh channel',orderAge=age,orderAction='UNCHANGED',previousClose=row.get('completedInput',[])[-1].get('close') if row.get('completedInput') else None)
        return p

    raw_low=raw_high=raw_width=low=high=width=atr14=None
    if valid:
        raw_low,raw_high=row['jev']['low'],row['jev']['high'];raw_width=raw_high-raw_low
        p.update(rawChannelLow=raw_low,rawChannelHigh=raw_high,rawChannelWidth=raw_width)
        bars=row.get('directionInput',row.get('completedInput',[]))
        if len(bars)<3:
            if not open_trade:
                p['reason']='Need three completed candles for Parabolic SAR'
                if working_order:p.update(status='cancelled',side=working_order['side'],entry=working_order['entry'],orderAction='CANCELLED')
                return p
        sar_direction,sar_value=_sar_direction(bars) if len(bars)>=3 else (None,None)
        if sar_direction is None and not open_trade:
            p['reason']='Parabolic SAR is not ready'
            if working_order:p.update(status='cancelled',side=working_order['side'],entry=working_order['entry'],orderAction='CANCELLED')
            return p
        true_ranges=[max(b['high']-b['low'],abs(b['high']-bars[i-1]['close']),abs(b['low']-bars[i-1]['close'])) for i,b in enumerate(bars) if i]
        atr14=sum(true_ranges[-14:])/min(14,len(true_ranges)) if true_ranges else raw_width
        # Use the 90th percentile of prior realized misses so each edge covers
        # most observed Jev overshoots. Two misses are required; a hard volatility
        # cap prevents one old shock from making an unbounded paper stop.
        low_pad=_percentile(low_positive,.90) if len(low_positive)>=2 else 0.0
        high_pad=_percentile(high_positive,.90) if len(high_positive)>=2 else 0.0
        max_pad=max(0.0,min(2*raw_width,2*atr14))
        low_pad=min(max_pad,low_pad);high_pad=min(max_pad,high_pad)
        low=math.floor((raw_low-low_pad)/tick+1e-9)*tick
        high=math.ceil((raw_high+high_pad)/tick-1e-9)*tick
        width=high-low
        p.update(channelLow=low,channelHigh=high,channelWidth=width,lowExpansion=raw_low-low,highExpansion=high-raw_high,calibrationSamples=len(scored),calibrationRule='90th percentile of prior positive Jev extreme misses; capped at the smaller of 2x ATR and 2x raw width',sarDirection=sar_direction,sarValue=sar_value,rawSarDirection=sar_direction)
        if width<4*tick and not open_trade:
            p['reason']='Channel is smaller than four analysis ticks'
            if working_order:p.update(status='cancelled',side=working_order['side'],entry=working_order['entry'],orderAction='CANCELLED')
            return p

    if open_trade:
        side=open_trade['side'];long=side=='LONG'
        stop=open_trade['stop']
        if valid and width>0:
            candidate=(math.floor((low-width*p['stopFraction'])/tick+1e-9)*tick if long else math.ceil((high+width*p['stopFraction'])/tick-1e-9)*tick)
            # Keep the stop beyond the latest calibrated Jev band, but never widen
            # risk after entry: only move it toward price.
            stop=max(stop,candidate) if long else min(stop,candidate)
        p.update(previousClose=row.get('completedInput',[])[-1].get('close') if row.get('completedInput') else None,status='holding',reason='Carry open position; wait for Jev-band target or protective stop',side=side,entry= open_trade['entry'],entryFill=open_trade['entryFill'],quantity=open_trade['quantity'],stop=stop,target=open_trade.get('target'),initialStop=open_trade.get('initialStop',open_trade['stop']),plannedRisk=open_trade.get('plannedRisk'),riskBudget=open_trade.get('riskBudget'),maxRiskUsd=config['maxRiskUsd'],entryEdge=open_trade.get('entryEdge'),channelLow=low if valid else open_trade.get('channelLow'),channelHigh=high if valid else open_trade.get('channelHigh'),positionOpenedAt=open_trade.get('openedAt'),closeUpProbability=row.get('closeDirection',{}).get('probabilityCloseUp'))
        return p

    if balance<=0:
        p['reason']='Paper balance exhausted'
        if working_order:p.update(status='cancelled',side=working_order['side'],entry=working_order['entry'],orderAction='CANCELLED')
        return p
    up=lambda x:math.ceil(x/tick-1e-9)*tick
    down=lambda x:math.floor(x/tick+1e-9)*tick
    buy=down(low);sell=up(high)
    if buy>=sell:
        p['reason']='Rounded channel-edge limits overlap'
        if working_order:p.update(status='cancelled',side=working_order['side'],entry=working_order['entry'],orderAction='CANCELLED')
        return p
    side='LONG' if sar_direction=='UP' else 'SHORT'
    edge='LOWER' if side=='LONG' else 'UPPER'
    entry=buy if side=='LONG' else sell
    stop=down(low-width*p['stopFraction']) if side=='LONG' else up(high+width*p['stopFraction'])
    if stop<=0:
        p['reason']='Stop is nonpositive'
        if working_order:p.update(status='cancelled',side=working_order['side'],entry=working_order['entry'],orderAction='CANCELLED')
        return p
    slip=config['slippageBps']/10000;fee=config['feeBps']/10000
    # A limit entry does not pay assumed entry slippage; reserve costs for the
    # stop exit and both-side fees when sizing the resting order.
    risk_per_unit=abs(entry-stop)+stop*slip+(entry+stop)*fee
    risk_budget=min(balance*config['riskPct']/100,config['maxRiskUsd'])
    qty=min(risk_budget/risk_per_unit,min(config['maxNotional'],balance)/(entry*(1+slip)*(1+fee)))
    qty=math.floor(qty*1e8)/1e8
    if qty<=0:
        p['reason']='Position rounds to zero'
        if working_order:p.update(status='cancelled',side=working_order['side'],entry=working_order['entry'],orderAction='CANCELLED')
        return p
    target=(high if side=='LONG' else low) if config.get('version',VERSION)==VERSION else None
    action='AMENDED' if working_order else 'PLACED'
    if working_order and working_order.get('side')!=side: action='REPLACED_AFTER_SAR_FLIP'
    order_age=(int(working_order.get('orderAge',0))+1 if working_order and action=='AMENDED' else 0)
    p.update(previousClose=row.get('completedInput',[])[-1].get('close') if row.get('completedInput') else None,status='working',reason='Resting limit at the current SAR-aligned calibrated Jev band; no market entry',side=side,entryEdge=edge,buyLevel=buy,sellLevel=sell,entry=entry,limitPrice=entry,target=target,stop=stop,initialStop=stop,rangeLow=low,rangeHigh=high,rangeWidth=width,quantity=qty,riskBudget=risk_budget,maxRiskUsd=config['maxRiskUsd'],plannedRisk=risk_per_unit*qty,plannedNetReward=None,closeUpProbability=row.get('closeDirection',{}).get('probabilityCloseUp'),orderAge=order_age,orderAction=action,orderPlacedAt=working_order.get('orderPlacedAt') if working_order and action=='AMENDED' else row['targetTime'])
    return p

def _settle_legacy(p,actual,config):
    """Paper fills from OHLC only; unknown intrabar path is never invented."""
    base={'version':config.get('version',VERSION),'targetTime':actual['time'],'status':'skipped','reason':p.get('reason','No entry plan'),'balanceAfter':p.get('balanceBefore',0),'netPnl':0}
    if p.get('status') not in ('armed','holding'):return base
    side=p['side'];long=side=='LONG';stop=p['stop'];target=p.get('target');is_new=p['status']=='armed';marketable=False
    if is_new:
        entry=p['entry']
        if (long and actual['open']<=stop) or (not long and actual['open']>=stop):
            return {**base,'reason':'Opening gap beyond stop; entry cancelled'}
        marketable=actual['open']<=entry if long else actual['open']>=entry
        touched=marketable or actual['low']<=entry<=actual['high']
        if not touched:return {**base,'reason':'Entry level not reached'}
        entry_fill=entry*(1+(1 if long else -1)*config['slippageBps']/10000)
        quantity=p['quantity'];initial_stop=p.get('initialStop',stop);opened_at=actual['time']
    else:
        entry=p['entry'];entry_fill=p['entryFill'];quantity=p['quantity'];initial_stop=p.get('initialStop',stop);opened_at=p.get('positionOpenedAt')
    stop_hit=actual['low']<=stop if long else actual['high']>=stop
    target_hit=(actual['high']>=target if long else actual['low']<=target) if target is not None else False
    previous_close=p.get('previousClose')
    # Older saved positions without a frozen Jev target keep their original quick-close rule.
    favorable_close=(actual['close']>previous_close if long else actual['close']<previous_close) if previous_close is not None else False
    if stop_hit:
        exit_level=stop;reason='STOP'
    elif is_new and target_hit and not marketable and not p.get('sessionClose'):
        # If entry and target were both reached intrabar, OHLC cannot establish their order.
        return {**base,'status':'open','reason':'Entry and target touched; intrabar order unknown','side':side,'setup':p.get('sarDirection','')+' SAR · '+str(p.get('entryEdge','')).lower()+' Jev edge','sarDirection':p.get('sarDirection'),'entryEdge':p.get('entryEdge'),'quantity':quantity,'entry':entry,'entryFill':entry_fill,'stop':stop,'target':target,'initialStop':initial_stop,'plannedRisk':p.get('plannedRisk'),'riskBudget':p.get('riskBudget'),'openedAt':opened_at,'channelLow':p.get('channelLow'),'channelHigh':p.get('channelHigh'),'balanceAfter':base['balanceAfter'],'netPnl':0,'ambiguous':True,'timing':'One-minute OHLC; exact entry/exit timestamps unavailable'}
    elif target_hit and not (is_new and not marketable):
        exit_level=target;reason='JEV_BAND_TARGET'
    elif target is None and favorable_close:
        exit_level=actual['close'];reason='FAVORABLE_CLOSE'
    elif p.get('sessionClose'):
        exit_level=actual['close'];reason='SESSION_END'
    else:
        return {**base,'status':'open','reason':'Position open; waiting for Jev-band target or protective stop','side':side,'setup':p.get('sarDirection','')+' SAR · '+str(p.get('entryEdge','')).lower()+' Jev edge','sarDirection':p.get('sarDirection'),'entryEdge':p.get('entryEdge'),'quantity':quantity,'entry':entry,'entryFill':entry_fill,'stop':stop,'target':target,'initialStop':initial_stop,'plannedRisk':p.get('plannedRisk'),'riskBudget':p.get('riskBudget'),'openedAt':opened_at,'channelLow':p.get('channelLow'),'channelHigh':p.get('channelHigh'),'balanceAfter':base['balanceAfter'],'netPnl':0,'timing':'One-minute OHLC; exact entry/exit timestamps unavailable'}
    direction=1 if long else -1;slip=config['slippageBps']/10000
    exit_fill=exit_level*(1-direction*slip)
    gross=direction*(exit_level-entry)*quantity
    slippage=(entry+exit_level)*quantity*slip
    fees=(entry_fill+exit_fill)*quantity*config['feeBps']/10000
    net=gross-slippage-fees
    return {**base,'status':'closed','reason':reason,'side':side,'setup':p.get('sarDirection','')+' SAR · '+str(p.get('entryEdge','')).lower()+' Jev edge','sarDirection':p.get('sarDirection'),'sarValue':p.get('sarValue'),'entryEdge':p.get('entryEdge'),'quantity':quantity,'entry':entry,'target':target,'exit':exit_level,'entryFill':entry_fill,'exitFill':exit_fill,'stop':stop,'initialStop':initial_stop,'grossPnl':round(gross,8),'fees':round(fees,8),'slippage':round(slippage,8),'netPnl':round(net,8),'balanceAfter':round(p.get('balanceBefore',0)+net,8),'ambiguous':bool(stop_hit and target_hit),'timing':'One-minute OHLC; exact entry/exit timestamps unavailable','containmentScore':p.get('containmentScore'),'priorSamples':p.get('priorSamples'),'plannedRisk':p.get('plannedRisk'),'riskBudget':p.get('riskBudget')}

def settle(p,actual,config):
    """Resolve a persistent paper limit from candle OHLC; never send broker orders."""
    if config.get('version') in (FIVE_MINUTE_VERSION,EXPLORATION_VERSION,BUFFERED_VERSION):
        from jev_five_minute import settle as five_settle
        return five_settle(p,actual,config)
    if config.get('version')==PRICE_ACTION_VERSION:
        from jev_price_action import settle as price_settle
        return price_settle(p,actual,config,settle)
    if config.get('version')!=VERSION:
        return _settle_legacy(p,actual,config)
    base={'version':config.get('version',VERSION),'targetTime':actual['time'],'status':'skipped','reason':p.get('reason','No entry plan'),'balanceAfter':p.get('balanceBefore',0),'netPnl':0}
    if p.get('status') not in ('working','holding'): return {**base,'status':p.get('status','skipped'),'reason':p.get('reason','No working order')}
    side=p['side'];long=side=='LONG';stop=p['stop'];target=p.get('target');is_new=p['status']=='working';limit=p.get('limitPrice',p.get('entry'))
    if is_new:
        if p.get('sessionClose'):
            return {**base,'status':'cancelled','reason':'Session ended before the resting limit filled','side':side,'entry':limit,'limitPrice':limit,'orderAge':p.get('orderAge',0),'orderAction':'CANCELLED'}
        if (long and actual['open']<=stop) or (not long and actual['open']>=stop):
            return {**base,'status':'cancelled','reason':'Opening gap beyond protective stop; resting limit canceled','side':side,'entry':limit,'limitPrice':limit,'orderAge':p.get('orderAge',0),'orderAction':'CANCELLED'}
        marketable=actual['open']<=limit if long else actual['open']>=limit
        touched=marketable or actual['low']<=limit<=actual['high']
        if not touched:
            return {**base,'status':'working','reason':'Resting limit not touched; order remains active','side':side,'entry':limit,'limitPrice':limit,'stop':stop,'initialStop':p.get('initialStop',stop),'target':target,'quantity':p['quantity'],'plannedNetReward':p.get('plannedNetReward'),'netRewardRisk':p.get('netRewardRisk'),'roundTripCostPerUnit':p.get('roundTripCostPerUnit'),'setup':p.get('setup'),'stopRule':p.get('stopRule'),'stopBuffer':p.get('stopBuffer'),'executionAtr':p.get('executionAtr'),'riskBudget':p.get('riskBudget'),'plannedRisk':p.get('plannedRisk'),'channelLow':p.get('channelLow'),'channelHigh':p.get('channelHigh'),'entryEdge':p.get('entryEdge'),'sarDirection':p.get('sarDirection'),'orderAge':p.get('orderAge',0),'orderAction':p.get('orderAction'),'orderPlacedAt':p.get('orderPlacedAt'),'balanceAfter':base['balanceAfter'],'netPnl':0}
        # A limit can fill at its price or better on an opening gap, never worse.
        entry_fill=min(limit,actual['open']) if long else max(limit,actual['open'])
        quantity=p['quantity'];initial_stop=p.get('initialStop',stop);opened_at=actual['time']
    else:
        entry=p['entry'];entry_fill=p['entryFill'];quantity=p['quantity'];initial_stop=p.get('initialStop',stop);opened_at=p.get('positionOpenedAt')
    entry=limit if is_new else p['entry']
    stop_hit=actual['low']<=stop if long else actual['high']>=stop
    target_hit=(actual['high']>=target if long else actual['low']<=target) if target is not None else False
    if is_new and target_hit and not marketable and not stop_hit:
        return {**base,'status':'open','reason':'Limit and opposite band both touched; OHLC cannot establish fill then target order','side':side,'setup':p.get('sarDirection','')+' SAR · '+str(p.get('entryEdge','')).lower()+' Jev band limit','sarDirection':p.get('sarDirection'),'entryEdge':p.get('entryEdge'),'quantity':quantity,'entry':entry,'entryFill':entry_fill,'stop':stop,'target':target,'initialStop':initial_stop,'plannedRisk':p.get('plannedRisk'),'riskBudget':p.get('riskBudget'),'openedAt':opened_at,'channelLow':p.get('channelLow'),'channelHigh':p.get('channelHigh'),'balanceAfter':base['balanceAfter'],'netPnl':0,'ambiguous':True,'timing':'One-minute OHLC; exact entry/exit timestamps unavailable'}
    if stop_hit:
        exit_level=stop;reason='STOP'
    elif target_hit:
        exit_level=target;reason='JEV_BAND_TARGET'
    elif p.get('sessionClose'):
        exit_level=actual['close'];reason='SESSION_END'
    else:
        return {**base,'status':'open','reason':'Position open; waiting for opposite Jev-band touch or protective stop','side':side,'setup':p.get('sarDirection','')+' SAR · '+str(p.get('entryEdge','')).lower()+' Jev band limit','sarDirection':p.get('sarDirection'),'entryEdge':p.get('entryEdge'),'quantity':quantity,'entry':entry,'entryFill':entry_fill,'stop':stop,'target':target,'initialStop':initial_stop,'plannedRisk':p.get('plannedRisk'),'riskBudget':p.get('riskBudget'),'openedAt':opened_at,'channelLow':p.get('channelLow'),'channelHigh':p.get('channelHigh'),'balanceAfter':base['balanceAfter'],'netPnl':0,'timing':'One-minute OHLC; exact entry/exit timestamps unavailable'}
    direction=1 if long else -1;slip=config['slippageBps']/10000;exit_fill=exit_level*(1-direction*slip)
    gross=direction*(exit_level-entry_fill)*quantity
    slippage=exit_level*quantity*slip
    fees=(entry_fill+exit_fill)*quantity*config['feeBps']/10000
    net=gross-slippage-fees
    return {**base,'status':'closed','reason':reason,'side':side,'setup':p.get('sarDirection','')+' SAR · '+str(p.get('entryEdge','')).lower()+' Jev band limit','sarDirection':p.get('sarDirection'),'sarValue':p.get('sarValue'),'entryEdge':p.get('entryEdge'),'quantity':quantity,'entry':entry,'target':target,'exit':exit_level,'entryFill':entry_fill,'exitFill':exit_fill,'stop':stop,'initialStop':initial_stop,'grossPnl':round(gross,8),'fees':round(fees,8),'slippage':round(slippage,8),'netPnl':round(net,8),'balanceAfter':round(p.get('balanceBefore',0)+net,8),'ambiguous':bool(stop_hit and target_hit),'timing':'One-minute OHLC; exact entry/exit timestamps unavailable','containmentScore':p.get('containmentScore'),'priorSamples':p.get('priorSamples'),'plannedRisk':p.get('plannedRisk'),'riskBudget':p.get('riskBudget')}

def statement(rows,complete=False):
    configured=[r for r in rows if r.get('paperSim')]
    if not configured:return {'enabled':False,'complete':False,'trades':[],'summary':None}
    config=dict(configured[0]['paperSim']);config.setdefault('riskProfile','legacy');config.setdefault('riskPct',.25);config.setdefault('maxRiskUsd',config['capital']*config['riskPct']/100);trades=[r['paperTrade'] for r in configured if r.get('paperTrade',{}).get('status')=='closed'];open_positions=sum(r.get('paperTrade',{}).get('status')=='open' for r in configured[-1:])
    resolved=[r for r in configured if r.get('actual')];gross=sum(t['grossPnl'] for t in trades);fees=sum(t['fees'] for t in trades);slippage=sum(t['slippage'] for t in trades);net=sum(t['netPnl'] for t in trades)
    equity=config['capital'];peak=equity;drawdown=0;curve=[{'time':configured[0]['targetTime'],'equity':equity}]
    for r in resolved:
        equity+=r.get('paperTrade',{}).get('netPnl',0);peak=max(peak,equity);drawdown=max(drawdown,peak-equity);curve.append({'time':r['targetTime']+60000,'equity':round(equity,8)})
    gains=sum(max(t['netPnl'],0) for t in trades);losses=-sum(min(t['netPnl'],0) for t in trades);n=len(trades)
    api_cost=sum(r.get('estimatedUsd') or 0 for r in configured);known=all(r.get('estimatedUsd') is not None for r in configured)
    summary={'startingCapital':config['capital'],'riskProfile':config.get('riskProfile','legacy'),'riskPct':config.get('riskPct',.25),'maxRiskUsd':config.get('maxRiskUsd',config['capital']*.25/100),'grossPnl':round(gross,8),'fees':round(fees,8),'slippage':round(slippage,8),'netPnl':round(net,8),'endingCapital':round(config['capital']+net,8),'returnPct':net/config['capital']*100,'trades':n,'openPositions':open_positions,'workingOrders':sum(r.get('paperTrade',{}).get('status')=='working' for r in configured[-1:]),'longs':sum(t['side']=='LONG' for t in trades),'shorts':sum(t['side']=='SHORT' for t in trades),'wins':sum(t['netPnl']>0 for t in trades),'losses':sum(t['netPnl']<0 for t in trades),'breakeven':sum(t['netPnl']==0 for t in trades),'winRate':sum(t['netPnl']>0 for t in trades)/n if n else None,'profitFactor':gains/losses if losses else None,'noLosingTrades':bool(n and not losses),'expectancy':net/n if n else None,'maxDrawdown':round(drawdown,8),'maxDrawdownPctOfStartingCapital':drawdown/config['capital']*100,'ambiguousTrades':sum(t['ambiguous'] for t in trades),'skippedCandles':sum(r.get('paperTrade',{}).get('status')=='skipped' for r in resolved),'forecastFailures':sum(r['status']=='failed' and not r.get('forecastReused') for r in configured),'resolvedCandles':len(resolved),'plannedCandles':config['sessionMinutes'],'apiCostKnown':known,'apiCostEstimate':round(api_cost,8),'netAfterKnownApiEstimate':round(net-api_cost,8) if known else None}
    paper_version=config.get('version',VERSION)
    assumptions=['USD linear BTC units; no leverage; costs are user assumptions, not exchange quotes','Funding and borrowing costs are not modeled; fee/slippage assumptions only']
    if paper_version in (EXPLORATION_VERSION,BUFFERED_VERSION):
        assumptions.extend(['Experimental paper exploration: 60 completed 5m bars drive Jev and stable SAR; 1m candles resolve passive fills and P&L. Close direction is review-only', f"Gross target room must cover {config['costMargin']} times maker entry/target fees; net reward/risk must reach {config['minNetRewardRisk']}. No adverse slippage is reserved at a passive target", 'Place a passive SAR-aligned limit immediately when qualified; no favorable-rejection confirmation. Freeze prices and size for five minutes, cancel on SAR flip, unavailable forecast or invalidated band support', ('Stop beyond calibrated Jev edge and three preceding 1m candle extremes by one analysis tick. Band expansion uses only fully resolved prior 5m misses; no extra width/ATR padding. Stops tighten only after favorable completed closes; never widen' if paper_version==EXPLORATION_VERSION else 'Stop beyond calibrated Jev edge and recent 1m structure, padded by completed 1m ATR. Band expansion uses only fully resolved prior 5m misses. Stops tighten only after favorable completed closes; never widen'), 'Maker fees at entry/target, taker fees and adverse slippage at stops and forced exits. Stop wins ambiguous OHLC collisions; gaps may exceed modeled risk. OHLC touches do not prove queue fills', 'Exit on opposite-band target, protective stop, SAR flip, two distinct unavailable horizons, 15-minute hold or session end. New entries halt at 2% realized loss. Relaxed thresholds are experiments, not demonstrated profitability'])
        if paper_version==BUFFERED_VERSION: assumptions.append(f"v9 stop: max(one analysis tick, {config['stopBufferAtr']} times ATR(14 SMA) from completed 1m true ranges) beyond both the calibrated band and recent 3-bar structure. Recalculate only for a qualifying new order or tightening an open stop, never widen after entry. Wider risk reduces size or fails the reward/risk gate")
    elif paper_version==FIVE_MINUTE_VERSION:
        assumptions.extend(['60 completed UTC-aligned five-minute bars drive Jev high/low forecasts and SAR; a fresh forecast covers exactly the next five-minute bucket. One-minute bars monitor fills, stops and P&L', 'Calibration uses only fully resolved prior five-minute forecasts, once per bucket. Failed forecasts are unavailable for their entire horizon; cached horizons incur no extra API charge', 'SAR must agree on two completed five-minute bars. A favorable one-minute rejection qualifies a passive band-edge limit; entry/target/quantity stay fixed for up to five minutes', 'Opposite-band target; net reward at least 1.25 times modeled stop risk and gross room at least twice modeled target costs. Stops beyond band/structure with 0.75 five-minute ATR buffer, tightening only; maximum hold 15 minutes', 'Limit-entry and target fees use feeBps; stop, gap, SAR/time/session exits use takerFeeBps. Entry and target limit prices never pay adverse slippage; non-target exits use slippageBps. OHLC touches assume fills without queue evidence', 'Two distinct unavailable forecast horizons trigger an exit at the next one-minute open; 2% realized-loss threshold blocks new entries'])
    elif paper_version==PRICE_ACTION_VERSION:
        assumptions.extend(['SAR must agree across the last two completed bars; a favorable completed close and a pullback or rejection qualify the setup. Jev close-up remains review-only', 'The target is the opposite calibrated Jev band. Gross reward must cover at least twice modeled round-trip costs, and net reward must be at least 1.25 times full modeled stop risk; expansion is based only on past misses', 'Only passive band-edge limits are placed. Their entry, target, stop and quantity stay fixed for two candles. SAR flips, unavailable forecasts or band invalidation cancel immediately; there is no market chasing', 'Initial stops sit beyond both the calibrated band and recent three-bar structure with at least 0.75 ATR buffer. Stops can tighten on favorable completed price action, never widen. Adverse gaps use the opening price', 'Positions exit on stop, opposite-band target, or at the next open after an SAR flip, five-minute holding limit, or two unavailable forecasts. Stop wins ambiguous collisions; session end closes remaining positions', 'New entries halt at 2% realized session loss. Thresholds are research defaults, not evidence of profitability'])
    elif paper_version==VERSION:
        assumptions.extend(['The last completed one-minute Parabolic SAR state sets direction for new resting limits: dots below price use LONG at the lower calibrated Jev band; dots above use SHORT at the upper calibrated Jev band','A limit stays working and is amended to each fresh valid SAR-aligned Jev channel; an SAR flip replaces it at the opposite edge. If Jev is unavailable, the prior limit remains for up to five candles, then cancels','Limit entries fill only when candle OHLC reaches the level and can improve to the opening price when the market gaps favorably; no market entry or adverse entry slippage is modeled. OHLC touch cannot establish queue position or exact fill sequence','The opposite calibrated Jev band is the target. A band touch exits; protective stop takes precedence if both are touched. A working limit is canceled at session end; any open position closes at the final candle'])
    elif paper_version==PREVIOUS_VERSION:
        assumptions.extend(['The last completed one-minute Parabolic SAR state selects direction for new entries: dots below price allow longs; dots above price allow shorts','Long entries use the lower calibrated Jev band; short entries use the upper calibrated band','Each Jev edge expands to the 90th percentile of that side’s prior positive misses, requiring two misses and capped at 2x ATR or 2x raw Jev width; the protective stop stays beyond the expanded edge with an adaptive buffer','Long targets are the frozen opposite Jev-band high; short targets are the frozen opposite Jev-band low. Target touch exits at that level, with the protective stop taking precedence if both are touched in one candle. If entry and target are both touched intrabar on the entry candle, the target is not credited because OHLC cannot establish order. Jev close-up judgments are recorded for review and do not gate entries','One position at a time; while open, the Jev-band stop can tighten but never widen. The final session candle closes any remaining position'])
    elif paper_version==LEGACY_QUICK_EXIT_VERSION:
        assumptions.extend(['Legacy SAR-directed channel entries use the lower Jev band for longs and upper band for shorts','Legacy positions exit on the first close favorable to the position or the adaptive Jev-band stop; Jev close-up judgments do not gate entries','The final session candle closes any remaining position'])
    elif paper_version=='jev.range-fade.paper.v2':
        assumptions.extend(['Legacy Jev range-fade mode selects one side from the latest close relative to the raw channel midpoint','At most one trade per candle; flat at minute close'])
    elif paper_version=='jev.predictive-channel.paper.v1':
        assumptions.extend(['Five completed one-minute intervals define trend; long uses the lower Jev channel edge in an uptrend, short uses the upper edge in a downtrend','Neutral trend and nonpositive modeled reward after assumed costs skip the candle','At most one trend-aligned edge entry per candle; flat at minute close'])
    else:
        assumptions.extend(['Legacy midpoint rule chooses one side per candle; flat at minute close','Legacy sessions may include setups whose modeled reward did not cover assumed costs'])
    assumptions.extend(['A touched protective stop takes precedence when OHLC cannot establish intrabar order','No liquidity, queue position or exact tick-fill evidence is available','Stop sizing uses the full distance to the protective stop plus assumed costs; Jev containment is a calibration input, not trade-win probability','Closed-trade drawdown only; intrabar drawdown is not measurable'])
    if paper_version not in (VERSION,PRICE_ACTION_VERSION,FIVE_MINUTE_VERSION,EXPLORATION_VERSION,BUFFERED_VERSION): assumptions.append('No fill improvement from opening gaps; entry slippage follows the saved legacy model')
    return {'enabled':True,'version':paper_version,'run':configured[0]['run'],'source':configured[0]['source'],'config':config,'complete':complete,'summary':summary,'trades':trades,'decisions':[{'targetTime':r['targetTime'],'forecastStatus':r['status'],'closeDirection':r.get('closeDirection'),'plan':r.get('paperPlan'),'outcome':r.get('paperTrade')} for r in configured],'equity':curve,'assumptions':assumptions}
