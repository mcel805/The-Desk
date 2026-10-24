"""Independent source-informed Swing Tracker 1.2 port. Research observations only.

No dependency on the Desk ABC engine, order engine, broker or credentials.
All timestamps are UTC milliseconds; pivot origin != recognition time.
"""
from copy import deepcopy
from dataclasses import dataclass, asdict
import math

REVISION = 'desk-swing-v1.2-research.2'

@dataclass(frozen=True)
class Config:
    swing_minutes: int = 5
    micro_bars: int = 1
    parent_bars: int = 4
    min_leg_ticks: int = 8
    min_leg_atr: float = .25
    min_retrace: float = .5
    max_retrace: float = 1.6
    sweep_bars: int = 2
    sweep_ticks: int = 1
    rejection_fraction: float = .5
    directional_body: bool = True
    geometry: bool = True
    max_chase_ticks: int = 30
    gap_ticks: int = 3
    stop_ticks: int = 2
    target_mode: str = 'liquidity'
    extension: float = .5
    min_room_r: float = 1
    quantity: float = .001
    attempt_risk: float = 25
    parent_risk: float = 50
    session_risk: float = 100
    parent_signals: int = 2
    candidate_bars: int = 60
    plan_bars: int = 120
    breakeven: bool = True
    profiles: tuple = ('LONG_REVERSAL','SHORT_REVERSAL','LONG_CONTINUATION','SHORT_CONTINUATION')

    def __post_init__(self):
        ints = {'micro_bars':(1,8),'parent_bars':(2,20),'min_leg_ticks':(1,10000),
                'sweep_bars':(1,10),'sweep_ticks':(1,10),'max_chase_ticks':(1,10000),
                'gap_ticks':(0,50),'stop_ticks':(1,100),'parent_signals':(1,10),
                'candidate_bars':(3,250),'plan_bars':(1,500)}
        if type(self.swing_minutes) is not int or self.swing_minutes not in (1,2,3,5,15,30):
            raise ValueError('Invalid swing timeframe')
        for k,(lo,hi) in ints.items():
            v=getattr(self,k)
            if type(v) is not int or not lo<=v<=hi: raise ValueError('Invalid '+k)
        for k in ('min_leg_atr','min_retrace','max_retrace','rejection_fraction','extension','min_room_r','quantity','attempt_risk','parent_risk','session_risk'):
            v=getattr(self,k)
            if type(v) not in (int,float) or not math.isfinite(v) or v<0 or (k!='min_leg_atr' and v==0):raise ValueError('Invalid '+k)
        if not .1<=self.min_retrace<=1 or not 1<=self.max_retrace<=3 or not .1<=self.rejection_fraction<=.8:raise ValueError('Invalid retracement or rejection bounds')
        if self.target_mode not in ('liquidity','measured'):raise ValueError('Unsupported target source')
        for k in ('directional_body','geometry','breakeven'):
            if type(getattr(self,k)) is not bool:raise ValueError('Invalid '+k)
        if not isinstance(self.profiles,(tuple,list)) or set(self.profiles)-set(Config.__dataclass_fields__['profiles'].default):raise ValueError('Invalid profiles')


def valid_bar(b):
    if not isinstance(b,dict) or type(b.get('time')) is not int or b['time']%60000:raise ValueError('Expected aligned UTC 1m bar')
    for k in ('open','high','low','close','volume'):
        if type(b.get(k)) not in (int,float) or not math.isfinite(b[k]) or b[k]<0:raise ValueError('Invalid bar '+k)
    if b['low']<=0 or b['low']>min(b['open'],b['close']) or b['high']<max(b['open'],b['close']):raise ValueError('Invalid OHLC')


