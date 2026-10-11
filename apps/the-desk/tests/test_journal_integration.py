"""Opt-in integration against an isolated copy of the existing Lux Journal runtime.

Run after launch.py --qa --port 18881 --journal-port 3101 --detach.
Never points at or reads the production journal database.
"""
import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import time
import unittest
from urllib.request import Request,urlopen
from urllib.error import HTTPError
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine import Engine
from server import Workers,Gateway,http_json

ROOT=Path(__file__).resolve().parents[1]
JOURNAL_URL='http://127.0.0.1:'+os.environ.get('QA_JOURNAL_PORT','3101')

@unittest.skipUnless((ROOT/'qa-data/bridge-token').is_file(),'Requires isolated QA journal on port 3101')
class JournalIntegration(unittest.TestCase):
    def test_actual_journal_reconstruction_retry_and_http_boundary(self):
        token=(ROOT/'qa-data/bridge-token').read_text().strip()
        journal_db=ROOT/'qa-data/journal/journal.db'
        self.assertTrue(journal_db.is_file())
        with tempfile.TemporaryDirectory() as tmp:
            e=Engine(Path(tmp)/'desk.db')
            a=e.execute('account','account',{'name':'Isolated reconciliation QA','capital':'10000','fee_bps':'5','leverage':'1'})['id']
            i='hyperliquid:BTC'
            def quote(bid,ask):e.ingest(i,bid,ask,{'tick':'.01','qty_step':'.001'})
            def order(key,side='buy',qty='1'):
                return e.execute(key,'order',{'account_id':a,'instrument':i,'side':side,'kind':'market','qty':qty})
            quote(100,101);order('entry',qty='2');p=e.state(a)['positions'][0]
            quote(110,111)
            e.execute('partial','close',{'id':p['id'],'account_id':a,'revision':1,'qty':'.5'})
            p=e.state(a)['positions'][0]
            e.execute('remaining','close',{'id':p['id'],'account_id':a,'revision':p['revision']})
            order('second-entry');order('reverse','sell','2')
            quote(111,112);p=e.state(a)['positions'][0]
            e.execute('short-close','close',{'id':p['id'],'account_id':a,'revision':p['revision']})
            self.assertEqual(len(e.state(a)['fills']),7)
            # Failed destination preserves all accepted fills and pending delivery.
            w=Workers(e,Gateway(),'http://127.0.0.1:9',token);w.dispatch()
            self.assertEqual(e.state(a)['journal']['pending'],8)
            with e.db() as db:db.execute('UPDATE outbox SET next_attempt=0')
            w.journal_url=JOURNAL_URL;w.dispatch()
            state=e.state(a);self.assertEqual(state['journal']['pending'],0)
            jid=state['journal']['account_id'];self.assertTrue(jid)
            with sqlite3.connect(str(journal_db)) as db:
                executions=db.execute('SELECT count(*),sum(fee) FROM executions WHERE account_id=?',(jid,)).fetchone()
                trades=db.execute("SELECT count(*),sum(net_pnl) FROM trades WHERE account_id=? AND status<>'open'",(jid,)).fetchone()
            self.assertEqual(executions[0],7);self.assertEqual(trades[0],3)
            self.assertAlmostEqual(float(state['accounts'][0]['balance'])-10000,trades[1],places=8)
            self.assertAlmostEqual(sum(float(f['fee']) for f in state['fills']),executions[1],places=8)
            # Re-send receipts after a simulated lost response. No duplicated fills.
            with e.db() as db:db.execute("UPDATE outbox SET status='pending',next_attempt=0")
            e=Engine(Path(tmp)/'desk.db');w.engine=e;w.dispatch()
            self.assertEqual(e.state(a)['journal']['pending'],0)
            self.assertEqual(e.state(a)['journal']['account_id'],jid)
            with sqlite3.connect(str(journal_db)) as db:
                self.assertEqual(db.execute('SELECT count(*) FROM executions WHERE account_id=?',(jid,)).fetchone()[0],7)
            stats=http_json(JOURNAL_URL+'/api/stats?accounts='+jid)
            self.assertEqual(stats['metrics']['closedTrades'],3)
            self.assertAlmostEqual(stats['metrics']['netPnl'],trades[1],places=8)
        for headers,code in [({'Origin':'https://untrusted.example','Content-Type':'application/json'},403),({'Content-Type':'text/plain'},403),({'Host':'untrusted.example','Content-Type':'application/json'},403)]:
            req=Request('http://127.0.0.1:18881/api/command',data=b'{}',headers=headers)
            with self.assertRaises(HTTPError) as rejected:urlopen(req,timeout=3)
            self.assertEqual(rejected.exception.code,code)
        with self.assertRaises(HTTPError) as denied:http_json(JOURNAL_URL+'/api/integrations/count-desk',{})
        self.assertEqual(denied.exception.code,401)

if __name__=='__main__':unittest.main()
