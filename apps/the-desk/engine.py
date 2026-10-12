"""The Desk: durable local paper execution. Never routes venue orders."""
from __future__ import annotations
import hashlib
import json
import sqlite3
import threading
import time
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_FLOOR
from contextlib import contextmanager

def stamp(t=None):
    return datetime.fromtimestamp(t or time.time(), timezone.utc).isoformat().replace('+00:00','Z')

def dec(value, positive=False):
    try:
        n=Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError('Invalid numeric value')
    if not n.is_finite() or (positive and n<=0):
        raise ValueError('A finite positive value is required')
    return n

def uid(prefix): return prefix+'-'+uuid.uuid4().hex

class Engine:
    def __init__(self, path):
        self.path=str(path)
        self.lock=threading.RLock()
        self.quotes={}
        with self.db() as db:
            db.executescript('''
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,name TEXT NOT NULL,capital TEXT NOT NULL,fee_bps TEXT NOT NULL,leverage TEXT NOT NULL,created_at TEXT NOT NULL,journal_generation INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id),instrument TEXT NOT NULL,side TEXT NOT NULL,kind TEXT NOT NULL,qty TEXT NOT NULL,price TEXT,trigger TEXT,stop TEXT,target TEXT,status TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,created_at REAL NOT NULL,updated_at TEXT NOT NULL,triggered_at REAL,filled_price TEXT,position_id TEXT,expires_at REAL);
            CREATE TABLE IF NOT EXISTS positions(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id),instrument TEXT NOT NULL,side TEXT NOT NULL,qty TEXT NOT NULL,entry TEXT NOT NULL,stop TEXT,target TEXT,status TEXT NOT NULL,opened_at TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1);
            CREATE TABLE IF NOT EXISTS fills(id TEXT PRIMARY KEY,order_id TEXT,account_id TEXT NOT NULL REFERENCES accounts(id),position_id TEXT,instrument TEXT NOT NULL,side TEXT NOT NULL,qty TEXT NOT NULL,price TEXT NOT NULL,fee TEXT NOT NULL,realized TEXT NOT NULL,reason TEXT NOT NULL,executed_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS cash(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id),amount TEXT NOT NULL,kind TEXT NOT NULL,created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS outbox(sequence INTEGER PRIMARY KEY AUTOINCREMENT,event_id TEXT UNIQUE NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_attempt REAL NOT NULL DEFAULT 0,error TEXT NOT NULL DEFAULT '',journal_account TEXT);
            CREATE TABLE IF NOT EXISTS commands(id TEXT PRIMARY KEY,hash TEXT NOT NULL,result TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS alerts(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id),instrument TEXT NOT NULL,condition TEXT NOT NULL,price TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL,content TEXT NOT NULL,created_at TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS orders_working ON orders(status,instrument);
            CREATE INDEX IF NOT EXISTS positions_open ON positions(status,account_id,instrument);
            ''')
            if 'account_id' not in {row['name'] for row in db.execute('PRAGMA table_info(alerts)')}:
                db.execute('ALTER TABLE alerts ADD COLUMN account_id TEXT REFERENCES accounts(id)')
            if 'journal_generation' not in {row['name'] for row in db.execute('PRAGMA table_info(accounts)')}:
                db.execute('ALTER TABLE accounts ADD COLUMN journal_generation INTEGER NOT NULL DEFAULT 0')
            self.migrate_journal_generations(db)
            db.execute('CREATE INDEX IF NOT EXISTS alerts_account ON alerts(account_id,instrument,status)')

    @contextmanager
    def db(self):
        db=sqlite3.connect(self.path, timeout=15)
        db.row_factory=sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        try:
            with db:yield db
        finally:db.close()

    def event(self,db,kind,content):
        db.execute('INSERT INTO events(kind,content,created_at) VALUES(?,?,?)',(kind,json.dumps(content),stamp()))

    def migrate_journal_generations(self,db):
        accounts={row['id']: row for row in db.execute('SELECT id,journal_generation FROM accounts')}
        for account_id, account in accounts.items():
            generation=int(account['journal_generation'] or 0)
            rows=db.execute("SELECT sequence,payload FROM outbox WHERE json_extract(payload,'$.account.id')=? ORDER BY sequence",(account_id,)).fetchall()
            for row in rows:
                payload=json.loads(row['payload'])
                account_payload=payload.setdefault('account',{})
                event_generation=account_payload.get('resetGeneration')
                if isinstance(event_generation,int) and event_generation >= 0:
                    generation=max(generation,event_generation)
                elif payload.get('eventType') == 'reset':
                    generation+=1
                    account_payload['resetGeneration']=generation
                else:
                    account_payload['resetGeneration']=generation
                db.execute('UPDATE outbox SET payload=? WHERE sequence=?',(json.dumps(payload),row['sequence']))
            db.execute('UPDATE accounts SET journal_generation=? WHERE id=?',(generation,account_id))

    def queue(self,db,event_id,payload):
        db.execute('INSERT OR IGNORE INTO outbox(event_id,payload) VALUES(?,?)',(event_id,json.dumps(payload)))

    def account_payload(self,a):
        return {'id':a['id'],'name':a['name']+' · The Desk PAPER','currency':'USD','initialBalance':float(dec(a['capital'])),
                'resetGeneration':int(a['journal_generation'] or 0)}

    def instrument(self, value):
        if value not in ('coinbase:BTC-USD','coinbase:ETH-USD','coinbase:SOL-USD','hyperliquid:BTC','hyperliquid:ETH','hyperliquid:SOL'):
            raise ValueError('Unsupported MVP instrument. Select BTC, ETH or SOL on Coinbase or Hyperliquid.')
        return value

    def quote(self, instrument):
        q=self.quotes.get(instrument)
        if not q or time.time()-q['received_at']>15:
            raise ValueError('Fresh server quote unavailable. Wait for the exchange feed to reconnect.')
        if not q.get('bid') or not q.get('ask') or dec(q['ask'])<dec(q['bid']):
            raise ValueError('Executable bid/ask quote unavailable.')
        return q

    def account(self,db,aid):
        a=db.execute('SELECT * FROM accounts WHERE id=?',(aid,)).fetchone()
        if not a: raise ValueError('Choose a valid paper account.')
        return a

    def funds(self,db,a):
        balance=dec(a['capital'])+sum((dec(r['amount']) for r in db.execute('SELECT amount FROM cash WHERE account_id=?',(a['id'],))),Decimal(0))
        unrealized=Decimal(0);margin=Decimal(0);reserved=Decimal(0)
        for p in db.execute("SELECT * FROM positions WHERE account_id=? AND status='open'",(a['id'],)):
            qty=dec(p['qty']); entry=dec(p['entry']);q=self.quotes.get(p['instrument'])
            mark=dec(q['bid'] if p['side']=='buy' else q['ask']) if q else entry
            unrealized+=(mark-entry)*qty*(1 if p['side']=='buy' else -1)
            margin+=entry*qty/(Decimal(1) if p['instrument'].startswith('coinbase:') else dec(a['leverage']))
        for o in db.execute("SELECT * FROM orders WHERE account_id=? AND status IN ('working','triggered')",(a['id'],)):
            q=self.quotes.get(o['instrument']);px=dec(o['price'] or o['trigger'] or (q['ask'] if q else '0'))
            reserved+=px*dec(o['qty'])/(Decimal(1) if o['instrument'].startswith('coinbase:') else dec(a['leverage']))
        return {'balance':balance,'unrealized':unrealized,'equity':balance+unrealized,'margin':margin,'reserved':reserved,'buying_power':max(Decimal(0),balance+unrealized-margin-reserved)}

    def execute(self,key,action,payload):
        if not key or len(key)>200: raise ValueError('An idempotency key is required.')
        h=hashlib.sha256(json.dumps([action,payload],sort_keys=True).encode()).hexdigest()
        with self.lock, self.db() as db:
            db.execute('BEGIN IMMEDIATE')
            old=db.execute('SELECT * FROM commands WHERE id=?',(key,)).fetchone()
            if old:
                if old['hash']!=h: raise ValueError('Idempotency key was reused for a different command.')
                return json.loads(old['result'])
            methods={'account':self.create_account,'account_update':self.update_account,'account_reset':self.reset_account,'account_delete':self.delete_account,'order':self.create_order,'amend':self.amend,'cancel':self.cancel,'close':self.close,'bracket':self.bracket,'alert':self.create_alert,'alert_delete':self.delete_alert,'cancel_orders':self.cancel_orders,'flatten':self.flatten,'reverse':self.reverse}
            if action not in methods: raise ValueError('Unknown command')
            result=methods[action](db,payload)
            db.execute('INSERT INTO commands VALUES(?,?,?)',(key,h,json.dumps(result)))
            return result

    def create_account(self,db,p):
        name=str(p.get('name','')).strip()
        if not name or len(name)>80: raise ValueError('Account name must contain 1–80 characters.')
        capital=dec(p.get('capital'),True);fee=dec(p.get('fee_bps',5));lev=dec(p.get('leverage',1),True)
        if capital>Decimal('1000000000') or not 0<=fee<=1000 or not 1<=lev<=20: raise ValueError('Capital, fees or paper leverage are outside supported limits.')
        a={'id':uid('desk-paper'),'name':name,'capital':str(capital),'fee_bps':str(fee),'leverage':str(lev),'created_at':stamp(),'journal_generation':0}
        db.execute('INSERT INTO accounts(id,name,capital,fee_bps,leverage,created_at,journal_generation) VALUES(:id,:name,:capital,:fee_bps,:leverage,:created_at,0)',a)
        self.queue(db,a['id']+':account',{'eventId':a['id']+':account','eventType':'account','account':self.account_payload(a)})
        self.event(db,'account',{'account_id':a['id'],'message':'Paper account created: '+name})
        return a

    def reset_journal(self,db,a):
        db.execute("DELETE FROM outbox WHERE status='pending' AND json_extract(payload,'$.account.id')=?",(a['id'],))
        db.execute('UPDATE accounts SET journal_generation=journal_generation+1 WHERE id=?',(a['id'],))
        a=db.execute('SELECT * FROM accounts WHERE id=?',(a['id'],)).fetchone()
        event_id=uid('journal-reset')
        self.queue(db,event_id,{'eventId':event_id,'eventType':'reset','account':self.account_payload(a)})

    def update_account(self,db,p):
        a=self.account(db,p.get('account_id'))
        name=str(p.get('name','')).strip()
        if not name or len(name)>80:raise ValueError('Account name must contain 1–80 characters.')
        capital=dec(p.get('capital'),True);fee=dec(p.get('fee_bps'));lev=dec(p.get('leverage'),True)
        if capital>Decimal('1000000000') or not 0<=fee<=1000 or not 1<=lev<=20:raise ValueError('Capital, fees or paper leverage are outside supported limits.')
        db.execute('UPDATE accounts SET name=?,capital=?,fee_bps=?,leverage=? WHERE id=?',(name,str(capital),str(fee),str(lev),a['id']))
        updated=db.execute('SELECT * FROM accounts WHERE id=?',(a['id'],)).fetchone()
        if p.get('reset_journal') is True:self.reset_journal(db,updated)
        else:
            event_id=uid('account-update')
            self.queue(db,event_id,{'eventId':event_id,'eventType':'account','account':self.account_payload(updated)})
        self.event(db,'account',{'account_id':a['id'],'message':'Paper account settings updated: '+name})
        return {'account_id':a['id'],'journal_reset_queued':p.get('reset_journal') is True}

    def reset_account(self,db,p):
        a=self.account(db,p.get('account_id'))
        for table in ('orders','positions','fills','cash','alerts'):
            db.execute('DELETE FROM '+table+' WHERE account_id=?',(a['id'],))
        db.execute("DELETE FROM events WHERE json_extract(content,'$.account_id')=?",(a['id'],))
        if p.get('reset_journal') is True:self.reset_journal(db,a)
        self.event(db,'account',{'account_id':a['id'],'message':'Paper account reset to starting capital'})
        return {'account_id':a['id'],'journal_reset_queued':p.get('reset_journal') is True}

    def delete_account(self,db,p):
        a=self.account(db,p.get('account_id'))
        if db.execute('SELECT COUNT(*) FROM accounts').fetchone()[0]<2:raise ValueError('Create another paper account before deleting the last one.')
        for table in ('orders','positions','fills','cash','alerts'):
            db.execute('DELETE FROM '+table+' WHERE account_id=?',(a['id'],))
        db.execute("DELETE FROM events WHERE json_extract(content,'$.account_id')=?",(a['id'],))
        if p.get('reset_journal') is True:self.reset_journal(db,a)
        db.execute('DELETE FROM accounts WHERE id=?',(a['id'],))
        return {'deleted':a['id'],'journal_reset_queued':p.get('reset_journal') is True}

    def validate_levels(self,side,entry,stop,target):
        if stop is not None and ((side=='buy' and stop>=entry) or (side=='sell' and stop<=entry)):raise ValueError('Stop loss must be on the loss side of entry.')
        if target is not None and ((side=='buy' and target<=entry) or (side=='sell' and target>=entry)):raise ValueError('Take profit must be on the profit side of entry.')

    def precision(self,q,qty,price=None):
        step=dec(q.get('qty_step','0.000001'),True)
        if qty<step or qty%step:raise ValueError('Quantity must be a multiple of '+str(step))
        if price is not None:
            tick=dec(q.get('tick','0.01'),True)
            if price%tick:raise ValueError('Price must be a multiple of '+str(tick))

    def create_order(self,db,p):
        a=self.account(db,p.get('account_id'));instrument=self.instrument(p.get('instrument'));q=self.quote(instrument)
        side=p.get('side');kind=p.get('kind');qty=dec(p.get('qty'),True)
        if side not in ('buy','sell') or kind not in ('market','limit','stop','stop_limit'):raise ValueError('Unsupported side or order type.')
        price=dec(p.get('price'),True) if kind in ('limit','stop_limit') else None
        trigger=dec(p.get('trigger'),True) if kind in ('stop','stop_limit') else None
        entry=price or trigger or dec(q['ask'] if side=='buy' else q['bid'])
        stop=dec(p['stop'],True) if p.get('stop') else None;target=dec(p['target'],True) if p.get('target') else None
        self.precision(q,qty,price);self.validate_levels(side,entry,stop,target)
        for level in (trigger,stop,target):
            if level is not None:self.precision(q,qty,level)
        # Spot shorts require owned long exposure. Perpetuals allow paper shorts.
        longs=sum((dec(r['qty']) for r in db.execute("SELECT qty FROM positions WHERE account_id=? AND instrument=? AND side='buy' AND status='open'",(a['id'],instrument))),Decimal(0))
        pending_sells=sum((dec(r['qty']) for r in db.execute("SELECT qty FROM orders WHERE account_id=? AND instrument=? AND side='sell' AND status IN ('working','triggered')",(a['id'],instrument))),Decimal(0))
        if instrument.startswith('coinbase:') and side=='sell' and qty>longs-pending_sells:raise ValueError('Coinbase spot paper selling requires available owned quantity. Use Hyperliquid for paper shorts.')
        opposite=sum((dec(r['qty']) for r in db.execute("SELECT qty FROM positions WHERE account_id=? AND instrument=? AND side<>? AND status='open'",(a['id'],instrument,side))),Decimal(0))
        new_qty=max(Decimal(0),qty-opposite)
        required=new_qty*entry/(Decimal(1) if instrument.startswith('coinbase:') else dec(a['leverage']))+qty*entry*dec(a['fee_bps'])/10000
        # An exposure-reducing exit must remain available during a drawdown.
        # Its commission is charged to the ledger when the position is reduced.
        if new_qty and required>self.funds(db,a)['buying_power']:raise ValueError('Insufficient paper buying power.')
        ttl=int(p.get('ttl_seconds',0))
        if ttl not in (0,60,3600,86400):raise ValueError('Unsupported time in force.')
        o={'id':uid('order'),'account_id':a['id'],'instrument':instrument,'side':side,'kind':kind,'qty':str(qty),'price':str(price) if price else None,'trigger':str(trigger) if trigger else None,'stop':str(stop) if stop else None,'target':str(target) if target else None,'status':'working','revision':1,'created_at':time.time(),'updated_at':stamp(),'expires_at':time.time()+ttl if ttl else None}
        db.execute('INSERT INTO orders(id,account_id,instrument,side,kind,qty,price,trigger,stop,target,status,revision,created_at,updated_at,expires_at) VALUES(:id,:account_id,:instrument,:side,:kind,:qty,:price,:trigger,:stop,:target,:status,:revision,:created_at,:updated_at,:expires_at)',o)
        self.event(db,'order',{'account_id':a['id'],'order_id':o['id'],'message':side.upper()+' '+kind+' accepted · PAPER'})
        if kind=='market':self.fill_order(db,o,dec(q['ask'] if side=='buy' else q['bid']))
        return dict(db.execute('SELECT * FROM orders WHERE id=?',(o['id'],)).fetchone())

    def owned_order(self,db,p):
        o=db.execute('SELECT * FROM orders WHERE id=? AND account_id=?',(p.get('id'),p.get('account_id'))).fetchone()
        if not o:raise ValueError('Order not found for selected account.')
        if o['status'] not in ('working','triggered'):raise ValueError('Order is no longer working. Refresh accepted state.')
        if int(p.get('revision',0))!=o['revision']:raise ValueError('Order changed while editing. Reload and retry.')
        return o

    def amend(self,db,p):
        o=self.owned_order(db,p);q=self.quote(o['instrument']);a=self.account(db,o['account_id'])
        qty=dec(p.get('qty',o['qty']),True);self.precision(q,qty)
        fields={k:dec(p[k],True) if p.get(k) else None for k in ('price','trigger','stop','target')}
        if o['kind'] in ('limit','stop_limit') and fields['price'] is None:raise ValueError('Limit price is required.')
        if o['kind'] in ('stop','stop_limit') and fields['trigger'] is None:raise ValueError('Trigger is required.')
        entry=fields['price'] or fields['trigger'] or dec(q['ask'] if o['side']=='buy' else q['bid'])
        self.validate_levels(o['side'],entry,fields['stop'],fields['target'])
        for v in fields.values():
            if v is not None:self.precision(q,qty,v)
        if o['instrument'].startswith('coinbase:') and o['side']=='sell':
            longs=sum((dec(r['qty']) for r in db.execute("SELECT qty FROM positions WHERE account_id=? AND instrument=? AND side='buy' AND status='open'",(a['id'],o['instrument']))),Decimal(0))
            other_sells=sum((dec(r['qty']) for r in db.execute("SELECT qty FROM orders WHERE account_id=? AND instrument=? AND side='sell' AND status IN ('working','triggered') AND id<>?",(a['id'],o['instrument'],o['id']))),Decimal(0))
            if qty>longs-other_sells:raise ValueError('Coinbase spot amendment exceeds available owned quantity.')
        old_price=dec(o['price'] or o['trigger'] or entry)
        lev=Decimal(1) if o['instrument'].startswith('coinbase:') else dec(a['leverage'])
        additional=max(Decimal(0),(entry*qty-old_price*dec(o['qty']))*(1/lev+dec(a['fee_bps'])/10000))
        if additional>self.funds(db,a)['buying_power']:raise ValueError('Amendment exceeds buying power.')
        db.execute('UPDATE orders SET price=?,trigger=?,stop=?,target=?,qty=?,revision=revision+1,updated_at=? WHERE id=?',tuple(str(fields[k]) if fields[k] else None for k in ('price','trigger','stop','target'))+(str(qty),stamp(),o['id']))
        return dict(db.execute('SELECT * FROM orders WHERE id=?',(o['id'],)).fetchone())

    def cancel(self,db,p):
        o=self.owned_order(db,p)
        db.execute("UPDATE orders SET status='cancelled',revision=revision+1,updated_at=? WHERE id=?",(stamp(),o['id']))
        self.event(db,'cancel',{'account_id':o['account_id'],'message':'Paper order cancelled','order_id':o['id']})
        return {'cancelled':o['id']}

    def scoped_refs(self,db,p,table,key,complete=False):
        self.account(db,p.get('account_id'));instrument=self.instrument(p.get('instrument'))
        refs=p.get(key)
        if not isinstance(refs,list) or len(refs)>100:raise ValueError('A reviewed list of at most 100 items is required.')
        ids=[];result=[]
        for ref in refs:
            if not isinstance(ref,dict) or ref.get('id') in ids:raise ValueError('Invalid or repeated item reference.')
            row=db.execute('SELECT * FROM '+table+' WHERE id=? AND account_id=? AND instrument=?',(ref.get('id'),p['account_id'],instrument)).fetchone()
            allowed=('working','triggered') if table=='orders' else ('open',)
            if not row or row['status'] not in allowed or row['revision']!=ref.get('revision'):raise ValueError('Trading state changed. Refresh and review the action again.')
            ids.append(row['id']);result.append(row)
        if complete:
            condition="status IN ('working','triggered')" if table=='orders' else "status='open'"
            current={r['id'] for r in db.execute('SELECT id FROM '+table+' WHERE account_id=? AND instrument=? AND '+condition,(p['account_id'],instrument))}
            if current!=set(ids):raise ValueError('Trading state changed. Refresh and review the action again.')
        return result

    def cancel_orders(self,db,p):
        orders=self.scoped_refs(db,p,'orders','orders')
        for o in orders:self.cancel(db,{'account_id':p['account_id'],'id':o['id'],'revision':o['revision']})
        return {'cancelled':[o['id'] for o in orders]}

    def flatten(self,db,p):
        orders=self.scoped_refs(db,p,'orders','orders',True);positions=self.scoped_refs(db,p,'positions','positions',True)
        if positions:self.quote(p['instrument'])
        for o in orders:self.cancel(db,{'account_id':p['account_id'],'id':o['id'],'revision':o['revision']})
        for row in positions:self.close(db,{'account_id':p['account_id'],'id':row['id'],'revision':row['revision']})
        return {'cancelled':[o['id'] for o in orders],'closed':[row['id'] for row in positions]}

    def reverse(self,db,p):
        orders=self.scoped_refs(db,p,'orders','orders',True);positions=self.scoped_refs(db,p,'positions','positions',True)
        if p['instrument'].startswith('coinbase:'):raise ValueError('Spot reversal cannot open a short. Close owned spot quantity instead.')
        net=sum((dec(row['qty'])*(1 if row['side']=='buy' else -1) for row in positions),Decimal(0))
        if not net:raise ValueError('No net position to reverse.')
        self.quote(p['instrument'])
        for o in orders:self.cancel(db,{'account_id':p['account_id'],'id':o['id'],'revision':o['revision']})
        return self.create_order(db,{'account_id':p['account_id'],'instrument':p['instrument'],'side':'sell' if net>0 else 'buy','kind':'market','qty':str(abs(net)*2)})

    def cash(self,db,aid,amount,kind):
        db.execute('INSERT INTO cash VALUES(?,?,?,?,?)',(uid('cash'),aid,str(amount),kind,stamp()))

    def record_fill(self,db,a,order_id,pos,instrument,side,qty,price,realized,reason):
        fee=qty*price*dec(a['fee_bps'])/10000;fid=uid('fill');when=stamp()
        db.execute('INSERT INTO fills VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',(fid,order_id,a['id'],pos,instrument,side,str(qty),str(price),str(fee),str(realized),reason,when))
        self.cash(db,a['id'],realized-fee,'fill')
        symbol=instrument.upper()+('-PERP' if instrument.startswith('hyperliquid:') else '')
        payload={'eventId':fid,'eventType':'execution','account':self.account_payload(a),'execution':{'id':fid,'symbol':symbol,'side':side,'quantity':float(qty),'price':float(price),'fee':float(fee),'executedAt':when,'multiplier':1,'assetClass':'crypto'},'provenance':{'positionId':pos,'source':instrument+' bid/ask quote · PAPER SIMULATED','timeframe':'quote','simulation':True}}
        self.queue(db,fid,payload)
        self.event(db,'fill',{'account_id':a['id'],'message':side.upper()+' '+str(qty)+' '+instrument+' @ '+str(price)+' · '+reason,'fill_id':fid})

    def exit_position(self,db,p,qty,price,reason,order_id=None):
        a=self.account(db,p['account_id']);qty=min(qty,dec(p['qty']))
        side='sell' if p['side']=='buy' else 'buy'
        realized=(price-dec(p['entry']))*qty*(1 if p['side']=='buy' else -1)
        self.record_fill(db,a,order_id,p['id'],p['instrument'],side,qty,price,realized,reason)
        remain=dec(p['qty'])-qty
        db.execute('UPDATE positions SET qty=?,status=?,revision=revision+1 WHERE id=?',(str(remain),'open' if remain else 'closed',p['id']))

    def fill_order(self,db,o,price):
        a=self.account(db,o['account_id']);remain=dec(o['qty']);posid=None
        # Revalidate spot inventory at fill time; another exit may have consumed it.
        if o['instrument'].startswith('coinbase:') and o['side']=='sell':
            owned=sum((dec(r['qty']) for r in db.execute("SELECT qty FROM positions WHERE account_id=? AND instrument=? AND side='buy' AND status='open'",(a['id'],o['instrument']))),Decimal(0))
            if remain>owned:
                db.execute("UPDATE orders SET status='rejected',revision=revision+1,updated_at=? WHERE id=?",(stamp(),o['id']))
                self.event(db,'rejection',{'account_id':a['id'],'message':'Spot inventory changed before fill','order_id':o['id']});return
        for p in db.execute("SELECT * FROM positions WHERE account_id=? AND instrument=? AND side<>? AND status='open' ORDER BY opened_at,id",(a['id'],o['instrument'],o['side'])).fetchall():
            if not remain:break
            close_qty=min(remain,dec(p['qty']));self.exit_position(db,p,close_qty,price,'netting',o['id']);remain-=close_qty
        if remain:
            q=self.quotes.get(o['instrument'],{});lev=Decimal(1) if o['instrument'].startswith('coinbase:') else dec(a['leverage'])
            # Remove this order's reserved margin for the final fill-time check.
            db.execute("UPDATE orders SET status='matching' WHERE id=?",(o['id'],))
            required=remain*price/lev+remain*price*dec(a['fee_bps'])/10000
            if required>self.funds(db,a)['buying_power']:
                raise ValueError('Paper margin changed before fill')
            posid=uid('position')
            # A gap beyond a bracket invalidates that protection; reject before opening.
            self.validate_levels(o['side'],price,dec(o['stop']) if o['stop'] else None,dec(o['target']) if o['target'] else None)
            db.execute('INSERT INTO positions VALUES(?,?,?,?,?,?,?,?,?,?,?)',(posid,a['id'],o['instrument'],o['side'],str(remain),str(price),o['stop'],o['target'],'open',stamp(),1))
            self.record_fill(db,a,o['id'],posid,o['instrument'],o['side'],remain,price,Decimal(0),'entry')
        db.execute("UPDATE orders SET status='filled',filled_price=?,position_id=?,revision=revision+1,updated_at=? WHERE id=?",(str(price),posid,stamp(),o['id']))

    def close(self,db,p):
        row=db.execute("SELECT * FROM positions WHERE id=? AND account_id=? AND status='open'",(p.get('id'),p.get('account_id'))).fetchone()
        if not row:raise ValueError('Open position not found for this account.')
        if int(p.get('revision',0))!=row['revision']:raise ValueError('Position changed. Reload and retry.')
        q=self.quote(row['instrument']);qty=dec(p.get('qty') or row['qty'],True)
        if qty>dec(row['qty']):raise ValueError('Exit quantity exceeds open position.')
        self.precision(q,qty)
        self.exit_position(db,row,qty,dec(q['bid'] if row['side']=='buy' else q['ask']),'manual exit')
        return {'closed_quantity':str(qty),'position_id':row['id']}

    def bracket(self,db,p):
        row=db.execute("SELECT * FROM positions WHERE id=? AND account_id=? AND status='open'",(p.get('id'),p.get('account_id'))).fetchone()
        if not row or row['revision']!=int(p.get('revision',0)):raise ValueError('Position changed. Reload and retry.')
        q=self.quote(row['instrument']);stop=dec(p['stop'],True) if p.get('stop') else None;target=dec(p['target'],True) if p.get('target') else None
        reference=dec(q['bid'] if row['side']=='buy' else q['ask'])
        self.validate_levels(row['side'],reference,stop,target)
        for level in (stop,target):
            if level is not None:self.precision(q,dec(row['qty']),level)
        db.execute('UPDATE positions SET stop=?,target=?,revision=revision+1 WHERE id=?',(str(stop) if stop else None,str(target) if target else None,row['id']))
        return {'updated':row['id']}

    def create_alert(self,db,p):
        self.account(db,p.get('account_id'))
        instrument=self.instrument(p.get('instrument'));price=dec(p.get('price'),True);condition=p.get('condition')
        if condition not in ('above','below'):raise ValueError('Choose above or below.')
        aid=uid('alert');db.execute('INSERT INTO alerts(id,account_id,instrument,condition,price,status,created_at) VALUES(?,?,?,?,?,?,?)',(aid,p['account_id'],instrument,condition,str(price),'active',stamp()))
        return {'id':aid}

    def delete_alert(self,db,p):
        self.account(db,p.get('account_id'))
        if not db.execute('SELECT 1 FROM alerts WHERE id=? AND account_id=?',(p.get('id'),p.get('account_id'))).fetchone():raise ValueError('Alert not found for selected account.')
        db.execute('DELETE FROM alerts WHERE id=? AND account_id=?',(p.get('id'),p.get('account_id')));return {'deleted':p.get('id')}

    def expire(self,now=None):
        with self.lock, self.db() as db:
            now=time.time() if now is None else now
            rows=db.execute("SELECT * FROM orders WHERE status IN ('working','triggered') AND expires_at IS NOT NULL AND expires_at<=?",(now,)).fetchall()
            for o in rows:
                db.execute("UPDATE orders SET status='expired',revision=revision+1,updated_at=? WHERE id=?",(stamp(now),o['id']))
                self.event(db,'expiry',{'account_id':o['account_id'],'order_id':o['id'],'message':'Paper order expired'})
            return len(rows)

    def ingest(self,instrument,bid,ask,metadata=None,received_at=None):
        self.instrument(instrument);bid=dec(bid,True);ask=dec(ask,True)
        if ask<bid:raise ValueError('Crossed order book')
        when=received_at or time.time()
        with self.lock:
            q={'bid':str(bid),'ask':str(ask),'last':str((bid+ask)/2),'received_at':when,'source':'public exchange bid/ask','tick':'0.01','qty_step':'0.000001',**(metadata or {})}
            self.quotes[instrument]=q
            if time.time()-when>15:return
            with self.db() as db:
                db.execute('BEGIN IMMEDIATE')
                for o in db.execute("SELECT * FROM orders WHERE instrument=? AND status IN ('working','triggered') ORDER BY created_at,id",(instrument,)).fetchall():
                    if o['expires_at'] and time.time()>=o['expires_at']:
                        db.execute("UPDATE orders SET status='expired',revision=revision+1,updated_at=? WHERE id=?",(stamp(),o['id']))
                        self.event(db,'expiry',{'account_id':o['account_id'],'order_id':o['id'],'message':'Paper order expired'});continue
                    if when<=o['created_at']:continue
                    px=ask if o['side']=='buy' else bid;triggered=o['status']=='triggered'
                    if o['kind'] in ('stop','stop_limit') and not triggered:
                        hit=px>=dec(o['trigger']) if o['side']=='buy' else px<=dec(o['trigger'])
                        if not hit:continue
                        db.execute("UPDATE orders SET status='triggered',triggered_at=?,revision=revision+1 WHERE id=?",(when,o['id']))
                        triggered=True
                    eligible=(o['kind']=='stop' and triggered) or (o['kind']=='limit') or (o['kind']=='stop_limit' and triggered)
                    if not eligible:continue
                    if o['kind']!='stop' and not (px<=dec(o['price']) if o['side']=='buy' else px>=dec(o['price'])):continue
                    db.execute('SAVEPOINT match_order')
                    try:
                        self.fill_order(db,o,px)
                        db.execute('RELEASE match_order')
                    except ValueError as e:
                        db.execute('ROLLBACK TO match_order')
                        db.execute('RELEASE match_order')
                        db.execute("UPDATE orders SET status='rejected',revision=revision+1 WHERE id=?",(o['id'],))
                        self.event(db,'rejection',{'account_id':o['account_id'],'message':str(e),'order_id':o['id']})
                for p in db.execute("SELECT * FROM positions WHERE instrument=? AND status='open'",(instrument,)).fetchall():
                    px=bid if p['side']=='buy' else ask
                    loss=p['stop'] and (px<=dec(p['stop']) if p['side']=='buy' else px>=dec(p['stop']))
                    profit=p['target'] and (px>=dec(p['target']) if p['side']=='buy' else px<=dec(p['target']))
                    if loss or profit:self.exit_position(db,p,dec(p['qty']),px,'stop loss' if loss else 'take profit')
                for a in db.execute("SELECT * FROM alerts WHERE instrument=? AND status='active' AND account_id IS NOT NULL",(instrument,)).fetchall():
                    mid=(bid+ask)/2;hit=mid>=dec(a['price']) if a['condition']=='above' else mid<=dec(a['price'])
                    if hit:
                        db.execute("UPDATE alerts SET status='triggered' WHERE id=?",(a['id'],))
                        self.event(db,'alert',{'account_id':a['account_id'],'message':instrument+' '+a['condition']+' '+a['price'],'alert_id':a['id']})

    def state(self,account_id=None):
        with self.lock, self.db() as db:
            accounts=[]
            for a in db.execute('SELECT * FROM accounts ORDER BY created_at'):
                accounts.append({**dict(a),**{k:str(v) for k,v in self.funds(db,a).items()}})
            aid=account_id if account_id in {a['id'] for a in accounts} else (accounts[0]['id'] if accounts else None)
            status={'pending':db.execute("SELECT COUNT(*) FROM outbox WHERE status='pending'").fetchone()[0],'delivered':db.execute("SELECT COUNT(*) FROM outbox WHERE status='delivered'").fetchone()[0]}
            status['last_error']=next((r['error'] for r in db.execute("SELECT error FROM outbox WHERE status='pending' AND error<>'' ORDER BY sequence DESC LIMIT 1")),None)
            journal_account=next((r['journal_account'] for r in db.execute('SELECT journal_account FROM outbox WHERE journal_account IS NOT NULL AND json_extract(payload,\'$.account.id\')=? ORDER BY sequence DESC LIMIT 1',(aid,))),None)
            orders=db.execute("""SELECT * FROM orders
                WHERE account_id=? AND (
                    status IN ('working','triggered')
                    OR id IN (
                        SELECT id FROM orders
                        WHERE account_id=? AND status NOT IN ('working','triggered')
                        ORDER BY created_at DESC LIMIT 100
                    )
                ) ORDER BY created_at DESC""",(aid,aid)).fetchall()
            return {'accounts':accounts,'active_account':aid,'orders':[dict(r) for r in orders], 'positions':[dict(r) for r in db.execute("SELECT * FROM positions WHERE account_id=? AND status='open' ORDER BY opened_at DESC",(aid,))], 'fills':[dict(r) for r in db.execute('SELECT * FROM fills WHERE account_id=? ORDER BY executed_at DESC LIMIT 100',(aid,))], 'quotes':{k:{**v,'age':time.time()-v['received_at']} for k,v in self.quotes.items()}, 'alerts':[dict(r) for r in db.execute('SELECT * FROM alerts WHERE account_id=? ORDER BY created_at DESC',(aid,))], 'events':[dict(r) for r in db.execute('SELECT * FROM events WHERE json_extract(content,\'$.account_id\')=? ORDER BY id DESC LIMIT 60',(aid,))], 'journal':{**status,'account_id':journal_account},'mode':'PAPER · SIMULATED','matching_model':'Server bid/ask · full quantity modeled, no queue or partial-fill claims','cost_model':'Configured commission + observed spread; slippage/funding not modeled'}

    def export(self,account_id):
        with self.lock, self.db() as db:
            a=self.account(db,account_id)
            records={name:[dict(r) for r in db.execute('SELECT * FROM '+name+' WHERE account_id=?',(account_id,))] for name in ('orders','positions','fills','cash')}
            events=[dict(r) for r in db.execute("SELECT * FROM events WHERE json_extract(content,'$.account_id')=? ORDER BY id",(account_id,))]
            return {'schema':'the-desk.account-export.v1','mode':'PAPER · SIMULATED','exported_at':stamp(),'timezone':'UTC','account':{**dict(a),**{k:str(v) for k,v in self.funds(db,a).items()}},**records,'events':events,'matching_model':'Public exchange bid/ask; full quantity modeled','cost_model':'Configured commission + observed spread; no slippage/funding/liquidation model'}
