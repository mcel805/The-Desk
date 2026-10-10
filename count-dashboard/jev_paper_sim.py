"""Deterministic one-candle USD paper simulator. No broker/account/order APIs."""
import math

VERSION = 'jev.range-fade.paper.v1'
DEFAULTS = {'capital':10000.0,'riskPct':.25,'maxNotional':1000.0,'feeBps':5.0,'slippageBps':1.0,'sessionMinutes':5}

def validate_config(value):
    if value is None or value is False: return None
    if not isinstance(value,dict): raise ValueError('Paper simulation settings must be an object')
    out={}
    for key,default in DEFAULTS.items():
        raw=value.get(key,default)
        if isinstance(raw,bool): raise ValueError('Invalid paper '+key)
        try: n=float(raw)
        except (TypeError,ValueError): raise ValueError('Invalid paper '+key) from None
        if not math.isfinite(n): raise ValueError('Invalid paper '+key)
        out[key]=n
    if not 100<=out['capital']<=1000000: raise ValueError('Paper capital must be $100–$1,000,000')
    if not .01<=out['riskPct']<=2: raise ValueError('Paper risk must be 0.01–2% per trade')
    if not 10<=out['maxNotional']<=out['capital']: raise ValueError('Paper position cap must be $10–starting capital')
    if not 0<=out['feeBps']<=100 or not 0<=out['slippageBps']<=100: raise ValueError('Fee and slippage assumptions must be 0–100 bps')
    if not out['sessionMinutes'].is_integer() or not 1<=out['sessionMinutes']<=30: raise ValueError('Paper Jev sessions must be 1–30 minutes')
    out['sessionMinutes']=int(out['sessionMinutes']);out['version']=VERSION
    return out

def plan(row,previous,config):
    """Called after Jev returns and before any target OHLC is supplied."""
    prior=[r for r in previous if r['targetTime']<row['targetTime'] and r.get('actual') and r.get('resolvedAt',float('inf'))<=row['createdAt']]
    balance=config['capital']+sum(r.get('paperTrade',{}).get('netPnl',0) for r in prior)
    scored=[r for r in prior if r.get('comparisonEligible') and r.get('jev',{}).get('result')][-10:]
    hits=sum(bool(r['jev']['result']['contained']) for r in scored)
    score=(hits+1)/(len(scored)+2)  # Smoothed prior containment, not win probability.
    p={'version':VERSION,'targetTime':row['targetTime'],'status':'skipped','reason':'No timely valid Jev range','balanceBefore':round(balance,8),'priorSamples':len(scored),'priorContained':hits,'containmentScore':score,'stopFraction':.25+.5*(1-score),'frozenAt':row.get('returnedAt',row['createdAt'])}
    if row.get('status')!='predicted' or not row.get('comparisonEligible') or not row.get('jev'):return p
    low,high=row['jev']['low'],row['jev']['high'];width=high-low;tick=row['tick']
    if width<4*tick:p['reason']='Range smaller than four analysis ticks';return p
    if balance<=0:p['reason']='Paper balance exhausted';return p
    up=lambda x:math.ceil(x/tick-1e-9)*tick
    down=lambda x:math.floor(x/tick+1e-9)*tick
    buy,sell=up(low+.1*width),down(high-.1*width)
    if buy>=sell:p['reason']='Rounded entry and target overlap';return p
    side='LONG' if row['completedInput'][-1]['close']<=(low+high)/2 else 'SHORT'
    entry,target=(buy,sell) if side=='LONG' else (sell,buy)
    stop=down(low-width*p['stopFraction']) if side=='LONG' else up(high+width*p['stopFraction'])
    if stop<=0:p['reason']='Stop is nonpositive';return p
    slip=config['slippageBps']/10000;fee=config['feeBps']/10000
    risk_per_unit=abs(entry-stop)+(entry+stop)*slip+(entry+stop)*(1+slip)*fee
    risk_budget=balance*config['riskPct']/100
    qty=min(risk_budget/risk_per_unit,min(config['maxNotional'],balance)/(entry*(1+slip)*(1+fee)))
    qty=math.floor(qty*1e8)/1e8
    if qty<=0:p['reason']='Position rounds to zero';return p
    cost=(entry+target)*slip+(entry+target)*(1+slip)*fee
    p.update(status='armed',reason='Frozen before target candle reveal',side=side,buyLevel=buy,sellLevel=sell,entry=entry,target=target,stop=stop,rangeLow=low,rangeHigh=high,rangeWidth=width,quantity=qty,riskBudget=risk_budget,plannedRisk=risk_per_unit*qty,plannedNetReward=(abs(target-entry)-cost)*qty)
    return p

