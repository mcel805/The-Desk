"""Validate three observed swing anchors; measure volume at frozen channel rails."""


def enrich(raw, result, number, tape=None):
    def finite(value):
        if isinstance(value, bool):
            raise ValueError('Swing geometry numbers cannot be booleans')
        return number(value, 'swing geometry value')

    def timestamp(value, ms, bound):
        value = finite(value)
        if value < 0 or value % ms or value > bound:
            raise ValueError('Swing geometry has an invalid completed timestamp')
        return int(value)

    durations = {'1d':86400000,'4h':14400000,'1h':3600000,'30m':1800000,'15m':900000,'5m':300000,'1m':60000}
    originals = {f['timeframe']:f for f in raw['frames']}
    tape_by_time = {b['time']:b for b in tape or []}
    min_reaction = finite(raw.get('params', {}).get('minReactionATR', .75))
    if not 0 <= min_reaction <= 10:
        raise ValueError('Invalid swing reaction threshold')
    result['params']['minReactionATR'] = min_reaction
    for frame in result['frames']:
        if frame['status'] != 'available':
            continue
        tf = frame['timeframe']; ms = durations[tf]; stamp = frame['cutoff']; original = originals[tf]
        supplied = original.get('recentBars', [])
        if not isinstance(supplied, list) or not 1 <= len(supplied) <= 28:
            raise ValueError('Swing geometry requires bounded recent OHLCV')
        bars = []
        for b in supplied:
            x = {k:finite(b[k]) for k in ('open','high','low','close')}
            x['time'] = timestamp(b.get('time'), ms, stamp)
            x['volume'] = None if b.get('volume') is None else finite(b['volume'])
            if x['low'] <= 0 or x['high'] < max(x['open'], x['close'], x['low']) or x['low'] > min(x['open'], x['close']) or x['volume'] is not None and x['volume'] < 0:
                raise ValueError('Invalid swing geometry OHLCV')
            if bars and x['time'] <= bars[-1]['time']:
                raise ValueError('Swing geometry history must be chronological')
            if tf == '1m' and tape is not None:
                source = tape_by_time.get(x['time'])
                if source is None or any(source.get(k) != x[k] for k in ('open','high','low','close','volume')):
                    raise ValueError('Geometry volume bars do not match supplied completed tape')
            bars.append(x)
        if bars[-1]['time'] != stamp or any(bars[-1][k] != frame['lastBar'][k] for k in ('open','high','low','close')):
            raise ValueError('Geometry recent history does not end at frame cutoff')
        originals_by_id = {g['id']:g for g in original['channels']}
        for channel in frame['channels']:
            g = originals_by_id[channel['id']]; supplied_anchors = g.get('anchors', [])
            if not isinstance(supplied_anchors, list) or len(supplied_anchors) != 3:
                raise ValueError('Swing channel requires points 1, 2 and 3')
            anchors = []
            for role, a in enumerate(supplied_anchors, 1):
                if isinstance(a.get('role'), bool) or isinstance(a.get('side'), bool) or a.get('role') != role or a.get('side') not in (-1, 1):
                    raise ValueError('Invalid swing anchor role or side')
                time = timestamp(a.get('time'), ms, stamp)
                price = finite(a.get('price')); known = timestamp(a.get('confirmedAt'), ms, stamp)
                reaction = finite(a.get('reactionATR'))
                wick = a.get('bar', {}); high = finite(wick.get('high')); low = finite(wick.get('low'))
                if wick.get('time') != time or low <= 0 or high < low or price != (high if a['side'] == 1 else low):
                    raise ValueError('Geometry anchor must be on its observed swing wick')
                if known <= time or a.get('confirmedCloseAt') != known + ms or reaction + .000001 < min_reaction:
                    raise ValueError('Geometry swing lacks completed confirmation or sufficient reaction')
                anchors.append({'role':role,'time':time,'price':price,'side':a['side'],'confirmedAt':known,'confirmedCloseAt':known+ms,'reactionATR':reaction,'bar':{'time':time,'high':high,'low':low}})
            a, b, c = anchors
            if a['side'] != b['side'] or c['side'] != -a['side'] or not a['time'] < c['time'] < b['time']:
                raise ValueError('Channel needs same-side points 1/2 and an intervening opposite swing 3')
            if channel['anchorTimes'] != [a['time'],b['time']] or channel['anchorPrices'] != [a['price'],b['price']] or channel['confirmedAt'] != max(x['confirmedAt'] for x in anchors) or g.get('tradableAfter') != channel['confirmedAt'] + ms:
                raise ValueError('Channel identity or knowledge time conflicts with swing anchors')
            slope = (b['price']-a['price'])/(b['time']-a['time'])
            baseline = lambda t:a['price'] + slope*(t-a['time'])
            width = (c['price']-baseline(c['time'])) * -a['side']
            lo = baseline(stamp) - (width if a['side'] == 1 else 0); hi = lo + width
            tolerance = max(.00001, width*1e-9)
            if width <= 0 or any(abs(x-y)>tolerance for x,y in ((width,channel['width']),(lo,channel['lower']),(hi,channel['upper']))):
                raise ValueError('Channel rails do not match the three frozen swing wicks')
            channel.update(anchors=anchors,tradableAfter=channel['confirmedAt']+ms,median=(lo+hi)/2)
            channel['firstWickBreachAt'] = timestamp(g['firstWickBreachAt'],ms,stamp) if g.get('firstWickBreachAt') is not None else None
            if channel['firstBreakAt'] is not None and (channel['firstBreakAt'] <= channel['confirmedAt'] or channel['confirmedBreakAt'] is None or channel['confirmedBreakAt'] < channel['firstBreakAt']+ms):
                raise ValueError('Accepted break needs two later completed closes')
            # Recompute these measurements; never forward client-supplied volume opinions.
            channel['volumeContext'] = volume_context(channel, bars, ms, result['params']['wickToleranceTicks']*result['params']['tick'])
    result['method'] = 'wave-court.geometry-evidence.v2'
    return result


