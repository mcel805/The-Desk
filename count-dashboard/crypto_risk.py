"""Paper risk units and explicit structural stop/reward gates."""
import json
import math
import threading
import time
from urllib.request import Request, urlopen

MARKETS = {'coinbase': {'BTC-USD', 'ETH-USD', 'SOL-USD'}, 'binance': {'BTCUSDT', 'ETHUSDT', 'SOLUSDT'}, 'hyperliquid': {'BTC', 'ETH', 'SOL'}}
CACHE = {}
LOCK = threading.RLock()

def asset(provider, symbol):
    if symbol not in MARKETS.get(provider, set()):
        raise ValueError('Risk tick requires a supported BTC, ETH or SOL market')
    return symbol.split('-')[0].removesuffix('USDT')

def metadata(provider, symbol):
    asset(provider, symbol)
    key = (provider, symbol)
    with LOCK:
        old = CACHE.get(key)
        if old and time.time() - old['fetchedAt'] < (3600 if old.get('ok') else 60):
            return old
        try:
            if provider == 'coinbase':
                url = 'https://api.exchange.coinbase.com/products/' + symbol
                request = Request(url, headers={'User-Agent': 'CountDeskPaperRisk/1'})
            elif provider == 'binance':
                url = 'https://api.binance.com/api/v3/exchangeInfo?symbol=' + symbol
                request = Request(url, headers={'User-Agent': 'CountDeskPaperRisk/1'})
            else:
                url = 'https://api.hyperliquid.xyz/info'
                request = Request(url, data=b'{"type":"meta"}', headers={'Content-Type':'application/json'})
            with urlopen(request, timeout=5) as response:
                data = json.load(response)
            result = {'ok':True, 'source':url, 'fetchedAt':time.time()}
            if provider == 'coinbase':
                if data.get('id') != symbol or data.get('status') != 'online':
                    raise ValueError('Product is unavailable')
                result['increment'] = float(data['quote_increment'])
            elif provider == 'binance':
                row = next(x for x in data['symbols'] if x['symbol'] == symbol and x['status'] == 'TRADING')
                result['increment'] = float(next(x for x in row['filters'] if x['filterType'] == 'PRICE_FILTER')['tickSize'])
            else:
                row = next(x for x in data['universe'] if x['name'] == symbol and not x.get('isDelisted'))
                result['sizeDecimals'] = int(row['szDecimals'])
            if 'increment' in result and (not math.isfinite(result['increment']) or result['increment'] <= 0):
                raise ValueError('Invalid exchange price increment')
        except Exception:
            result = {'ok':False, 'error':'Exchange price increment unavailable; entry blocked. Retry or configure a custom risk tick.', 'fetchedAt':time.time()}
        CACHE[key] = result
        return result

def tick(policy, provider, symbol, price):
    coin = asset(provider, symbol)
    if not policy.get('useExchangeTicks'):
        value = float(policy.get('riskTick'+coin, 0))
        if not math.isfinite(value) or value <= 0:
            raise ValueError('Choose exchange ticks or set a custom '+coin+' risk tick in Configure before an entry')
        return {'tickSize':value, 'tickBasis':'custom '+coin+' trading tick', 'tickSource':'user policy', 'tickAsOf':None}
    data = metadata(provider, symbol)
    if not data['ok']:
        raise ValueError(data['error'])
    value = data.get('increment')
    if value is None:
        # Hyperliquid perps: five significant figures and 6 - szDecimals.
        # Compute the local minimum increment at the reference entry price.
        value = max(10.0**(math.floor(math.log10(price))-4), 10.0**(-(6-data['sizeDecimals'])))
    return {'tickSize':value, 'tickBasis':'exchange minimum at entry', 'tickSource':data['source'], 'tickAsOf':int(data['fetchedAt']*1000)}

def evaluate(policy, provider, symbol, side, entry, stop, target):
    result = {'qualified':False, 'riskTicks':None, 'rewardTicks':None, 'rr':None, 'preference':'BLOCKED', 'maxStopTicks':min(30,float(policy.get('maxStopTicks',30))), 'minRR':max(3,float(policy.get('minRR',3))), 'preferredRR':max(5,float(policy.get('preferredRR',5)))}
    try:
        entry = float(entry)
        if not math.isfinite(entry) or entry <= 0:raise ValueError('Entry must be a positive finite price')
        result.update(tick(policy,provider,symbol,entry))
        if stop is None or target is None:raise ValueError('A structural stop and opposite liquidity target are required')
        stop,target=float(stop),float(target)
        if not all(math.isfinite(x) and x>0 for x in (stop,target)):raise ValueError('Stop and target must be positive finite prices')
        direction = 1 if side=='long' else -1 if side=='short' else 0
        if not direction or direction*(entry-stop)<=0 or direction*(target-entry)<=0:raise ValueError('Stop and target must be on the correct sides of entry')
        risk = abs(entry-stop);reward = abs(target-entry)
        result.update(riskTicks=risk/result['tickSize'], rewardTicks=reward/result['tickSize'], rr=reward/risk)
        if result['riskTicks'] > result['maxStopTicks']+1e-7:raise ValueError(f"Structural stop needs {result['riskTicks']:.2f} ticks; maximum {result['maxStopTicks']:g}. Setup rejected; stop not compressed.")
        if result['rr']+1e-9 < result['minRR']:raise ValueError(f"Opposite liquidity offers {result['rr']:.2f}R; minimum {result['minRR']:g}R")
        result.update(qualified=True,preference='PREFERRED' if result['rr']+1e-9>=result['preferredRR'] else 'QUALIFIED',reason='Structural risk and opposite liquidity reward gates passed (gross of costs)')
    except (ValueError,TypeError,OverflowError) as exc:
        result['reason']=str(exc)
    return result
