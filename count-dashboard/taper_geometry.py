"""Market geometry questions; independently evaluated over sourced state."""
PACK='taper.market-geometry.questions.v2'
import taper_swing_geometry
FRAME_NAMES={'1d':'Daily','4h':'4H','1h':'1H','30m':'30M','15m':'15M','5m':'5M','1m':'1M'}
def questions():
    result={}
    for tf,title in FRAME_NAMES.items():
        result['geometry_'+tf]={'type':'choice','instructions':f"Classify {title} channel direction from `marketGeometry.frames` where timeframe is `{tf}`. Use all active directionCounts and bounded channel details. ACTIVE is local to its declared completed cutoff. Points 1/2 must be established same-side wick swings and point 3 is the widest opposite swing. The median is a derived line, not a fourth observed anchor. Broken references do not establish a current trend. If no active channel or cadence gaps, choose UNAVAILABLE. Do not certify an Elliott count or predict profit.",'criteria':{'RISING':'Active wick-supported channels predominantly rise.','FALLING':'Active wick-supported channels predominantly fall.','SIDEWAYS':'Active channels predominantly have flat slope.','CONFLICTED':'Opposing active channel slopes give no dominant geometric direction.','UNAVAILABLE':'Frame missing, no active wick channel, or source cadence incomplete.'}}
    common="Use only supplied completed-bar `marketGeometry` measurements, frozen three-point anchors and server-computed channel `volumeContext` and `hunt` selected levels. Unavailable context must remain unknown. No unseen candles, order book or guaranteed reversal. Each question is independent. "
    def choice(name,instructions,criteria):result[name]={'type':'choice','instructions':common+instructions,'criteria':criteria}
    choice('geometry_interaction','What is the current 1M price interaction with active channel rails? Use lastBar, interaction and position; count simultaneous conflicting rails as MIXED. Broken rails are excluded from active support/resistance.',{'LOWER_REJECTION':'Completed candle touches a lower active rail and closes away above it.','UPPER_REJECTION':'Completed candle touches an upper active rail and closes away below it.','EDGE_TOUCH':'Touches an active edge with little completed rejection evidence.','INSIDE':'Within active channels away from edges.','MIXED':'Opposing channels/both-edge contacts conflict.','UNAVAILABLE':'No active 1M channel or required measurements missing.'})
    choice('geometry_break','Assess recent 1M break quality. Use active channels with WICK_ONLY and recent accepted breaks with breakAgeBars <=8. WICK_ONLY is not a confirmed trend break; confirmed/retest states require observed two outside closes and a subsequent contact. After break, rails are historical references only.',{'INTACT':'No recent broken channel and at least one active channel.','WICK_ONLY':'Recent excursion has no two-close acceptance evidence.','ACCEPTED_UP':'Recent upward two-close break without subsequent held retest.','ACCEPTED_DOWN':'Recent downward two-close break without subsequent held retest.','RETEST_HELD_UP':'Recent upward break then observed held reference retest.','RETEST_HELD_DOWN':'Recent downward break then observed held reference retest.','REENTERED':'Recent broken channel with completed price back inside its reference corridor.','CONFLICTED':'Different recent channels give incompatible break evidence.','UNAVAILABLE':'No available break/active evidence.'})
    choice('geometry_alignment','Assess Daily/4H/1H channel context against 15M/5M/1M channels directly from frame evidence. User frame weights give higher frames more influence. Do not see other question answers. Missing required parent channels means UNAVAILABLE, not alignment.',{'UP_ALIGNED':'Higher and execution frames predominantly rise.','DOWN_ALIGNED':'Higher and execution frames predominantly fall.','PULLBACK':'Execution slopes oppose a coherent higher-frame channel trend.','CONFLICTED':'Higher frames or execution frames disagree without a clear parent.','UNAVAILABLE':'Insufficient active channels to establish higher-to-lower relationship.'})
    choice('geometry_liquidity','Does geometry currently support a reaction at a user-hunted liquidity level? Compare selected prices/sides to supplied 1M active rail levels, wick tolerance/ATR, microStructure and convergence. Higher-frame direction is context only. No unselected price is an entry. Missing risk units still block research_bias WATCH entries.',{'LOWER_SUPPORT':'A selected lower liquidity level is near qualified active lower geometry and completed support reaction.','UPPER_RESISTANCE':'A selected upper liquidity level is near qualified active upper geometry and completed resistance reaction.','BOTH_SIDES':'Both hunted sides have geometric support without a resolved reaction.','AGAINST':'Geometry is accepting through or opposing the hunted reaction.','NO_OVERLAP':'Available geometry is away from selected levels.','UNAVAILABLE':'No selected level or required active geometry available.'})
    choice('geometry_path','Which conditional market path is most supported by supplied geometry and recent completed tape? Consider all seven frames and unresolved wave alternates. This is a qualitative scenario, not a hit-first probability, an order, or guaranteed forecast. Missing/conflicting parents must favor WAIT.',{'CONTINUE_UP':'Rising context with observed acceptance supports watching continuation up.','CONTINUE_DOWN':'Falling context with observed acceptance supports watching continuation down.','ROTATE_UP':'Observed lower-edge rejection supports watching rotation toward upper liquidity.','ROTATE_DOWN':'Observed upper-edge rejection supports watching rotation toward lower liquidity.','WAIT':'Unclear, conflicting, no validated reaction, or key parent evidence missing.'})
    choice('geometry_fibonacci','Assess the supplied core-timeframe confirmed-pivot Fibonacci measurements against the completed 1M tape. They are conditional references even when chart display is off. Identify whether current interaction around active untapped/tested levels reinforces a geometry reaction. Broken or unverified levels cannot count as active support. Do not fabricate missing swing anchors.',{'SUPPORT_CONTEXT':'Unbroken Fibonacci area aligns with observed lower-edge support.','RESISTANCE_CONTEXT':'Unbroken Fibonacci area aligns with observed upper-edge resistance.','NO_ACTIVE_OVERLAP':'Available unbroken Fib references do not reinforce current geometry interaction.','BROKEN_CONTEXT':'Relevant Fib area has already been broken by completed closes.','UNAVAILABLE':'Swing anchors/levels unverified or absent.'})
    result['geometry_quality']={'type':'score','instructions':common+'Score evidence quality for the geometry read. Consider confirmed anchor reactionATR, tradableAfter, independent wickContacts, same-frame cadence, age, active versus archived references and disagreement. This is an evidence-quality rubric, not probability of profit. Points 1/2/3 define a channel; they are not three independent successful retests. Subsequent contact episodes provide extra corroboration.','criteria':['Insufficient: missing channels, gaps or conflicting geometry.','Limited: two anchor contacts with weak corroboration or missing parent context.','Moderate: extra wick contacts and consistent recent structure, but one important conflict.','Strong: corroborated active rails, recent observed reactions, complete aligned parent context.']}
    return result