def volume_context(g, bars, ms, tolerance):
    a, b, c = g['anchors']; slope=(b['price']-a['price'])/(b['time']-a['time']); rows=[]
    def mean(xs):return sum(xs)/len(xs) if xs else None
    for index in range(max(0,len(bars)-8),len(bars)):
        bar=bars[index]; prior=bars[max(0,index-20):index]; value=bar['volume']; span=bar['high']-bar['low']
        valid=len(prior)==20 and all(x['volume'] is not None for x in prior) and all(y['time']-x['time']==ms for x,y in zip(prior+[bar],(prior+[bar])[1:]))
        baseline=mean([x['volume'] for x in prior]) if valid else None
        densities=[x['volume']/(x['high']-x['low']) for x in prior if x['volume'] is not None and x['high']>x['low']]
        density=value/span if value is not None and span>0 else None; density_baseline=mean(densities) if valid and len(densities)==20 else None
        volume_ratio=value/baseline if value is not None and baseline and baseline>0 else None
        density_ratio=density/density_baseline if density is not None and density_baseline and density_baseline>0 else None
        range_baseline=mean([x['high']-x['low'] for x in prior]) if valid else None; range_ratio=span/range_baseline if range_baseline and range_baseline>0 else None
        base=a['price']+slope*(bar['time']-a['time']); lo=base-(g['width'] if a['side']==1 else 0); hi=lo+g['width']; median=(lo+hi)/2
        touch=lambda edge:bar['low']<=edge+tolerance and bar['high']>=edge-tolerance
        upper,lower=touch(hi),touch(lo)
        contact='BOTH' if upper and lower else 'UPPER' if upper else 'LOWER' if lower else 'MEDIAN' if touch(median) else 'NONE'
        rejection='UPPER' if upper and bar['close']<hi-tolerance else 'LOWER' if lower and bar['close']>lo+tolerance else None
        rows.append({'time':bar['time'],'knownAt':bar['time']+ms,'high':bar['high'],'low':bar['low'],'close':bar['close'],'volume':value,'volumeRatio':volume_ratio,'density':density,'densityRatio':density_ratio,'range':span,'rangeRatio':range_ratio,'closeLocation':(bar['close']-bar['low'])/span if span else .5,'contact':contact,'rejection':rejection,'highEffortNarrowRange':volume_ratio is not None and density_ratio is not None and range_ratio is not None and volume_ratio>=1.5 and density_ratio>=1.5 and range_ratio<1,'lightParticipation':volume_ratio is not None and volume_ratio<.8})
    latest=rows[-1]; contacts=[x for x in rows if x['time']>=g['confirmedAt'] and x['contact']!='NONE'][-4:]; edges=[x for x in contacts if x['contact']!='MEDIAN']; contact=edges[-1] if edges else contacts[-1] if contacts else None
    reaction='NO_EDGE_REACTION'
    if contact:reaction=contact['rejection']+'_STALL_CANDIDATE' if contact['highEffortNarrowRange'] and contact['rejection'] else contact['rejection']+'_PRICE_REJECTION' if contact['rejection'] else 'UNRESOLVED_CONTACT'
    if g['status']=='BROKEN':reaction=g['breakState']
    follow_through='NONE'; lighter_retest=False
    if contact:
        after=[x for x in rows if x['time']>contact['time']]; upper=contact['rejection']=='UPPER'; lower=contact['rejection']=='LOWER'
        invalidated=any(x['close']>contact['high'] if upper else x['close']<contact['low'] if lower else False for x in after)
        away=any(x['close']<contact['low'] if upper else x['close']>contact['high'] if lower else False for x in after)
        sequence=[contact]+after
        gap=any(y['time']-x['time']!=ms for x,y in zip(sequence,sequence[1:]))
        follow_through='UNAVAILABLE_GAP' if gap else 'PENDING' if len(after)<2 else 'INVALIDATED' if invalidated else ('CONFIRMED_AWAY_DOWN' if upper else 'CONFIRMED_AWAY_UP') if away else 'UNRESOLVED'
        previous=next((x for x in reversed(contacts) if x['time']<contact['time'] and x['contact']==contact['contact']),None)
        if previous:
            sequence=[x for x in rows if previous['time']<=x['time']<=contact['time']]
            departed=any(x['contact'] not in (contact['contact'],'BOTH') for x in sequence[1:-1])
            continuous=all(y['time']-x['time']==ms for x,y in zip(sequence,sequence[1:]))
            lighter_retest=departed and continuous and contact['volume'] is not None and previous['volume'] is not None and contact['volume']<previous['volume'] and (contact['contact']=='UPPER' and previous['contact']=='UPPER' and contact['high']<previous['high'] or contact['contact']=='LOWER' and previous['contact']=='LOWER' and contact['low']>previous['low'])
    gapped=any(y['time']-x['time']!=ms for x,y in zip(bars[-21:],bars[-20:])) if len(bars)>=21 else any(y['time']-x['time']!=ms for x,y in zip(bars,bars[1:]))
    return {'status':'unavailable' if latest['volume'] is None else 'gapped' if gapped else 'warming_up' if latest['volumeRatio'] is None else 'available','baseline':'20 prior completed bars of reported venue volume and volume/range; not same-time RVOL','knownAt':latest['knownAt'],'latest':latest,'recentContacts':contacts,'reaction':reaction,'followThrough':follow_through,'lighterRetest':lighter_retest,'semantics':'Server-computed supporting evidence from bounded completed frame OHLCV. High effort with limited progress is a stall hypothesis, not institutional identity or an order. Median is derived; anchors remain observed wicks.'}
