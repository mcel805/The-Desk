"""Read-only chart source adapters, independent of execution accounts."""
from urllib.parse import urlencode
import math

CRYPTO_SOURCES={
 'hyperliquid':{'label':'Hyperliquid · perpetual reference','quoteCurrency':'USD','marketType':'crypto-perpetual'},
 'coinbase':{'label':'Coinbase · spot USD','quoteCurrency':'USD','marketType':'crypto-spot'},
 'binance':{'label':'Binance · spot USDT reference','quoteCurrency':'USDT','marketType':'crypto-spot'}}

def validate_market(instrument):
    provider,_,symbol=str(instrument).partition(':')
    base=symbol if provider=='hyperliquid' else symbol.removesuffix('-USD') if provider=='coinbase' else symbol.removesuffix('USDT') if provider=='binance' else None
    if provider not in CRYPTO_SOURCES or base not in ('BTC','ETH','SOL') or symbol!={'hyperliquid':base,'coinbase':str(base)+'-USD','binance':str(base)+'USDT'}.get(provider):
        raise ValueError('Choose an available BTC, ETH or SOL chart source; provider aliases are not interchangeable.')
    return instrument

def binance_bars(fetch,instrument,timeframe,limit,now):
    validate_market(instrument)
    intervals={'1m':60000,'2m':120000,'3m':180000,'5m':300000,'15m':900000,'30m':1800000,'1h':3600000,'4h':14400000,'1d':86400000}
    if timeframe not in intervals:raise ValueError('Unsupported Binance interval.')
    native='1m'if timeframe=='2m'else timeframe
    query=urlencode({'symbol':instrument.split(':')[1],'interval':native,'limit':min(1000,limit*(2 if timeframe=='2m'else 1)+2)})
    data=fetch('https://data-api.binance.vision/api/v3/klines?'+query)
    if not isinstance(data,list):raise ValueError('Binance public history unavailable.')
    bars={}
    for row in data:
        if not isinstance(row,list) or len(row)<7:raise ValueError('Invalid Binance candle response.')
        b=dict(zip(('time','open','high','low','close','volume'),[int(row[0]),*[float(v)for v in row[1:6]]]))
        if not all(math.isfinite(v)for v in b.values()):raise ValueError('Invalid Binance candle values.')
        bars[b['time']]=b
    rows=sorted(bars.values(),key=lambda b:b['time'])
    if timeframe=='2m':
        buckets={}
        for b in rows:buckets.setdefault(b['time']//120000*120000,[]).append(b)
        rows=[]
        for stamp,group in sorted(buckets.items()):
            if [b['time']for b in group]==[stamp,stamp+60000] or(stamp+120000>now and group[0]['time']==stamp):
                rows.append({'time':stamp,'open':group[0]['open'],'high':max(b['high']for b in group),'low':min(b['low']for b in group),'close':group[-1]['close'],'volume':sum(b['volume']for b in group)})
    rows=rows[-limit:];ms=intervals[timeframe]
    return {'instrument':instrument,'timeframe':timeframe,'as_of':now,'bars':rows,'last_completed':next((b['time']for b in reversed(rows)if b['time']+ms<=now),None),'coverage':'Binance public market-data-only endpoint · spot USDT; not Robinhood USD execution prices. Requested '+str(limit)+' returned '+str(len(rows)),'quoteCurrency':'USDT'}
