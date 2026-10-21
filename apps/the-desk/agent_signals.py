"""Bounded server data/indicator jobs; never executes from a browser heartbeat."""
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import shutil
import subprocess
import threading
import time
from agent_workspaces import TIMEFRAMES,SOURCE_HASH

ROOT=Path(__file__).resolve().parent
DURATION={'1m':60,'3m':180,'5m':300,'15m':900,'30m':1800,'1h':3600,'2h':7200,'4h':14400,'1d':86400}

class AgentSignals:
    def __init__(self,agents,gateway,clock=time.time,calculate=None):
        self.agents,self.gateway,self.clock=agents,gateway,clock
        self.calculate=calculate or self.pine;self.records={};self.errors={};self.lock=threading.RLock();self.running=set();self.attempts={};self.scheduled_versions={};self.stop=threading.Event()
        self.cache={};self.cache_locks={};self.pool=ThreadPoolExecutor(max_workers=3,thread_name_prefix='agent-input')
    def snapshot(self,agent,revision):
        with self.lock:
            r=self.records.get(agent)
            return r if r and r['revision']==revision else None
    def bars(self,instrument,timeframe,limit):
        key=(instrument,timeframe,limit)
        with self.lock:lock=self.cache_locks.setdefault(key,threading.Lock())
        with lock:
            with self.lock:r=self.cache.get(key)
            if r and 0<=self.clock()-r[0]<12:return r[1]
            result=self.gateway.bars(instrument,timeframe,limit)
            rows=result.get('bars')
            if not isinstance(rows,list) or len(rows)<2:raise ValueError('Candle history unavailable.')
            # A retained historical snapshot must not become current just because a job finished.
            observed=float(result['as_of'])/1000
            if not 0<=self.clock()-observed<=30:raise ValueError('Candle source snapshot is stale.')
            latest=float(rows[-1]['time'])/1000
            if not -2<=self.clock()-latest<=DURATION[timeframe]*2:raise ValueError('Provider candle tail is stale or future dated.')
            with self.lock:
                self.cache[key]=(self.clock(),result)
                while len(self.cache)>96:
                    oldest=min(self.cache,key=lambda k:self.cache[k][0]);self.cache.pop(oldest,None)
            return result
    def pine(self,config,bars,series,metadata):
        chart=config['chart'];node=os.environ.get('DESK_AGENT_NODE') or shutil.which('node')
        if not node:raise ValueError('Node runtime unavailable; Liquidity evaluation stopped.')
        tick=float(metadata['tick']);
        if not 0<tick<1e12:raise ValueError('Verified positive instrument tick required.')
        symbol=config['instrument'].split(':',1)[1]
        payload={'instrument':config['instrument'],'sourceHash':chart['liquidity']['sourceHash'],'pineTimeframe':TIMEFRAMES[chart['timeframe']],'bars':bars,'series':series,'settings':chart['liquidity'],
          'symbolInfo':{'ticker':symbol,'tickerid':config['instrument'],'timezone':'Etc/UTC','mintick':tick,'minmov':1,'pricescale':round(1/tick),'type':'crypto','currency':'USD'}}
        result=subprocess.run([node,'--experimental-strip-types','--max-old-space-size=768',str(ROOT/'agent-pine-worker.mjs')],input=json.dumps(payload),text=True,capture_output=True,timeout=40,cwd=ROOT)
        if result.returncode:raise ValueError('Installed Liquidity calculation failed; entries gated. '+result.stderr[-240:])
        data=json.loads(result.stdout)
        if data.get('sourceHash')!=SOURCE_HASH or not data.get('liquidityReady'):raise ValueError('Unverified Liquidity result.')
        return data
    def refresh(self,agent,revision,config):
        try:
            chart=config['chart'];primary=self.bars(config['instrument'],chart['timeframe'],chart['historyBars']);series={TIMEFRAMES[chart['timeframe']]:primary['bars']};coverage=[{k:primary.get(k) for k in ('instrument','timeframe','as_of','last_completed','coverage')}]
            result={'levels':[],'liquidityReady':False}
            asof=primary['as_of']/1000
            if chart['liquidity']['enabled']:
                if chart['liquidity']['sourceHash']!=SOURCE_HASH:raise ValueError('Installed source hash differs from the published version.')
                frames=[('1m',chart['liquidity']['masterBars']),('5m',chart['liquidity']['sourceBars']),('15m',max(800,chart['liquidity']['sourceBars'])),('30m',max(800,chart['liquidity']['sourceBars'])),('1h',chart['liquidity']['sourceBars'])]
                for tf,limit in frames:
                    item=self.bars(config['instrument'],tf,limit);series[TIMEFRAMES[tf]]=item['bars'];asof=min(asof,item['as_of']/1000)
                    coverage.append({k:item.get(k) for k in ('instrument','timeframe','as_of','last_completed','coverage')})
                quote=self.agents.engine.quotes.get(config['instrument'],{})
                if not quote.get('metadata_verified') or not quote.get('tick') or not 0<=self.clock()-quote.get('received_at',0)<=15 or not 0<=self.clock()-quote.get('metadata_observed_at',0)<=300:raise ValueError('Waiting for fresh verified instrument tick metadata.')
                result=self.calculate(config,primary['bars'],series,quote)
            with self.lock:
                self.records[agent]={'agentId':agent,'revision':revision,'bars':primary['bars'],'observedAt':asof,'calculatedAt':self.clock(),'coverage':coverage,'instrumentMetadata':{k:quote.get(k) for k in ('tick','qty_step','market_type','currency','received_at','metadata_verified','metadata_observed_at')} if chart['liquidity']['enabled'] else None,**result};self.errors.pop(agent,None)
        except Exception as error:
            # Keep the last chart for inspection; failed signals cannot be traded.
            with self.lock:
                self.errors[agent]=str(error)[:300]
                if agent in self.records:self.records[agent]={**self.records[agent],'liquidityReady':False}
        finally:
            with self.lock:self.running.discard(agent)
    def start(self):
        def loop():
            while not self.stop.is_set():
                with self.agents.lock,self.agents.engine.db() as db:
                    jobs=[(r['id'],r['revision'],json.loads(r['config']),r['state']) for r in db.execute("SELECT id,revision,config,state FROM desk_agents WHERE state<>'archived'")]
                # Rotating due times prevent large fleets from starving later agents.
                jobs.sort(key=lambda x:(x[3]!='armed',self.attempts.get(x[0],0)))
                with self.lock:
                    for agent,revision,c,state in jobs:
                        if len(self.running)>=3:break
                        if 'chart' not in c or agent in self.running or self.scheduled_versions.get(agent)==revision and self.clock()-self.attempts.get(agent,0)<15:continue
                        self.running.add(agent);self.attempts[agent]=self.clock();self.scheduled_versions[agent]=revision;self.pool.submit(self.refresh,agent,revision,c)
                self.stop.wait(1)
        threading.Thread(target=loop,daemon=True,name='agent-input-scheduler').start()
    def close(self):self.stop.set();self.pool.shutdown(wait=False,cancel_futures=True)
