"""Explicit synthetic UI fixture, only port 18895 and an isolated data directory.

No public market, Jev, Keychain or Codex requests. Never a performance record.
"""
from pathlib import Path
import json
import sys
import time
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
sys.path.insert(0,str(Path(__file__).resolve().parent))
import server
import test_swing_liquidity as fixtures
fixtures.BASE=int(time.time()*1000)//60000*60000-20*60000
from test_swing_advisors import FakeSession
from swing_liquidity import LiquidityStudy
from swing_advisors import SwingAdvisors
from swing_research import SwingResearch


class FixtureResearch(SwingResearch):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,**kwargs)
        for symbol in self.configs:
            cfg=self.configs[symbol];run='synthetic-'+symbol.split(':')[1]
            s=LiquidityStudy(run,symbol,cfg,1,fixtures.BASE)
            s.set_context(fixtures.context());s.last_bar=fixtures.bar(-1,c=105)
            fixtures.observe(s,0,l=99);fixtures.observe(s,1,[fixtures.ready(fixtures.BASE+130000)])
            s.model({'status':'AVAILABLE','answers':{'long_fit':{'noul':.9}}},'synthetic-jev',fixtures.BASE+130000,fixtures.BASE+130500)
            for i in (2,3):fixtures.observe(s,i)
            fixtures.observe(s,4,h=121,c=118);s.end('SYNTHETIC_FIXTURE',fixtures.BASE+360000)
            with self.db() as db:
                db.execute('INSERT OR REPLACE INTO runs VALUES(?,?,?,?)',(run,symbol,fixtures.BASE,json.dumps(cfg)))
            self.persist_study(symbol,{'run':run,'study':s,'config':cfg},fixtures.BASE+360000)
            report=self.study_report(symbol,run);report['scope']='SYNTHETIC UI TEST — invented prices and outcomes; no model calls, no performance claim. '+report['scope']
            with self.db() as db:db.execute('UPDATE study_state SET state=? WHERE run=?',(json.dumps(report),run))
            self.last[symbol]={'run':run,'status':'PAUSED','observed_at':fixtures.BASE+370000,
                              'detail':'SYNTHETIC UI TEST · invented prices; no market or model requests.',
                              'snapshot':{'config':cfg,'tick':1,'parent_id':1,'trend':0,'cutoff':fixtures.BASE+300000,
                                          'reserved_session':0,'candidates':[],'plans':[],'pivots':[],
                                          'display_bars':[fixtures.bar(i) for i in range(-12,5)]},
                              'study':self.study_brief(report),'jev':{'status':'DISABLED'}}
    def start(self):pass


class NoNetworkGateway:
    def bars(self,*args):raise ValueError('Synthetic UI fixture has no market connection')
    def quote(self,*args):raise ValueError('Synthetic UI fixture has no market connection')


class FixtureAdvisors(SwingAdvisors):
    def __init__(self,research):super().__init__(research,FakeSession)


server.Gateway=NoNetworkGateway
server.SwingResearch=FixtureResearch
server.SwingAdvisors=FixtureAdvisors
if __name__=='__main__':
    if '--port' not in sys.argv or sys.argv[sys.argv.index('--port')+1]!='18895' or '--data-dir' not in sys.argv or '--no-workers' not in sys.argv:
        raise SystemExit('Fixture requires --port 18895 --data-dir <isolated temp directory> --no-workers')
    server.main()