def settle(p,actual,config):
    """OHLC touch simulation. Never infers an open/high/low/close tick path."""
    base={'version':VERSION,'targetTime':actual['time'],'status':'skipped','reason':p['reason'],'balanceAfter':p['balanceBefore'],'netPnl':0}
    if p['status']!='armed':return base
    side=p['side'];long=side=='LONG';entry=p['entry'];stop=p['stop'];target=p['target']
    if (long and actual['open']<=stop) or (not long and actual['open']>=stop):
        return {**base,'reason':'Opening gap beyond stop; entry cancelled'}
    # A resting limit is considered marketable at open, or touched later in the candle.
    marketable=actual['open']<=entry if long else actual['open']>=entry
    touched=marketable or actual['low']<=entry<=actual['high']
    if not touched:return {**base,'reason':'Entry level not reached'}
    entry_level=entry  # No favorable gap improvement is credited.
    stop_hit=actual['low']<=stop if long else actual['high']>=stop
    target_touch=actual['high']>=target if long else actual['low']<=target
    target_proven=target_touch and (marketable or (actual['close']>=target if long else actual['close']<=target))
    ambiguous=stop_hit and target_touch or target_touch and not target_proven
    if stop_hit:exit_level=stop;reason='STOP'
    elif target_proven:exit_level=target;reason='TARGET'
    else:exit_level=actual['close'];reason='MINUTE_CLOSE'
    direction=1 if long else -1;qty=p['quantity'];slip=config['slippageBps']/10000
    entry_fill=entry_level*(1+direction*slip);exit_fill=exit_level*(1-direction*slip)
    gross=direction*(exit_level-entry_level)*qty
    slippage=(entry_level+exit_level)*qty*slip
    fees=(entry_fill+exit_fill)*qty*config['feeBps']/10000
    net=gross-slippage-fees
    return {**base,'status':'closed','reason':reason,'side':side,'quantity':qty,'entry':entry_level,'exit':exit_level,'entryFill':entry_fill,'exitFill':exit_fill,'stop':stop,'target':target,'grossPnl':round(gross,8),'fees':round(fees,8),'slippage':round(slippage,8),'netPnl':round(net,8),'balanceAfter':round(p['balanceBefore']+net,8),'ambiguous':bool(ambiguous),'timing':'One-minute OHLC; exact entry/exit timestamps unavailable','containmentScore':p['containmentScore'],'priorSamples':p['priorSamples'],'plannedRisk':p['plannedRisk'],'riskBudget':p['riskBudget']}

def statement(rows,complete=False):
    configured=[r for r in rows if r.get('paperSim')]
    if not configured:return {'enabled':False,'complete':False,'trades':[],'summary':None}
    config=configured[0]['paperSim'];trades=[r['paperTrade'] for r in configured if r.get('paperTrade',{}).get('status')=='closed']
    resolved=[r for r in configured if r.get('actual')];gross=sum(t['grossPnl'] for t in trades);fees=sum(t['fees'] for t in trades);slippage=sum(t['slippage'] for t in trades);net=sum(t['netPnl'] for t in trades)
    equity=config['capital'];peak=equity;drawdown=0;curve=[{'time':configured[0]['targetTime'],'equity':equity}]
    for r in resolved:
        equity+=r.get('paperTrade',{}).get('netPnl',0);peak=max(peak,equity);drawdown=max(drawdown,peak-equity);curve.append({'time':r['targetTime']+60000,'equity':round(equity,8)})
    gains=sum(max(t['netPnl'],0) for t in trades);losses=-sum(min(t['netPnl'],0) for t in trades);n=len(trades)
    api_cost=sum(r.get('estimatedUsd') or 0 for r in configured);known=all(r.get('estimatedUsd') is not None for r in configured)
    summary={'startingCapital':config['capital'],'grossPnl':round(gross,8),'fees':round(fees,8),'slippage':round(slippage,8),'netPnl':round(net,8),'endingCapital':round(config['capital']+net,8),'returnPct':net/config['capital']*100,'trades':n,'longs':sum(t['side']=='LONG' for t in trades),'shorts':sum(t['side']=='SHORT' for t in trades),'wins':sum(t['netPnl']>0 for t in trades),'losses':sum(t['netPnl']<0 for t in trades),'breakeven':sum(t['netPnl']==0 for t in trades),'winRate':sum(t['netPnl']>0 for t in trades)/n if n else None,'profitFactor':gains/losses if losses else None,'noLosingTrades':bool(n and not losses),'expectancy':net/n if n else None,'maxDrawdown':round(drawdown,8),'maxDrawdownPctOfStartingCapital':drawdown/config['capital']*100,'ambiguousTrades':sum(t['ambiguous'] for t in trades),'skippedCandles':sum(r.get('paperTrade',{}).get('status')=='skipped' for r in resolved),'forecastFailures':sum(r['status']=='failed' for r in configured),'resolvedCandles':len(resolved),'plannedCandles':config['sessionMinutes'],'apiCostKnown':known,'apiCostEstimate':round(api_cost,8),'netAfterKnownApiEstimate':round(net-api_cost,8) if known else None}
    return {'enabled':True,'version':VERSION,'run':configured[0]['run'],'source':configured[0]['source'],'config':config,'complete':complete,'summary':summary,'trades':trades,'decisions':[{'targetTime':r['targetTime'],'forecastStatus':r['status'],'plan':r.get('paperPlan'),'outcome':r.get('paperTrade')} for r in configured],'equity':curve,'assumptions':['USD linear BTC units; no leverage; costs are user assumptions, not exchange quotes','Funding and borrowing costs are not modeled; fee/slippage assumptions only','One preselected side and at most one trade per candle; flat at minute close','Stop wins ambiguous stop/target bars; target before entry is not credited','No fill improvement from opening gaps; no liquidity/queue/tick evidence','Dynamic stop uses only preceding resolved Jev containment; confidence is not win probability','Closed-trade drawdown only; intrabar drawdown is not measurable']}