class SwingTracker:
    def __init__(self, config=None, tick=.1):
        self.config=config or Config()
        if not math.isfinite(tick) or tick<=0:raise ValueError('Invalid tick')
        self.tick=tick;self.bars=[];self.swing=[];self.bucket=[];self.path=[];self.pools=[]
        self.parents=[];self.parent_id=0;self.trend=0;self.candidates=[];self.plans=[];self.events=[]
        self.day=None;self.reserved_session=0;self.reserved_parent=0;self.parent_count=0;self.seq=0;self.atr=None
        self.highs=[];self.lows=[];self.last_time=None;self.index=-1;self.observed_at=None
        self.study_mode=False;self.study_campaigns=[]

    def set_study_campaigns(self,campaigns):
        """Bind future confirmations to a previously observed HTF campaign.

        The service supplies data only, never an order or permission callback.
        Existing frozen READY plans are unaffected. Legacy replay stays separate.
        """
        self.study_mode=True;self.study_campaigns=deepcopy(campaigns)

    def event(self,kind,at,**data):
        self.seq+=1
        self.events.append({'seq':self.seq,'kind':kind,'at':at,**deepcopy(data)})

    def terminate(self,reason,at):
        for c in self.candidates:
            if c['state']=='WATCH':c.update(state='TERMINAL',reason=reason);self.event(reason,at,candidate=c['id'])
        for p in self.plans:
            if p['status'] in ('PENDING','OPEN'):p.update(status='UNRESOLVED',reason=reason);self.event('UNRESOLVED',at,plan=p['id'],reason=reason)

    def envelope(self,c,at):
        b=c['b'];end=c['c_index'];samples=[x for x in self.bars if b['index']<=x['index']<=self.index-1]
        if end<=b['index'] or len(samples)<3 or self.index-b['index']>400 or samples[0]['index']!=b['index']:return None
        slope=(c['c']-b['price'])/(end-b['index'])
        upper=max(0,max(x['high']-(b['price']+slope*(x['index']-b['index'])) for x in samples))
        lower=min(0,min(x['low']-(b['price']+slope*(x['index']-b['index'])) for x in samples))
        def edges(i):return [b['price']+slope*(i-b['index'])+upper,b['price']+slope*(i-b['index'])+lower]
        u,l=edges(self.index)
        return {'upper':u,'lower':l,'known_at':at-60000,'start':b['origin'],'start_edges':edges(b['index']),'end':at-60000,'end_edges':[u,l]}

    def observe_plans(self,b,at):
        q=self.config
        for p in self.plans:
            if p['status']=='PENDING':
                eligible=p.get('eligible_open',p['signal_at'])
                if b['time']<eligible:continue
                if b['time']!=eligible:p.update(status='MISSED',reason='NON_ADJACENT_OPEN')
                elif abs(b['open']-p['reference'])>q.gap_ticks*self.tick:p.update(status='MISSED',reason='OPEN_GAP')
                else:
                    risk=p['side']*(b['open']-p['stop']);room=p['side']*(p['target']-b['open'])
                    if risk<=0 or room/risk<q.min_room_r or risk*q.quantity>p['reserved_risk']:p.update(status='MISSED',reason='OPEN_RISK_OR_ROOM')
                    else:p.update(status='OPEN',entry=b['open'],entry_at=b['time'],initial_risk=risk,age=0)
                self.event('SHADOW_'+p['status'],at,plan=p['id'],reason=p.get('reason'),observation=p)
            if p['status']!='OPEN':continue
            p['age']+=1
            stop=b['low']<=p['stop'] if p['side']==1 else b['high']>=p['stop']
            target=b['high']>=p['target'] if p['side']==1 else b['low']<=p['target']
            if stop and target:p.update(status='AMBIGUOUS',reason='BOTH_BARRIERS_IN_1M',exit_at=at)
            elif stop or target:
                price=p['target'] if target else p['stop']
                # Stop gaps are observed at the open; target gaps get only the limit price.
                if stop:price=min(price,b['open']) if p['side']==1 else max(price,b['open'])
                p.update(status='TARGET' if target else 'STOP',exit_at=at,exit=price,gross_r=p['side']*(price-p['entry'])/p['initial_risk'])
            elif p['age']>=q.plan_bars:p.update(status='EXPIRED',exit_at=at,reason='HORIZON')
            elif q.breakeven and p['side']*(b['close']-p['b']['price'])>0 and p['side']*(p['entry']-p['stop'])>0:
                p.update(stop=p['entry']);self.event('BE_NEXT_BAR',at,plan=p['id'],stop=p['stop'])
            if p['status']!='OPEN':self.event('SHADOW_'+p['status'],at,plan=p['id'],gross_r=p.get('gross_r'),observation=p)

    def evaluate(self,c,b,at):
        q=self.config;s=c['side'];rail=self.envelope(c,at);c['channel']=rail
        extreme=b['low'] if s==1 else b['high']
        if s*(extreme-c['c'])<0:c.update(c=extreme,c_index=self.index,c_origin=b['time'])
        ab=abs(c['b']['price']-c['a']['price']);retr=s*(c['b']['price']-c['c'])/ab;c['retracement']=retr
        reason=None
        if self.index-c['born_index']>q.candidate_bars*q.swing_minutes:reason='EXPIRED'
        elif retr>q.max_retrace:reason='RETRACE_INVALID'
        elif c['profile'].endswith('CONTINUATION') and s*(c['c']-c['a']['price'])<=0:reason='CONTINUATION_INVALID'
        elif (b['high']>=c['b']['price']+self.tick if s==1 else b['low']<=c['b']['price']-self.tick):reason='MISSED_B_BREAK'
        if reason:c.update(state='TERMINAL',reason=reason);self.event(reason,at,candidate=c['id']);return
        if self.study_mode:
            campaign=next((x for x in reversed(self.study_campaigns) if x['side']==s and x['state']=='WATCH' and x.get('target') and x['observed_at']<=(self.observed_at or at) and x['target'].get('available_at',x['target']['known_at'])<=(self.observed_at or at) and x['expires']>at and (not c.get('study_campaign') or c['study_campaign']==x['id'])),None)
            if not campaign:
                c['reason']='WAIT_HTF_CAMPAIGN';return
            if not c.get('study_campaign'):
                c.update(study_campaign=campaign['id'],target=campaign['target']['price'],target_known=campaign['target'].get('available_at',campaign['target']['known_at']),target_role='HTF_STUDY_OBJECTIVE')
        prev=self.bars[-q.sweep_bars:]
        if len(prev)<q.sweep_bars:return
        ref=min(x['low'] for x in prev) if s==1 else max(x['high'] for x in prev)
        swept=extreme<=ref-q.sweep_ticks*self.tick if s==1 else extreme>=ref+q.sweep_ticks*self.tick
        reclaimed=s*(b['close']-ref)>0
        body=not q.directional_body or s*(b['close']-b['open'])>0
        candle=(b['high']-b['close'] if s==1 else b['close']-b['low'])<=q.rejection_fraction*(b['high']-b['low'])
        geo=not q.geometry
        if q.geometry and rail:
            geo=((b['low']<=rail['lower'] and b['close']>rail['lower']) or b['close']>rail['upper']) if s==1 else ((b['high']>=rail['upper'] and b['close']<rail['upper']) or b['close']<rail['lower'])
        formed=retr>=q.min_retrace and self.index-c['born_index']>q.sweep_bars
        c['checks']={'formed':formed,'swept':swept,'reclaimed':reclaimed,'body':body,'rejection':candle,'prior_channel':geo}
        if not all(c['checks'].values()):
            c['reason']='DEVELOPING_C' if not formed else 'WAIT_SWEEP' if not(swept and reclaimed) else 'WAIT_PRIOR_CHANNEL' if not geo else 'WAIT_CLOSE'
            return
        stop=round((c['c']-s*q.stop_ticks*self.tick)/self.tick)*self.tick
        risk=s*(b['close']-stop);reserve=(risk+q.gap_ticks*self.tick)*q.quantity
        target=c['target'];room=s*(target-b['close']) if target is not None else 0
        why=('PROFILE_OFF' if c['profile'] not in q.profiles else
             'SLOT_BUSY' if any(p['status'] in ('PENDING','OPEN') for p in self.plans) else
             'CHASE' if abs(b['close']-c['c'])>q.max_chase_ticks*self.tick else
             'NO_TARGET' if target is None else 'ROOM' if risk<=0 or room/risk<q.min_room_r else
             'ATTEMPT_RISK' if reserve>q.attempt_risk else 'PARENT_COUNT' if self.parent_count>=q.parent_signals else
             'PARENT_RISK' if self.reserved_parent+reserve>q.parent_risk else
             'SESSION_RISK' if self.reserved_session+reserve>q.session_risk else None)
        if why:c.update(state='BLOCKED',reason=why);self.event('BLOCKED',at,candidate=c['id'],reason=why);return
        p={**deepcopy(c),'id':len(self.plans)+1,'status':'PENDING','state':'READY','reason':'CLOSED_BAR_CONFIRMED','signal_at':at,'observed_at':self.observed_at or at,'eligible_open':math.ceil((self.observed_at or at)/60000)*60000,'reference':b['close'],'initial_stop':stop,'stop':stop,'reserved_risk':reserve,'quantity':q.quantity,'sweep_reference':ref,'reference_known':self.bars[-1]['time']+60000}
        self.plans.append(p);self.reserved_session+=reserve;self.reserved_parent+=reserve;self.parent_count+=1
        c.update(state='READY',reason='CLOSED_BAR_CONFIRMED');self.event('READY',at,plan=p['id'],candidate=c['id'],frozen_plan=p)

    def pivot(self,n):
        if len(self.swing)<n*2+1:return None
        window=self.swing[-(n*2+1):];center=window[n];others=window[:n]+window[n+1:]
        # Strict ties deliberately remain unresolved; Pine tie parity is unverified.
        hi=all(center['high']>x['high'] for x in others);lo=all(center['low']<x['low'] for x in others)
        if hi==lo:return None
        return {'price':center['high'] if hi else center['low'],'side':1 if hi else -1,'origin':center['time'],'known':self.swing[-1]['time']+self.config.swing_minutes*60000,'index':center['index'],'consumed':False}

    def recognize(self,at):
        q=self.config;p=self.pivot(q.parent_bars)
        if p:
            sidehist=self.highs if p['side']==1 else self.lows;sidehist.append(p['price']);sidehist[:]=sidehist[-2:]
            if len(self.highs)==len(self.lows)==2:self.trend=1 if self.highs[1]>self.highs[0] and self.lows[1]>self.lows[0] else -1 if self.highs[1]<self.highs[0] and self.lows[1]<self.lows[0] else 0
            if not self.parents:self.parents.append(p)
            elif self.parents[-1]['side']!=p['side']:
                self.parents.append(p);self.parent_id+=1;self.reserved_parent=0;self.parent_count=0
                for c in list(self.candidates):
                    if c['state']=='WATCH':
                        c.update(state='TERMINAL',reason='PARENT_CHANGED');self.event('PARENT_CHANGED',at,candidate=c['id'])
                        self.new_candidate(c['a'],c['b'],at,c)
                self.event('PARENT',at,parent=self.parent_id,pivot=p)
            elif p['side']*(p['price']-self.parents[-1]['price'])>0:self.parents[-1]=p
        p=self.pivot(q.micro_bars)
        if not p:return
        self.pools.append(deepcopy(p));self.pools=self.pools[-160:]
        if not self.path:self.path.append(p);return
        last=self.path[-1]
        if last['side']==p['side']:
            if p['side']*(p['price']-last['price'])>0:self.path[-1]=p
            return
        self.path.append(p);self.path=self.path[-100:]
        if abs(p['price']-last['price'])>=max(q.min_leg_ticks*self.tick,(self.atr or 0)*q.min_leg_atr):
            for c in self.candidates:
                if c['state']=='WATCH' and c['side']==p['side']:c.update(state='TERMINAL',reason='SUPERSEDED');self.event('SUPERSEDED',at,candidate=c['id'])
            self.new_candidate(last,p,at)

    def new_candidate(self,a,b,at,old=None):
        q=self.config;s=b['side'];beyond=[p for p in self.pools if not p['consumed'] and p['side']==s and s*(p['price']-b['price'])>self.tick]
        pool=min(beyond,key=lambda p:abs(p['price']-b['price'])) if beyond else None
        target=b['price']+s*abs(b['price']-a['price'])*q.extension if q.target_mode=='measured' else pool['price'] if pool else None
        if old:target=old['target']
        recent=(self.bars+self.bucket[-1:])[-q.micro_bars:] or [self.swing[-1]]
        extreme=min(recent,key=lambda x:x['low']) if s==1 else max(recent,key=lambda x:x['high'])
        self.candidates.append({'id':len(self.candidates)+1,'parent':self.parent_id,'side':s,'profile':('LONG' if s==1 else 'SHORT')+('_CONTINUATION' if self.trend==s else '_REVERSAL'),'a':deepcopy(a),'b':deepcopy(b),'born':at,'born_index':self.index,'c':old['c'] if old else extreme['low' if s==1 else 'high'],'c_index':old['c_index'] if old else extreme['index'],'c_origin':old['c_origin'] if old else extreme['time'],'target':round(target/self.tick)*self.tick if target else None,'target_known':old['target_known'] if old else at if q.target_mode=='measured' else pool['known'] if pool else None,'target_role':'MEASURED_AB' if q.target_mode=='measured' else 'RECOGNIZED_PIVOT','state':'WATCH','reason':'DEVELOPING_C'})
        self.event('CANDIDATE',at,candidate=self.candidates[-1]['id'],parent=self.parent_id,frozen_candidate=self.candidates[-1])

    def feed(self,bar,observed_at=None):
        valid_bar(bar);b=deepcopy(bar);t=b['time'];at=t+60000
        if observed_at is not None and (type(observed_at) not in (int,float) or not math.isfinite(observed_at) or observed_at<at):raise ValueError('Observation cannot precede candle closure')
        self.observed_at=observed_at or at
        if self.last_time is not None and t<=self.last_time:raise ValueError('Bars must be strictly ordered, deduplicated')
        gap=self.last_time is not None and t!=self.last_time+60000
        day=t//86400000
        if gap:
            self.terminate('DATA_GAP',at);self.event('DATA_GAP',at,previous=self.last_time)
            self.bucket=[];self.swing=[];self.path=[];self.parents=[];self.pools=[];self.highs=[];self.lows=[];self.atr=None;self.trend=0
            self.parent_id+=1;self.reserved_parent=0;self.parent_count=0
        if day!=self.day:
            self.terminate('UTC_SESSION_END',at);self.day=day;self.reserved_session=0;self.reserved_parent=0;self.parent_count=0;self.parent_id+=1
        self.index+=1;b['index']=self.index;self.last_time=t
        self.observe_plans(b,at)
        for p in self.pools:
            if p['known']<=t and (b['high']>=p['price'] if p['side']==1 else b['low']<=p['price']):p['consumed']=True
        for c in self.candidates:
            if c['state']=='WATCH' and self.index>c['born_index']:self.evaluate(c,b,at)
        span=self.config.swing_minutes*60000
        if self.bucket and t//span!=self.bucket[0]['time']//span:self.bucket=[]
        self.bucket.append(b)
        if at%span==0:
            if len(self.bucket)==self.config.swing_minutes:
                x={'time':self.bucket[0]['time'],'index':self.bucket[0]['index'],'open':self.bucket[0]['open'],'high':max(z['high'] for z in self.bucket),'low':min(z['low'] for z in self.bucket),'close':b['close'],'volume':sum(z['volume'] for z in self.bucket)}
                prev=self.swing[-1]['close'] if self.swing else x['open'];tr=max(x['high']-x['low'],abs(x['high']-prev),abs(x['low']-prev))
                x['tr']=tr;self.swing.append(x);self.swing=self.swing[-500:]
                if self.atr is not None:self.atr=(13*self.atr+tr)/14
                elif len(self.swing)>=14:self.atr=sum(z['tr'] for z in self.swing[-14:])/14
                self.recognize(at)
            self.bucket=[]
        self.bars.append(b);self.bars=self.bars[-2000:]

    def visual_context(self):
        if len(self.parents)<2 or not self.bars:return None
        previous,last=self.parents[-2:];end=self.bars[-1]
        tail=[b for b in self.bars if b['index']>=last['index']]
        high=max(previous['price'],last['price'],*(b['high'] for b in tail))
        low=min(previous['price'],last['price'],*(b['low'] for b in tail))
        context={'range_start':previous['origin'],'range_high':high,'range_low':low,'known_at':end['time']+60000}
        # Latest parent pivot -> furthest opposite extreme among committed bars.
        direction=-last['side']
        endpoints=[b for b in reversed(tail) if b['index']>last['index']]
        endpoint=(max(endpoints,key=lambda b:b['high']) if direction==1 else min(endpoints,key=lambda b:b['low'])) if endpoints else None
        if endpoint and endpoint['index']>last['index']:
            endpoint_price=endpoint['high'] if direction==1 else endpoint['low']
            slope=(endpoint_price-last['price'])/(endpoint['index']-last['index'])
            upper=max(0,max(b['high']-last['price']-slope*(b['index']-last['index']) for b in tail))
            lower=min(0,min(b['low']-last['price']-slope*(b['index']-last['index']) for b in tail))
            pad=max(0,(2*self.tick-(upper-lower))/2);upper+=pad;lower-=pad
            context['band']={'start':last['origin'],'start_upper':last['price']+upper,'start_lower':last['price']+lower,'end':end['time'],'end_upper':last['price']+upper+slope*(end['index']-last['index']),'end_lower':last['price']+lower+slope*(end['index']-last['index']),'slope_per_minute':slope,'direction':direction,'endpoint':endpoint['time'],'endpoint_price':endpoint_price,'anchor_price':last['price']}
        return context

    def snapshot(self):
        from swing_liquidity import swing_measurements
        measurements=swing_measurements(self.bars,5,self.tick)
        return deepcopy({'measurements':measurements,'revision':REVISION,'config':asdict(self.config),'tick':self.tick,'cutoff':None if self.last_time is None else self.last_time+60000,'parent_id':self.parent_id,'trend':self.trend,'visual_context':self.visual_context(),'display_bars':self.bars[-120:],'parents':self.parents[-20:],'pivots':self.path[-40:],'candidates':self.candidates[-30:],'plans':self.plans[-30:],'events':self.events[-40:],'reserved_session':self.reserved_session,'reserved_parent':self.reserved_parent,'session':'UTC 24/7','probability_status':'Uncalibrated research'})
