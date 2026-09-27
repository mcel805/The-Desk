"""Actual OHLC + Python reference output, prominently NOT a Pine-runtime screenshot."""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from matplotlib.ticker import FuncFormatter
from datetime import datetime,timezone,timedelta
from pathlib import Path
import json,sys,math,hashlib
from reference import detect
from history_reference import build,cover
root=Path(__file__).parents[1];dest=root/'validation'/'reference-images';dest.mkdir(exist_ok=True)
f=root/'validation'/'BTCUSD-D-2019-2026-coinbase-v001.json';data=json.loads(f.read_text());bars=data['bars']
piv,events=detect([(b['high'],b['low']) for b in bars],5);layers,nodes=build(piv)
dates=[datetime.fromtimestamp(b['time'],timezone.utc) for b in bars];xx=mdates.date2num(dates)
prices=[b['close'] for b in bars];last=prices[-1]
root_degree=0
for i,(p,ids) in enumerate(layers):
    if len(p)>=6:root_degree=i
    if len(p)<=36:break


def selections(degree,rank=0,maxdepth=3):
    score,path=cover(layers,nodes,degree,rank);queue=[];gaps=[]
    for a,b,idx in path:
        if idx is not None:queue.append((idx,0))
        else:
            gaps.append((layers[degree][0][a],layers[degree][0][b],0))
            # Reference display keeps unresolved parent gaps explicit. Pine can additionally
            # render admissible local paths inside those gaps. That refinement is not emulated here.
    at=0
    while at<len(queue):
        idx,depth=queue[at];at+=1
        if depth+1<maxdepth:
            queue.extend((c,depth+1) for c in nodes[idx].children if c is not None)
    return score,path,queue,gaps


def forecast(idx):
    node=nodes[idx];pp=layers[node.degree][0][node.lo:node.hi+1];p=[q.price for q in pp];stage=len(p)-1
    logproj=lambda a,o,e,r:math.exp(math.log(a)+(math.log(e)-math.log(o))*r)
    nxt=node.direction;inv=p[-1];t1=t2=None;name='Unresolved'
    if node.family=='Impulse':
        if stage==2:t1=logproj(p[-1],p[0],p[1],1.618);t2=logproj(p[-1],p[0],p[1],2);inv=p[0];name='3'
        if stage==3:
            t1=logproj(p[-1],p[-1],p[2],.236);t2=logproj(p[-1],p[-1],p[2],.382);nxt=-node.direction;name='4'
            t1=max(t1,p[1]+.01) if node.direction==1 else min(t1,p[1]-.01)
            t2=max(t2,p[1]+.01) if node.direction==1 else min(t2,p[1]-.01)
        if stage==4:
            w1=abs(p[1]-p[0]);w3=abs(p[3]-p[2]);t1=logproj(p[4],p[0],p[1],1);t2=logproj(p[4],p[0],p[1],1.618);name='5'
            if w3<w1:
                cap=p[4]+node.direction*w3;t1=min(t1,cap) if node.direction==1 else max(t1,cap);t2=min(t2,cap) if node.direction==1 else max(t2,cap)
            if (t2-p[3])*node.direction<=0:return None
        if stage==5:t1=logproj(p[-1],p[-1],p[0],.236);t2=logproj(p[-1],p[-1],p[0],.382);nxt=-node.direction;name='A'
    elif stage==2:t1=logproj(p[-1],p[0],p[1],1);t2=logproj(p[-1],p[0],p[1],1.618);inv=p[0];name='C'
    else:t1=logproj(p[-1],p[-1],p[2],.382);t2=logproj(p[-1],p[-1],p[2],.618);nxt=-node.direction;name='1/A rebound'
    if t1 is None or (last-inv)*nxt<=0:return None
    reached1=reached2=False
    if len(bars)-1-pp[-1].x>240:return None
    for bar in bars[pp[-1].x+1:]:
        fav=bar['high'] if nxt==1 else bar['low']
        reached1 |= (fav-t1)*nxt>=0
        reached2 |= (fav-t2)*nxt>=0
        if ((bar['low'] if nxt==1 else bar['high'])-inv)*nxt<=0:return None
    if reached2:return None
    if reached1:t1=t2;name+=' continuation'
    if (t1-last)*nxt<=0:return None
    return {'next':name,'target':t1,'target2':t2,'invalidation':inv,'direction':nxt,'layer':node.degree+1,'family':node.family,'stage':stage}


