"""Bounded asynchronous runner for the user's Swing Tracker 1.7.

The collector remains authoritative for source bars and observation time. Pine
results are consumed only for the exact completed cutoff they were requested
for, and never create orders or backdate a model receipt.
"""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import json
from pathlib import Path
import subprocess
import time

ROOT = Path(__file__).resolve().parent
VERSION = 'desk-house-abc.1'
MAX_BARS = 1200
TIMEOUT_SECONDS = 45


def run_pine(bars, symbol, tick, swing_minutes):
    payload={'bars':[{k:b[k] for k in ('time','open','high','low','close','volume')} for b in bars],
             'symbol':symbol,'tick':tick,'swing_minutes':swing_minutes}
    result=subprocess.run(['node',str(ROOT/'swing_abc_runner.mjs')],input=json.dumps(payload,allow_nan=False),
                          text=True,capture_output=True,timeout=TIMEOUT_SECONDS,check=True,cwd=str(ROOT))
    value=json.loads(result.stdout)
    if value.get('version')!=VERSION or value.get('cutoff')!=bars[-1]['time']+60000:
        raise ValueError('Invalid house ABC cutoff')
    return value


class HouseABC:
    def __init__(self, runner=run_pine, clock=None):
        self.runner=runner;self.clock=clock or (lambda:int(time.time()*1000))
        self.executor=ThreadPoolExecutor(max_workers=1,thread_name_prefix='house-abc')
        self.pending=None;self.pending_cutoff=None;self.completed=None;self.failed_cutoff=None;self.closed=False

    def observe(self,bars,symbol,tick,swing_minutes,observed_at):
        if self.closed or not bars:return {'status':'UNAVAILABLE','reason':'NO_COMPLETED_BARS'}
        cutoff=bars[-1]['time']+60000
        if self.pending and self.pending.done():
            try:
                value=self.pending.result()
                if value.get('cutoff')!=self.pending_cutoff:raise ValueError('Cutoff mismatch')
                self.completed={**value,'received_at':self.clock()};self.failed_cutoff=None
            except Exception as exc:
                self.completed=None;self.failed_cutoff=self.pending_cutoff
                self.failure=type(exc).__name__
            self.pending=None;self.pending_cutoff=None
        if self.completed and self.completed['cutoff']==cutoff and self.completed['received_at']<=observed_at:
            return {'status':'AVAILABLE',**deepcopy(self.completed)}
        if not self.pending and self.failed_cutoff!=cutoff and not (self.completed and self.completed['cutoff']==cutoff):
            bounded=deepcopy(bars[-MAX_BARS:]);self.pending_cutoff=cutoff
            self.pending=self.executor.submit(self.runner,bounded,symbol,tick,swing_minutes)
        return {'status':'UNAVAILABLE','reason':'EVALUATION_FAILED' if self.failed_cutoff==cutoff else 'EVALUATING',
                'error_class':getattr(self,'failure',None) if self.failed_cutoff==cutoff else None,
                'cutoff':cutoff,'version':VERSION}

    def close(self):
        self.closed=True
        if self.pending:self.pending.cancel()
        self.executor.shutdown(wait=False,cancel_futures=True)
