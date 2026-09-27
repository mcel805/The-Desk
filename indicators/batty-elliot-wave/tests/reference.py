"""Independent test oracle for v0.1 geometric rules and temporal event semantics.
Not a Pine interpreter; does not certify rendered runtime or recursive Elliott validity.
"""
from dataclasses import dataclass

@dataclass(frozen=True)
class Pivot:
    x: int
    price: float
    side: int
    known: int

def impulse(prices):
    if not 3 <= len(prices) <= 6:
        return False
    direction = 1 if prices[1] > prices[0] else -1
    p = [(v-prices[0])*direction for v in prices]
    if not (p[1] > 0 and 0 < p[2] < p[1]): return False
    if len(p) >= 4 and not p[3] > p[1]: return False
    if len(p) >= 5 and not p[1] < p[4] < p[3]: return False
    if len(p) == 6 and not (p[5] > p[3] and p[3]-p[2] >= min(p[1], p[5]-p[4])): return False
    return True

def zigzag(prices):
    if len(prices) not in (3,4): return False
    direction = 1 if prices[1] > prices[0] else -1
    p = [(v-prices[0])*direction for v in prices]
    return p[1] > 0 and 0 < p[2] < p[1] and (len(p)==3 or p[3]>p[1])

def target5(prices):
    direction = 1 if prices[1] > prices[0] else -1
    w1=abs(prices[1]-prices[0]); w3=abs(prices[3]-prices[2])
    cap=w3 if w3<w1 else w1*1.618
    target2=prices[4]+direction*cap
    if (target2-prices[3])*direction <= 0: return None
    raw=prices[4]+direction*min(w1,cap)
    floor=prices[3]+direction
    target1=max(raw,floor) if direction==1 else min(raw,floor)
    return target1,target2

def ingest(stream,pivot):
    if not stream: stream.append(pivot); return
    prev=stream[-1]
    if pivot.x<=prev.x: return
    if prev.side==pivot.side:
        if (pivot.price-prev.price)*pivot.side > 0: stream[-1]=pivot
    elif (pivot.price-prev.price)*pivot.side > 0: stream.append(pivot)

def detect(bars,length):
    stream=[];events=[]
    for known in range(length*2,len(bars)):
        x=known-length; window=bars[x-length:known+1]
        high=bars[x][0];low=bars[x][1]
        # Unique extrema fixtures avoid asserting undocumented equal-pivot tie semantics.
        ishi=high==max(v[0] for v in window) and sum(v[0]==high for v in window)==1
        islo=low==min(v[1] for v in window) and sum(v[1]==low for v in window)==1
        if ishi and islo: continue
        if ishi or islo:
            p=Pivot(x,high if ishi else low,1 if ishi else -1,known)
            ingest(stream,p);events.append(p)
    return stream,events

def outcome(issued,deadline,target,invalid,direction,bars):
    for index,hi,lo in bars:
        if index<=issued: continue
        hit=hi>=target if direction==1 else lo<=target
        fail=lo<=invalid if direction==1 else hi>=invalid
        if hit and fail: return 'Ambiguous',index
        if hit: return 'Target first',index
        if fail: return 'Invalidation first',index
        if index>=deadline: return 'Expired',index
    return 'Open',None