def draw(name,degree,depth,rank=0,recent=False):
    score,path,queue,gaps=selections(degree,rank,depth)
    plt.rcParams.update({'font.family':'DejaVu Sans','text.color':'#e6edf5','axes.labelcolor':'#c8d3e3','xtick.color':'#a9b7c9','ytick.color':'#a9b7c9'})
    fig=plt.figure(figsize=(18,10),facecolor='#111722');ax=fig.add_axes([.055,.14,.72,.70],facecolor='#111722')
    ax.vlines(xx,[b['low'] for b in bars],[b['high'] for b in bars],color='#d7dfec',linewidth=.35,alpha=.65)
    ax.plot(xx,prices,color='#d7dfec',linewidth=.45,alpha=.8)
    rendered=0
    label_totals={};label_used={}
    for idx,d in queue:
        node=nodes[idx]
        for q in layers[node.degree][0][node.lo+1:node.hi+1]:label_totals[q.x]=label_totals.get(q.x,0)+1
    for a,b,d in gaps:
        ax.plot([xx[a.x],xx[b.x]],[a.price,b.price],color='#738092',ls=':',lw=.7,alpha=.7)
        ax.annotate('?',(xx[b.x],b.price),xytext=(0,b.side*12),textcoords='offset points',ha='center',va='bottom' if b.side>0 else 'top',color='#738092',fontsize=8)
    for idx,d in queue:
        node=nodes[idx];pp=layers[node.degree][0][node.lo:node.hi+1];col=['#69b8ff','#e6edf5','#72cfc4'][min(d,2)]
        ax.plot([xx[q.x] for q in pp],[q.price for q in pp],c=col,lw=.8,alpha=.8)
        for i,q in enumerate(pp[1:],1):
            values=['I','II','III','IV','V'] if d%3==0 else [str(j) for j in range(1,6)] if d%3==1 else ['i','ii','iii','iv','v']
            v=values[i-1] if node.family=='Impulse' else ['A','B','C'][i-1]
            label=('['+v+']' if d%3==0 else '('+v+')' if d%3==1 else v)+'?'
            row=label_used.get(q.x,0);label_used[q.x]=row+1
            lift=16+14*(label_totals[q.x]-1-row)
            ax.annotate(label,(xx[q.x],q.price),xytext=(0,q.side*lift),textcoords='offset points',ha='center',va='bottom' if q.side>0 else 'top',color=col,fontsize=10 if d==0 else 8)
            rendered+=1
    candidates=[]
    for idx,d in queue:
        node=nodes[idx]
        if node.hi==len(layers[node.degree][0])-1:
            fc=forecast(idx)
            if fc and not any(c['layer']==fc['layer'] for c in candidates):
                fc['node_id']=idx
                candidates.append(fc)
    for i,fc in enumerate(candidates[:2]):
        end=xx[-1]+100*(i+1)
        ax.plot([xx[-1],end],[last,fc['target']],color='#e8be6b',ls='--',lw=1.1)
        ax.plot([xx[-1],end],[fc['invalidation']]*2,color='#ff7586',ls='--',lw=.7)
        ax.annotate(f"L{fc['layer']} {fc['next']}?\n${fc['target']:,.0f}",(end,fc['target']),xytext=(8,0),textcoords='offset points',color='#e8be6b',fontsize=10)
        if fc['family']=='Impulse' and fc['stage']==2 and 'continuation' not in fc['next']:
            node=nodes[fc['node_id']];pp=layers[node.degree][0][node.lo:node.hi+1]
            four=fc['target']*(pp[-1].price/fc['target'])**.382
            limit=pp[1].price+node.direction*.01
            four=max(four,limit) if node.direction>0 else min(four,limit)
            five=four*(pp[1].price/pp[0].price)
            if (five-fc['target'])*node.direction>0:
                ax.plot([end,end+100,end+200],[fc['target'],four,five],color='#e8be6b',ls=':',lw=.9)
                ax.annotate('4?',(end+100,four),xytext=(0,8),textcoords='offset points',ha='center',color='#e8be6b',fontsize=10)
                ax.annotate('5?',(end+200,five),xytext=(0,-15),textcoords='offset points',ha='center',color='#e8be6b',fontsize=10)
    ax.set_yscale('log');ax.yaxis.set_major_formatter(FuncFormatter(lambda v,pos:f'{v:,.0f}'))
    ax.set_xlim(xx[-1]-650 if recent else xx[0]-50,xx[-1]+450);ax.set_ylim(2500,185000)
    if recent:ax.set_ylim(17000,180000)
    ax.xaxis.set_major_locator(mdates.YearLocator() if not recent else mdates.MonthLocator(interval=3));ax.xaxis.set_major_formatter(mdates.DateFormatter('%Y' if not recent else '%b %Y'))
    ax.grid(axis='y',color='#293343',lw=.45,alpha=.5)
    for spine in ax.spines.values():spine.set_color('#293343')
    fig.text(.055,.93,'BATTY — ELLIOT WAVE',fontsize=22,weight='bold',color='#69b8ff')
    fig.text(.055,.89,f'BTC-USD • DAILY • {dates[0]:%d %b %Y} – {dates[-1]:%d %b %Y} • {len(bars):,} bars',fontsize=12)
    fig.text(.055,.855,'REFERENCE ENGINE RENDER — NOT A TRADINGVIEW / PINE RUNTIME SCREENSHOT',fontsize=10,color='#e8be6b',weight='bold')
    fig.text(.805,.81,'COUNT CONTEXT',fontsize=11,color='#69b8ff',weight='bold')
    counted=sum(b-a for a,b,idx in path if idx is not None)
    summary=f'Root layer: {degree+1} of {len(layers)}\nDisplay depth: {depth}\nInterpretation rank: {rank+1}\nRoot legs interpreted: {counted}/{len(layers[degree][0])-1}\nUnresolved root legs: {len(gaps)}\nPattern labels rendered: {rendered}\n\n? = provisional count\nGray = unresolved\nOrange = conditional forecast\n\nRank is not probability.\nNo trading edge measured.'
    fig.text(.805,.775,summary,fontsize=10,va='top',linespacing=1.65)
    fig.text(.805,.40,'NEXT-WAVE SCENARIOS',fontsize=11,color='#e8be6b',weight='bold')
    details=[]
    for fc in candidates[:2]:details.append(f"Layer {fc['layer']}: {fc['family']}\nNext {fc['next']}? {'UP' if fc['direction']>0 else 'DOWN'}\nT1 {fc['target']:,.0f} / T2 {fc['target2']:,.0f}\nScenario INV {fc['invalidation']:,.0f}")
    fig.text(.805,.365,'\n\n'.join(details) if details else 'No admissible forward scenario\nin this selected interpretation.',fontsize=10,va='top',linespacing=1.65)
    fig.text(.055,.065,'Source: Coinbase public daily candles • Log price axis and Fibonacci measurement • Lines are one pixel in Pine.',fontsize=10,color='#a9b7c9')
    fig.text(.055,.039,'Historical interpretation can revise. Missing subdivisions stay UNKNOWN. Projection timing is schematic. This image validates the reference engine only.',fontsize=9,color='#e8be6b')
    fig.savefig(dest/(name+'.png'),dpi=120,facecolor=fig.get_facecolor());plt.close(fig)
    return {'image':name+'.png','root_layer':degree+1,'display_depth':depth,'root_coverage':[counted,len(layers[degree][0])-1],'labels':rendered,'scenarios':candidates}

reports=[draw('BTC-Daily-full-history-three-layers-REFERENCE',root_degree,3),draw('BTC-Daily-finest-history-REFERENCE',0,1),draw('BTC-Daily-recent-view-REFERENCE',root_degree,3,recent=True)]
(dest/'manifest.json').write_text(json.dumps({'status':'REFERENCE ONLY; Pine runtime verification pending','data_sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'source_file':str(f),'reports':reports},indent=2))
print(json.dumps(reports,indent=2))
