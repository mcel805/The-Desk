import copy
from decimal import Decimal
import json
from pathlib import Path
import sys
import tempfile
import time
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine import Engine
from agents import Agents,defaults
from agent_workspaces import chart_defaults,SOURCE_HASH

class WorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.e=Engine(Path(self.tmp.name)/'desk.db');self.now=time.time();self.s=Agents(self.e,lambda:self.now)
        self.i='hyperliquid:BTC';self.quote(self.i,101)
    def quote(self,i,mid):
        mid=Decimal(str(mid));self.e.ingest(i,str(mid-Decimal('.01')),str(mid+Decimal('.01')),{'tick':'.01','qty_step':'.001','metadata_verified':True,'metadata_observed_at':self.now},received_at=self.now)
    def config(self,name='Owned agent',i='hyperliquid:BTC'):
        c=defaults('new-account');c.update(name=name,instrument=i,executionInstrument=i,chart=chart_defaults());c['chart']['levels']=[{'id':'cyan-1','price':'100','label':'Cyan touch'}]
        c['modules']['signal']['sources']=['manual-cyan'];return c
    def create(self,name='Owned agent',i='hyperliquid:BTC',key=None):
        p={**self.config(name,i),'setup':{'capital':'2500','fee_bps':'5','leverage':'1'},'creationKey':key or name.replace(' ','_')+'-creation-12345'}
        r=self.s.save(p);return self.s.detail(r['id'])['agent']
    def draft(self,a,config):
        if config['account']['id']=='new-account':config={**config,'account':a['account']}
        return self.s.save({**config,'id':a['id'],'expectedRevision':a['revision'],'draftRevision':a['workspace']['draft']['revision'] if a['workspace']['draft'] else None})
    def publish(self,a,d):return self.s.publish_draft({'id':a['id'],'expectedRevision':a['revision'],'draftRevision':d['draftRevision']})
    def arm(self,a):return self.s.control({'id':a['id'],'revision':a['revision'],'action':'arm'})
    def test_real_clock_context_does_not_appear_future_dated_to_its_tick(self):
        self.s.clock=time.time;a=self.create('Real clock agent');self.arm(a);self.s.tick();self.quote(self.i,100);self.s.tick()
        self.assertEqual(len(self.s.detail(a['id'])['fills']),1)
    def test_fleet_armed_and_exposure_limits_are_enforced(self):
        a=self.create('Fleet A');b=self.create('Fleet B')
        self.s.save_fleet_limits({'maxArmed':1,'maxExposureUSD':'.01','maxDailyLossUSD':'50'})
        self.arm(a)
        with self.assertRaisesRegex(ValueError,'Maximum armed'):self.arm(b)
        self.s.tick();self.quote(self.i,100);self.s.tick();d=self.s.detail(a['id'])
        self.assertEqual(d['runs'][0]['decision'],'blocked');self.assertIn('Fleet exposure',d['runs'][0]['reason']);self.assertFalse(d['fills'])

    def test_creation_resources_are_unique_and_idempotent(self):
        a=self.create();again=self.create();b=self.create('Second agent')
        self.assertEqual(a['id'],again['id']);self.assertNotEqual(a['account']['id'],b['account']['id'])
        self.assertNotEqual(a['workspace']['chart_id'],b['workspace']['chart_id']);self.assertNotEqual(a['workspace']['journal_id'],b['workspace']['journal_id'])
        self.assertEqual(a['state'],'paused');self.assertEqual(a['runCount'],0)
        with self.e.db() as db:
            account=self.e.account(db,a['account']['id']);self.assertEqual(account['capital'],'2500')
            queued=db.execute("SELECT payload FROM outbox WHERE json_extract(payload,'$.account.id')=?",(a['account']['id'],)).fetchall();self.assertEqual(len(queued),1)
    def test_invalid_provision_rolls_back_every_resource(self):
        before=len(self.e.state()['accounts']);p={**self.config(),'setup':{'capital':'-10','fee_bps':'5','leverage':'1'},'creationKey':'invalid-creation-12345'}
        with self.assertRaises(ValueError):self.s.save(p)
        self.assertEqual(len(self.e.state()['accounts']),before)
        with self.e.db() as db:self.assertFalse(db.execute('SELECT 1 FROM desk_agent_provisions WHERE key=?',(p['creationKey'],)).fetchone())
    def test_two_agents_run_without_any_browser_context(self):
        a=self.create('BTC agent');b=self.create('ETH agent','hyperliquid:ETH');self.quote(b['instrument'],101)
        self.arm(a);self.arm(b);self.s.tick();self.quote(self.i,100);self.quote(b['instrument'],100);self.s.tick()
        for x in (a,b):
            d=self.s.detail(x['id']);self.assertEqual(len(d['fills']),1);self.assertEqual(d['orders'][0]['account_id'],x['account']['id'])
            self.assertEqual(d['runs'][0]['payload']['chart']['authority'],'independent-agent-runtime')
        self.assertIsNone(self.s.chart)
    def test_trader_replay_or_other_chart_cannot_replace_agent_inputs(self):
        a=self.create();self.arm(a);self.s.tick()
        self.s.publish({'instrument':'coinbase:SOL-USD','timeframe':'1','observedAt':self.now,'replay':True,'levels':[]})
        self.quote(self.i,100);self.s.tick();self.assertEqual(len(self.s.detail(a['id'])['runs']),1)
    def test_draft_preserves_armed_version_and_publishes_only_flat(self):
        a=self.create();self.arm(a);c=self.config();c['chart']['levels'][0]['price']='90'
        draft=self.draft(a,c);current=self.s.detail(a['id']);self.assertEqual(current['agent']['state'],'armed');self.assertEqual(current['agent']['chart']['levels'][0]['price'],'100')
        self.s.tick();self.quote(self.i,100);self.s.tick()
        with self.assertRaisesRegex(ValueError,'flat'):self.publish(a,draft)
        self.quote(self.i,101);r=self.publish(a,draft);d=self.s.detail(a['id'])
        self.assertEqual(r['revision'],2);self.assertEqual(d['agent']['state'],'paused');self.assertIsNone(d['draft'])
        self.assertEqual(d['agent']['account'],a['account']);self.assertEqual(d['agent']['workspace']['journal_id'],a['workspace']['journal_id'])
        self.assertEqual(d['runs'][0]['revision'],1)
    def test_stale_drafts_and_account_rebinding_rejected(self):
        a=self.create();c=self.config();self.draft(a,c)
        with self.assertRaisesRegex(ValueError,'Draft revision'):self.draft(a,c)
        a=self.s.detail(a['id'])['agent'];c['account']['id']='another'
        with self.assertRaisesRegex(ValueError,'keeps its account'):self.draft(a,c)
    def test_duplicate_chart_levels_rejected(self):
        c=self.config();c['chart']['levels']*=2
        with self.assertRaisesRegex(ValueError,'unique'):self.s.save({**c,'setup':{'capital':'1000','fee_bps':'5','leverage':'1'},'creationKey':'duplicate-lines-12345'})
    def test_manual_commands_cannot_touch_dedicated_account(self):
        a=self.create()
        with self.assertRaisesRegex(ValueError,'belongs to an agent'):
            self.e.execute('manual-entry','order',{'account_id':a['account']['id'],'instrument':self.i,'side':'buy','kind':'market','qty':'.001'})
        with self.assertRaises(ValueError):self.e.execute('manual-reset','account_reset',{'account_id':a['account']['id']})
    def test_journal_preserves_entry_and_exit_version_and_run(self):
        a=self.create();self.arm(a);self.s.tick();self.quote(self.i,100);self.s.tick();self.quote(self.i,101)
        d=self.s.detail(a['id']);run=d['runs'][0]
        with self.e.db() as db:
            items=[json.loads(r[0]) for r in db.execute("SELECT payload FROM outbox WHERE json_extract(payload,'$.account.id')=? AND json_extract(payload,'$.eventType')='execution'",(a['account']['id'],))]
        self.assertEqual(len(items),2)
        for item in items:
            self.assertEqual(item['provenance']['agent']['id'],a['id']);self.assertEqual(item['provenance']['agent']['version'],1);self.assertEqual(item['provenance']['agent']['runId'],run['id'])
    def test_delayed_limit_fill_journal_uses_order_owner_before_position_link(self):
        a=self.create();c=self.config();c['modules']['entry']['type']='limit-level';d=self.draft(a,c);self.publish(a,d);a=self.s.detail(a['id'])['agent'];self.arm(a);self.s.tick();self.quote(self.i,100);self.s.tick()
        self.assertEqual(self.s.detail(a['id'])['orders'][0]['status'],'working');self.now+=1;self.quote(self.i,99.99)
        with self.e.db() as db:
            item=json.loads(db.execute("SELECT payload FROM outbox WHERE json_extract(payload,'$.account.id')=? AND json_extract(payload,'$.eventType')='execution'",(a['account']['id'],)).fetchone()[0])
        self.assertEqual(item['provenance']['agent']['version'],2);self.assertEqual(item['provenance']['agent']['id'],a['id'])
    def test_last_manual_account_cannot_be_deleted_even_with_agent_accounts(self):
        a=self.create()
        with self.e.db() as db:manual=db.execute('SELECT id FROM accounts WHERE id NOT IN (SELECT account_id FROM desk_agent_workspaces WHERE exclusive=1)').fetchall()
        self.assertEqual(len(manual),1)
        with self.assertRaisesRegex(ValueError,'manual trading account'):self.e.execute('delete-last-manual','account_delete',{'account_id':manual[0][0],'confirm_name':'The Desk Paper'})

    def test_restart_retains_resources_and_pauses_without_replay(self):
        a=self.create();self.arm(a);self.s.tick();restored=Agents(self.e,lambda:self.now);d=restored.detail(a['id'])
        self.assertEqual(d['agent']['state'],'paused');self.assertEqual(d['agent']['workspace']['chart_id'],a['workspace']['chart_id']);self.assertEqual(len(d['revisions']),1)
    def test_stale_liquidity_cannot_trigger_and_is_revision_scoped(self):
        a=self.create();c=self.config();c['chart']['liquidity']['enabled']=True;draft=self.draft(a,c);self.publish(a,draft);a=self.s.detail(a['id'])['agent']
        class Signals:
            errors={}
            def snapshot(inner,agent,revision):return {'revision':1,'observedAt':self.now-60,'liquidityReady':True,'levels':[]}
        self.s.signal_service=Signals();self.arm(a);self.s.tick();self.quote(self.i,100);self.s.tick();self.assertFalse(self.s.detail(a['id'])['runs'])
    def test_liquidity_run_persists_frame_cutoffs_and_verified_metadata(self):
        a=self.create();c=self.config();c['chart']['liquidity']['enabled']=True;c['chart']['levels']=[];c['modules']['signal']['sources']=['liquidity'];draft=self.draft(a,c);self.publish(a,draft);a=self.s.detail(a['id'])['agent']
        coverage=[{'instrument':self.i,'timeframe':'1m','as_of':self.now*1000,'last_completed':(self.now-60)*1000,'coverage':'SYNTHETIC'}]
        record={'revision':a['revision'],'liquidityReady':True,'observedAt':self.now,'calculatedAt':self.now,'instrumentMetadata':{'tick':'.01','metadata_verified':True},'coverage':coverage,'requests':[{'timeframe':'1','returned':500,'first':1,'last':2}], 'levels':[{'id':'pool','price':'100','label':'Pool fixture','source':'liquidity'}]}
        class Signals:
            errors={}
            def snapshot(inner,*args):return record
        self.s.signal_service=Signals();self.arm(a);self.s.tick();self.quote(self.i,100);self.s.tick()
        original=self.s.detail(a['id'])['runs'][0]['payload']['chart']['sourceInputs'];self.assertEqual(original['coverage'],coverage);self.assertTrue(original['instrumentMetadata']['metadata_verified'])
        restored=Agents(self.e,lambda:self.now);durable=restored.detail(a['id'],True)['runs'][0]['payload']['chart']['sourceInputs'];self.assertEqual(durable,original)

    def test_per_version_metrics_leave_prior_history_intact(self):
        a=self.create();self.arm(a);self.s.tick();self.quote(self.i,100);self.s.tick();self.quote(self.i,101)
        with self.e.db() as db:
            self.assertEqual(self.s.metrics(db,a['id'],1)['closedTrades'],1);self.assertEqual(self.s.metrics(db,a['id'],2)['closedTrades'],0)
    def test_migration_retains_old_config_and_does_not_claim_shared_account(self):
        a=self.create();c=self.config('Legacy');c.pop('chart');c['account']=a['account']
        with self.e.db() as db:
            db.execute('INSERT INTO desk_agents VALUES(?,?,?,?,?,?,?)',('legacy',1,json.dumps(c),'paused','',self.now,self.now));db.execute('INSERT INTO desk_agent_revisions VALUES(?,?,?,?)',('legacy',1,json.dumps(c),self.now))
        restored=Agents(self.e,lambda:self.now);d=restored.detail('legacy');self.assertEqual(d['agent']['revision'],2);self.assertNotIn('chart',d['revisions'][1]['config']);self.assertFalse(d['agent']['workspace']['exclusive'])

if __name__=='__main__':unittest.main()
