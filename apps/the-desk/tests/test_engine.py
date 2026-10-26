import json
import sqlite3
import sys
import tempfile
import time
import unittest
from pathlib import Path
from decimal import Decimal
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine import Engine

class PaperTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.path=Path(self.temp.name)/'desk.db';self.e=Engine(self.path)
        self.a=self.e.execute('account-a','account',{'name':'Test A','capital':'10000','fee_bps':'5','leverage':'1'})['id']
        self.i='hyperliquid:BTC';self.quote(100,101)
    def tearDown(self):self.temp.cleanup()
    def quote(self,bid,ask,i=None,**kw):self.e.ingest(i or self.i,bid,ask,{'tick':'.01','qty_step':'.001'},**kw)
    def order(self,key='order',**kw):
        return self.e.execute(key,'order',{'account_id':self.a,'instrument':self.i,'side':'buy','kind':'market','qty':'1',**kw})
    def state(self):return self.e.state(self.a)
    def test_market_fee_and_partial_exit_reconcile(self):
        order=self.order(qty='2');p=self.state()['positions'][0]
        self.assertEqual(order['position_id'],p['id']);self.assertEqual(order['positions'],[p])
        self.assertEqual(p['entry'],'101');self.assertEqual(Decimal(self.state()['accounts'][0]['balance']),Decimal('9999.899'))
        self.quote(110,111)
        self.e.execute('close','close',{'account_id':self.a,'id':p['id'],'revision':p['revision'],'qty':'.5'})
        s=self.state();self.assertEqual(s['positions'][0]['qty'],'1.5');self.assertEqual(Decimal(s['accounts'][0]['balance']),Decimal('10004.3715'))
        self.assertEqual(len(s['fills']),2)
        with self.e.db() as db:
            payload=json.loads(db.execute("SELECT payload FROM outbox WHERE event_id=?",(s['fills'][0]['id'],)).fetchone()[0])
        self.assertEqual(payload['execution']['fee'],.0275);self.assertTrue(payload['provenance']['simulation'])
    def test_small_eth_short_marks_and_account_totals_follow_each_quote(self):
        i='hyperliquid:ETH'
        self.quote('2401.2','2401.3',i)
        self.order(instrument=i,side='sell',qty='.001')
        position=self.state()['positions'][0]
        for ask,pnl in [('2401.5','-.0003'),('2402.0','-.0008'),('2402.5','-.0013')]:
            self.quote(str(Decimal(ask)-Decimal('.1')),ask,i)
            s=self.state();a=next(a for a in s['accounts'] if a['id']==self.a)
            self.assertEqual(Decimal(a['unrealized']),Decimal(pnl))
            self.assertEqual(Decimal(a['equity']),Decimal(a['balance'])+Decimal(pnl))
            self.assertEqual(s['quotes'][i]['ask'],ask)
            self.assertEqual(s['positions'][0],position)
        other=self.e.execute('other','account',{'name':'Other','capital':'1000'})['id']
        self.assertFalse(self.e.state(other)['positions'])
        self.assertEqual(Decimal(next(a for a in self.e.state(other)['accounts'] if a['id']==other)['unrealized']),0)

    def test_idempotency_and_changed_payload(self):
        one=self.order();two=self.order();self.assertEqual(one['id'],two['id']);self.assertEqual(len(self.state()['fills']),1)
        with self.assertRaisesRegex(ValueError,'different command'):self.order(qty='2')
    def test_limit_waits_and_price_improves(self):
        o=self.order(kind='limit',price='99');self.assertEqual(o['status'],'working');self.assertFalse(self.state()['fills'])
        self.quote(99,100);self.assertFalse(self.state()['fills'])
        self.quote(97,98);self.assertEqual(self.state()['orders'][0]['status'],'filled');self.assertEqual(self.state()['fills'][0]['price'],'98')
    def test_stop_limit_trigger_before_fill(self):
        self.order(kind='stop_limit',trigger='105',price='104')
        self.quote(102,103);self.assertEqual(self.state()['orders'][0]['status'],'working')
        self.quote(106,107);self.assertEqual(self.state()['orders'][0]['status'],'triggered');self.assertFalse(self.state()['fills'])
        self.quote(102,103);self.assertEqual(self.state()['orders'][0]['status'],'filled')
    def test_stop_market_gap(self):
        self.order(kind='stop',trigger='105');self.quote(109,110);self.assertEqual(self.state()['fills'][0]['price'],'110')
    def test_bracket_partial_exit_closes_remaining_once(self):
        self.order(qty='2',stop='95',target='110');p=self.state()['positions'][0]
        self.e.execute('partial','close',{'account_id':self.a,'id':p['id'],'revision':1,'qty':'.5'})
        self.quote(94,95);self.assertFalse(self.state()['positions']);self.assertEqual(self.state()['fills'][0]['qty'],'1.5')
        count=len(self.state()['fills']);self.quote(90,91);self.assertEqual(len(self.state()['fills']),count)
    def test_account_isolation(self):
        b=self.e.execute('b','account',{'name':'B','capital':'1000','fee_bps':'0'})['id'];self.order();p=self.state()['positions'][0]
        with self.assertRaises(ValueError):self.e.execute('wrong-close','close',{'account_id':b,'id':p['id'],'revision':1})
        self.assertFalse(self.e.state(b)['positions']);self.assertEqual(len(self.state()['positions']),1)
    def test_reversal_nets_and_retains_journal_legs(self):
        self.order();reversal=self.order('reverse',side='sell',qty='2');s=self.state()
        self.assertEqual(reversal['positions'],s['positions'])
        self.assertEqual(len(s['positions']),1);self.assertEqual(s['positions'][0]['side'],'sell');self.assertEqual(s['positions'][0]['qty'],'1');self.assertEqual(len(s['fills']),3)
    def test_spot_inventory_and_pending_sells(self):
        i='coinbase:BTC-USD';self.quote(100,101,i)
        with self.assertRaisesRegex(ValueError,'owned'):self.order(instrument=i,side='sell')
        self.order('spotbuy',instrument=i);self.order('spotsell',instrument=i,side='sell',kind='limit',price='110')
        with self.assertRaisesRegex(ValueError,'owned'):self.order('oversell',instrument=i,side='sell',kind='limit',price='111')
    def test_precision_and_buying_power(self):
        with self.assertRaisesRegex(ValueError,'multiple'):self.order(qty='.0001')
        with self.assertRaisesRegex(ValueError,'buying power'):self.order(qty='1000')
        with self.assertRaisesRegex(ValueError,'multiple'):self.order(kind='limit',price='99.999')
    def test_stale_quote_disables_commands(self):
        self.quote(100,101,received_at=time.time()-20)
        with self.assertRaisesRegex(ValueError,'Fresh'):self.order()
    def test_revision_and_cancel(self):
        o=self.order(kind='limit',price='95')
        change={'account_id':self.a,'id':o['id'],'revision':1,'price':'94','trigger':None,'stop':None,'target':None}
        result=self.e.execute('amend','amend',change);self.assertEqual(result['revision'],2)
        with self.assertRaisesRegex(ValueError,'changed'):self.e.execute('stale','cancel',{'account_id':self.a,'id':o['id'],'revision':1})
        self.e.execute('cancel','cancel',{'account_id':self.a,'id':o['id'],'revision':2});self.quote(89,90);self.assertFalse(self.state()['fills'])
    def test_restart_recovery_and_order_matching(self):
        self.order(kind='limit',price='95');self.e=Engine(self.path);self.quote(89,90)
        self.assertEqual(self.state()['orders'][0]['status'],'filled');self.assertEqual(len(self.state()['fills']),1)
    def test_pending_orders_survive_terminal_history_limit(self):
        pending=self.order('pending',kind='limit',price='90')
        for i in range(101):self.order('filled-'+str(i),qty='.001')
        orders=self.state()['orders']
        self.assertEqual(next(o for o in orders if o['id']==pending['id'])['status'],'working')
        self.assertEqual(sum(o['status']=='filled' for o in orders),100)
    def test_alert_is_durable_and_one_shot(self):
        self.e.execute('alert','alert',{'account_id':self.a,'instrument':self.i,'condition':'above','price':'105'});self.e=Engine(self.path);self.quote(106,107);self.quote(108,109)
        self.assertEqual(self.state()['alerts'][0]['status'],'triggered');self.assertEqual(sum(e['kind']=='alert' for e in self.state()['events']),1)

    def test_alerts_are_account_scoped(self):
        b=self.e.execute('account-b','account',{'name':'Other','capital':'1000'})['id']
        alert=self.e.execute('alert-scoped','alert',{'account_id':self.a,'instrument':self.i,'condition':'above','price':'105'})
        self.assertEqual(len(self.e.state(self.a)['alerts']),1);self.assertFalse(self.e.state(b)['alerts'])
        with self.assertRaisesRegex(ValueError,'not found'):self.e.execute('delete-wrong','alert_delete',{'account_id':b,'id':alert['id']})
        self.assertEqual(len(self.e.state(self.a)['alerts']),1)

    def test_legacy_alerts_are_not_assigned_to_an_account(self):
        legacy_path=self.path.with_name('legacy.db')
        db=sqlite3.connect(legacy_path)
        db.executescript("CREATE TABLE accounts(id TEXT PRIMARY KEY,name TEXT NOT NULL,capital TEXT NOT NULL,fee_bps TEXT NOT NULL,leverage TEXT NOT NULL,created_at TEXT NOT NULL); CREATE TABLE alerts(id TEXT PRIMARY KEY,instrument TEXT NOT NULL,condition TEXT NOT NULL,price TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL);")
        db.execute("INSERT INTO accounts VALUES ('legacy-account','Legacy','1000','5','1','2026-01-01T00:00:00Z')")
        db.execute("INSERT INTO alerts VALUES ('legacy-alert','hyperliquid:BTC','above','105','active','2026-01-01T00:00:00Z')")
        db.commit();db.close()
        migrated=Engine(legacy_path)
        self.assertFalse(migrated.state('legacy-account')['alerts'])
    def test_gap_bracket_rejection_atomic(self):
        self.order(kind='limit',price='99',stop='95',target='110');self.quote(89,90)
        self.assertEqual(self.state()['orders'][0]['status'],'rejected');self.assertFalse(self.state()['fills']);self.assertFalse(self.state()['positions'])
    def test_fill_outbox_atomic_on_failure(self):
        original=self.e.queue
        def fail(*a):raise RuntimeError('fault injected')
        self.e.queue=fail
        with self.assertRaises(RuntimeError):self.order()
        self.e.queue=original
        self.assertFalse(self.state()['orders']);self.assertFalse(self.state()['fills']);self.assertEqual(self.state()['accounts'][0]['balance'],'10000')

    def test_reset_generation_survives_restart_and_new_fills(self):
        self.order()
        self.e.execute('reset-journal','account_reset',{'account_id':self.a,'reset_journal':True})
        with self.e.db() as db:
            reset=json.loads(db.execute("SELECT payload FROM outbox WHERE event_id LIKE 'journal-reset-%'").fetchone()[0])
        self.assertEqual(reset['account']['resetGeneration'],1)
        self.e=Engine(self.path);self.quote(100,101)
        self.order('after-reset')
        with self.e.db() as db:
            fill=json.loads(db.execute("SELECT payload FROM outbox WHERE event_id=?",(self.e.state(self.a)['fills'][0]['id'],)).fetchone()[0])
        self.assertEqual(fill['account']['resetGeneration'],1)

    def test_offline_resets_keep_each_pending_generation_marker(self):
        self.e.execute('reset-journal-1','account_reset',{'account_id':self.a,'reset_journal':True})
        self.e.execute('reset-journal-2','account_reset',{'account_id':self.a,'reset_journal':True})
        with self.e.db() as db:
            rows=[json.loads(row['payload']) for row in db.execute("SELECT payload FROM outbox WHERE status='pending' ORDER BY sequence")]
        self.assertEqual([row['eventType'] for row in rows],['reset','reset'])
        self.assertEqual([row['account']['resetGeneration'] for row in rows],[1,2])

    def test_legacy_pending_reset_outbox_is_migrated_to_ordered_generation(self):
        account={'id':self.a,'name':'Test A · The Desk PAPER','currency':'USD','initialBalance':10000}
        with self.e.db() as db:
            db.execute('UPDATE accounts SET journal_generation=0 WHERE id=?',(self.a,))
            db.execute('DELETE FROM outbox')
            db.execute('INSERT INTO outbox(event_id,payload) VALUES(?,?)',('legacy-fill',json.dumps({
                'eventId':'legacy-fill','eventType':'execution','account':account})))
            db.execute('INSERT INTO outbox(event_id,payload) VALUES(?,?)',('legacy-reset',json.dumps({
                'eventId':'legacy-reset','eventType':'reset','account':account})))
        self.e=Engine(self.path)
        with self.e.db() as db:
            rows=[json.loads(row['payload']) for row in db.execute('SELECT payload FROM outbox ORDER BY sequence')]
        self.assertEqual(rows[0]['account']['resetGeneration'],0)
        self.assertEqual(rows[1]['account']['resetGeneration'],1)
        self.assertEqual(self.e.state(self.a)['accounts'][0]['journal_generation'],1)

    def test_legacy_delivered_reset_gets_non_destructive_watermark_anchor(self):
        legacy_path=self.path.with_name('legacy-watermark.db')
        db=sqlite3.connect(legacy_path)
        db.executescript("""
            CREATE TABLE accounts(id TEXT PRIMARY KEY,name TEXT NOT NULL,capital TEXT NOT NULL,fee_bps TEXT NOT NULL,leverage TEXT NOT NULL,created_at TEXT NOT NULL);
            CREATE TABLE outbox(sequence INTEGER PRIMARY KEY AUTOINCREMENT,event_id TEXT UNIQUE NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_attempt REAL NOT NULL DEFAULT 0,error TEXT NOT NULL DEFAULT '',journal_account TEXT);
        """)
        account={'id':'legacy-account','name':'Legacy · The Desk PAPER','currency':'USD','initialBalance':10000}
        db.execute('INSERT INTO accounts VALUES (?,?,?,?,?,?)',('legacy-account','Legacy','10000','5','1','2026-01-01T00:00:00Z'))
        db.execute('INSERT INTO outbox(event_id,payload,status) VALUES(?,?,?)',('legacy-reset',json.dumps({'eventId':'legacy-reset','eventType':'reset','account':account}),'delivered'))
        db.execute('INSERT INTO outbox(event_id,payload,status) VALUES(?,?,?)',('legacy-fill',json.dumps({'eventId':'legacy-fill','eventType':'execution','account':account}),'delivered'))
        db.commit();db.close()
        migrated=Engine(legacy_path)
        with migrated.db() as db:
            rows=[(row['status'],json.loads(row['payload'])) for row in db.execute('SELECT status,payload FROM outbox ORDER BY sequence')]
        self.assertEqual(rows[0][1]['eventType'],'watermark')
        self.assertEqual(rows[0][1]['account']['resetGeneration'],1)
        self.assertEqual(rows[0][0],'pending')
        self.assertEqual(rows[1][1]['account']['resetGeneration'],1)
        self.assertEqual(migrated.state('legacy-account')['accounts'][0]['journal_generation'],1)
        migrated=Engine(legacy_path)
        with migrated.db() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM outbox WHERE json_extract(payload,'$.eventType')='watermark'").fetchone()[0],1)
    def test_expiry_without_market_feed(self):
        o=self.order(kind='limit',price='95',ttl_seconds=60)
        self.e=Engine(self.path)
        self.assertEqual(self.e.expire(o['expires_at']+1),1)
        self.assertEqual(self.state()['orders'][0]['status'],'expired')
        self.assertEqual(self.state()['accounts'][0]['reserved'],'0')
        self.assertEqual(self.e.expire(o['expires_at']+2),0)
    def test_export_is_complete_scoped_and_reconciles(self):
        self.e.execute('other','account',{'name':'Other','capital':'100'})
        for i in range(101):self.order('many-'+str(i),qty='.001')
        exported=self.e.export(self.a)
        self.assertEqual(len(self.state()['fills']),100)
        self.assertEqual(len(exported['fills']),101)
        self.assertTrue(all(f['account_id']==self.a for f in exported['fills']))
        balance=Decimal(exported['account']['capital'])+sum(Decimal(x['amount']) for x in exported['cash'])
        self.assertEqual(balance,Decimal(exported['account']['balance']))

if __name__=='__main__':unittest.main()
