"""Reference graph + exhaustive small-fixture oracle. Not a Pine runtime emulator."""
from dataclasses import dataclass
from functools import lru_cache
from reference import Pivot, impulse, zigzag, ingest

@dataclass(frozen=True)
class Node:
    lo:int
    hi:int
    degree:int
    family:str
    direction:int
    merit:float
    children:tuple


def reduce_pivots(src):
    out=src[:1]
    for i in range(2,len(src)-2):
        q,a,b=src[i],src[i-2],src[i+2]
        if (q.price-a.price)*q.side>0 and (q.price-b.price)*q.side>=0:
            ingest(out,q)
    if len(src)>1:
        ingest(out,src[-1])
        if out[0].x!=src[0].x:
            if out[0].side==src[0].side: out.insert(0,src[1])
            out.insert(0,src[0])
        if out[-1].x!=src[-1].x:
            if out[-1].side==src[-1].side: out.append(src[-2])
            out.append(src[-1])
    return out


def build(base):
    layers=[]; nodes=[]; lookup={}; ix={p.x:i for i,p in enumerate(base)}
    current=base
    for degree in range(8):
        ids=[]
        for lo in range(len(current)-2):
            for size in range(3,7):
                hi=lo+size-1
                if hi>=len(current): continue
                p=current[lo:hi+1]; prices=[v.price for v in p]; terminal=hi==len(current)-1
                for family,complete,valid in [('Impulse',size==6,impulse(prices)),('Zigzag',size==4,size<=4 and zigzag(prices))]:
                    if not valid or not (complete or terminal): continue
                    kids=[]; bounded=True
                    for leg,(a,b) in enumerate(zip(p,p[1:]),1):
                        expected='Impulse' if leg%2 else 'Zigzag'
                        child=next((lookup[(d,a.x,b.x,expected)] for d in range(degree-1,-1,-1) if (d,a.x,b.x,expected) in lookup),None)
                        kids.append(child)
                        bounded &= all(min(a.price,b.price)<=q.price<=max(a.price,b.price) for q in base[ix[a.x]:ix[b.x]+1])
                    if not bounded: continue
                    retr=abs(prices[2]-prices[1])/abs(prices[1]-prices[0])
                    merit=(size-1)*2+(0.6 if complete else 0)+0.3*max(0,1-abs(retr-.618))+sum(c is not None for c in kids)*.7
                    node=Node(lo,hi,degree,family,-p[0].side,merit,tuple(kids)); idx=len(nodes)
                    nodes.append(node); ids.append(idx)
                    if complete: lookup[(degree,p[0].x,p[-1].x,family)]=idx
        layers.append((current,ids))
        nxt=reduce_pivots(current)
        if len(nxt)>=len(current) or len(nxt)<3: break
        current=nxt
    return layers,nodes


def cover(layers,nodes,degree,rank=0):
    p,ids=layers[degree]; n=len(p); states=[[] for _ in p]; states[0]=[(0,())]
    bystart={i:[] for i in range(n)}
    for idx in ids: bystart[nodes[idx].lo].append(idx)
    def offer(end,merit,path):
        states[end].append((merit,path)); states[end].sort(key=lambda q:-q[0]);states[end]=states[end][:4]
    for start in range(n-1):
        for merit,path in tuple(states[start]):
            offer(start+1,merit-3,path+((start,start+1,None),))
            previous=nodes[path[-1][2]] if path and path[-1][2] is not None else None
            for idx in bystart[start]:
                node=nodes[idx]
                if previous and (previous.family==node.family or previous.direction==node.direction): continue
                offer(node.hi,merit+node.merit,path+((start,node.hi,idx),))
    return states[-1][rank] if len(states[-1])>rank else (-1e12,())


def exhaustive(layers,nodes,degree):
    """Unpruned exhaustive oracle for small histories; independent of the beam recurrence."""
    p,ids=layers[degree]; bystart={i:[] for i in range(len(p))}
    for idx in ids: bystart[nodes[idx].lo].append(idx)
    @lru_cache(None)
    def paths(start,previous_id):
        if start==len(p)-1:return ((0,()),)
        result=[]
        for value,path in paths(start+1,None): result.append((value-3,((start,start+1,None),)+path))
        for idx in bystart[start]:
            node=nodes[idx]
            if previous_id is not None:
                prev=nodes[previous_id]
                if prev.family==node.family or prev.direction==node.direction:continue
            for value,path in paths(node.hi,idx):result.append((value+node.merit,((start,node.hi,idx),)+path))
        return tuple(result)
    return sorted(paths(0,None),key=lambda q:-q[0])


def pivots(prices):
    return [Pivot(i,float(v),(-1 if prices[1]>prices[0] else 1)*(-1 if i%2 else 1),i+5) for i,v in enumerate(prices)]