def evidence(raw,provider,symbol,cutoff,number,tape=None):
    if raw is None:return None
    if not isinstance(raw,dict) or raw.get('method') not in ('wave-court.geometry-evidence.v1','wave-court.geometry-evidence.v2'):raise ValueError('Invalid market geometry method')
    src=raw.get('source',{})
    if src.get('provider')!=provider or src.get('symbol')!=symbol or src.get('completedCutoff')!=cutoff:raise ValueError('Geometry source/cutoff must match completed tape')
    durations={'1d':86400000,'4h':14400000,'1h':3600000,'30m':1800000,'15m':900000,'5m':300000,'1m':60000}
    frames=raw.get('frames')
    if not isinstance(frames,list) or len(frames)!=7 or {f.get('timeframe') for f in frames if isinstance(f,dict)}!=set(durations):raise ValueError('Geometry requires seven explicit timeframe states')
    def finite(v):
        if isinstance(v,bool):raise ValueError('Geometry numeric fields cannot be booleans')
        return number(v,'geometry value')
    def time(v,ms,bound):
        value=finite(v)
        if value<0 or value%ms or value>bound:raise ValueError('Geometry timestamp is not a completed frame anchor')
        return int(value)
    def row(fields,item):return {k:finite(item[k]) if item.get(k) is not None else None for k in fields}
    clean=[]
    for f in frames:
        tf=f['timeframe'];ms=durations[tf];weight=finite(f.get('weight',0))
        if not 0<=weight<=100:raise ValueError('Geometry timeframe weight out of bounds')
        if f.get('status')=='unavailable':clean.append({'timeframe':tf,'status':'unavailable','weight':weight,'cutoff':None,'channels':[]});continue
        stamp=time(f.get('cutoff'),ms,cutoff+60000-ms)
        if f.get('closeTime')!=stamp+ms:raise ValueError('Geometry completed-frame boundary mismatch')
        b=f.get('lastBar',{});bar=row(('open','high','low','close'),b)
        if b.get('time')!=stamp or bar['low'] is None or bar['low']<=0 or any(v is None for v in bar.values()) or bar['high']<max(bar.values()) or bar['low']>min(bar.values()):raise ValueError('Invalid geometry frame OHLC')
        channels=f.get('channels',[])
        if not isinstance(channels,list) or len(channels)>4:raise ValueError('Geometry channel details exceed the evidence bound')
        gs=[]
        for g in channels:
            if not isinstance(g,dict) or g.get('status') not in ('ACTIVE','BROKEN') or g.get('direction') not in ('UP','DOWN','FLAT'):raise ValueError('Invalid channel state')
            ts=g.get('anchorTimes',[]);prices=g.get('anchorPrices',[])
            if len(ts)!=2 or len(prices)!=2:raise ValueError('Channel needs two wick anchors')
            ts=[time(t,ms,stamp) for t in ts];prices=[finite(x) for x in prices]
            if ts[0]>=ts[1] or min(prices)<=0:raise ValueError('Channel wick anchors must be ordered positive prices')
            known=time(g.get('confirmedAt'),ms,stamp);safe=time(g.get('lastSafeAt'),ms,stamp)
            if known<ts[1] or safe<ts[1]:raise ValueError('Channel confirmation/end precedes wick anchor')
            x={**row(('wickContacts','slopePerBar','slopeATR','width','lower','upper','position','breakAgeBars'),g),'id':str(g.get('id',''))[:160],'status':g['status'],'direction':g['direction'],'anchorTimes':ts,'anchorPrices':prices,'confirmedAt':known,'lastSafeAt':safe,'referenceOnlyAfterBreak':g['status']=='BROKEN'}
            if x['wickContacts'] is None or x['wickContacts']<2 or x['width'] is None or x['width']<=0 or x['lower'] is None or x['upper'] is None or x['lower']>=x['upper']:raise ValueError('Invalid channel rail/contact measurements')
            for k,allowed in [('interaction',('BOTH_EDGES','LOWER_REJECTION','LOWER_TOUCH','UPPER_REJECTION','UPPER_TOUCH','CLOSE_ABOVE','CLOSE_BELOW','INSIDE')),('breakState',('INTACT','RETURNED_INSIDE','WICK_ONLY','CLOSE_BREAK_UP','CLOSE_BREAK_DOWN','RETEST_HELD_UP','RETEST_HELD_DOWN')),('breakDirection',('UP','DOWN','BOTH',None))]:
                if g.get(k) not in allowed:raise ValueError('Unknown geometry interaction/break state')
                x[k]=g.get(k)
            for k in ('firstBreakAt','confirmedBreakAt','retestAt'):x[k]=time(g[k],ms,stamp) if g.get(k) is not None else None
            if g['status']=='ACTIVE' and x['firstBreakAt'] is not None:raise ValueError('Active channel cannot contain a recorded break')
            if g['status']=='BROKEN' and x['firstBreakAt'] is None:raise ValueError('Broken channel needs a completed first-break bar')
            gs.append(x)
        counts=row(('activeCount','recentBreakCount','historicalBrokenCount','cadenceGaps','atr'),f)
        if any(v is not None and v<0 for v in counts.values()):raise ValueError('Negative geometry counts')
        directions=f.get('directionCounts',{});directions={k:finite(directions.get(k,0)) for k in ('UP','DOWN','FLAT')}
        if sum(directions.values())!=counts['activeCount']:raise ValueError('Channel direction coverage mismatch')
        clean.append({'timeframe':tf,'status':'available','cutoff':stamp,'closeTime':stamp+ms,'weight':weight,'lastBar':{'time':stamp,**bar},**counts,'directionCounts':directions,'channels':gs,'detailCoverage':str(f.get('detailCoverage',''))[:300]})
    def bounded_rows(name,maxrows,fields):
        xs=raw.get(name,[])
        if not isinstance(xs,list) or len(xs)>maxrows:raise ValueError('Too many geometry supporting levels')
        return [{**row(fields,x),**({k:time(x[k],60000,cutoff) if x.get(k) is not None else None for k in ('anchorTime','confirmedAt')} if name=='microStructure' else {'timeframes':[tf for tf in x.get('timeframes',[]) if tf in durations],'born':finite(x['born'])})} for x in xs]
    micro=bounded_rows('microStructure',6,('price','side','score','retests','reactionATR'))
    zones=bounded_rows('convergence',6,('lo','hi','side','weight','strength'))
    if any(x['born']>cutoff+60000 for x in zones):raise ValueError('Convergence born after completed tape')
    fib=raw.get('fibonacci');fibs=None
    if fib is not None:
        ts=[time(t,60000,cutoff) for t in fib.get('anchorTimes',[])];prices=[finite(v) for v in fib.get('anchorPrices',[])]
        if len(ts)!=2 or ts[0]>=ts[1] or len(prices)!=2 or min(prices)<=0:raise ValueError('Invalid Fibonacci wick swing')
        xs=fib.get('levels',[])
        if len(xs)!=7:raise ValueError('Invalid critical Fibonacci references')
        fib_tf=fib.get('timeframe')
        if fib_tf not in durations:raise ValueError('Unknown Fibonacci source timeframe')
        confirmed=time(fib.get('confirmedAt'),60000,cutoff+60000)
        if confirmed<ts[1]:raise ValueError('Fibonacci swing confirmation precedes anchor')
        fibs={'timeframe':fib_tf,'confirmedAt':confirmed,'measurement':str(fib.get('measurement',''))[:300],'anchorTimes':ts,'anchorPrices':prices,'conditional':True,'levels':[]} 
        for x in xs:
            if x.get('status') not in ('open','tested','broken','unverified'):raise ValueError('Unknown Fibonacci state')
            fibs['levels'].append({**row(('ratio','price'),x),'status':x['status']})
    params=raw.get('params',{});params=row(('tick','wickToleranceTicks','pivotRadius','minSpan','extraWickContacts','breakConfirmationCloses'),params)
    if params['tick'] is None or params['tick']<=0 or params['breakConfirmationCloses']!=2:raise ValueError('Invalid geometry measurement policy')
    result={'method':raw['method'],'source':{'provider':provider,'symbol':symbol,'completedCutoff':cutoff},'semantics':str(raw.get('semantics',''))[:700],'params':params,'frames':clean,'microStructure':micro,'convergence':zones,'fibonacci':fibs}
    return taper_swing_geometry.enrich(raw,result,number,tape) if raw['method']=='wave-court.geometry-evidence.v2' else result
