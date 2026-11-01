"""Paper chat execution: durable plans, selected account scope and engine validation."""
import json
import time
import re

ACTIONS=('order','amend','cancel','close','bracket','cancel_orders','flatten','reverse')
SCHEMA={'type':'object','properties':{'concern':{'type':'string'},'commands':{'type':'array','items':{'type':'object','properties':{'action':{'type':'string','enum':list(ACTIONS)},'payload':{'type':'string'}},'required':['action','payload'],'additionalProperties':False}}},'required':['concern','commands'],'additionalProperties':False}
METHODS={'order':'create_order','amend':'amend','cancel':'cancel','close':'close','bracket':'bracket','cancel_orders':'cancel_orders','flatten':'flatten','reverse':'reverse'}
FIELDS={'order':{'side','kind','qty','price','trigger','stop','target','ttl_seconds'},'amend':{'id','qty','price','trigger','stop','target'},'cancel':{'id'},'close':{'id','qty'},'bracket':{'id','stop','target'},'cancel_orders':{'ids'},'flatten':set(),'reverse':set()}

class ChatTrading:
 def __init__(self,engine):self.engine=engine
 def context(self,raw,market):
  if not isinstance(raw,dict) or raw.get('broker') or raw.get('replay'):raise ValueError('Chat execution requires a selected paper account outside replay.')
  aid=raw.get('account_id');s=self.engine.state(aid)
  a=next((a for a in s['accounts'] if a['id']==aid),None)
  if not a or a.get('agent_owner'):raise ValueError('Choose a manual paper account for chat trading.')
  self.engine.instrument(market)
  return {'account':a,'account_id':aid,'instrument':market,'orders':[o for o in s['orders'] if o['instrument']==market and o['status'] in ('working','triggered')],'positions':[p for p in s['positions'] if p['instrument']==market],'quote':s['quotes'].get(market),'ticket':raw.get('ticket',{})}
 def prepare(self,raw,ctx,request=""):
  if raw['concern']:return [],raw['concern']
  if not 1<=len(raw['commands'])<=8:raise ValueError('Request between one and eight paper actions.')
  result=[]
  for cmd in raw['commands']:
   action=cmd['action'];p=json.loads(cmd['payload'])
   if action not in ACTIONS or not isinstance(p,dict) or set(p)-FIELDS[action]:raise ValueError('Unsupported chat trading fields')
   p={**p,'account_id':ctx['account_id'],'instrument':ctx['instrument']}
   if action in ('amend','cancel','close','bracket'):
    rows=ctx['orders'] if action in ('amend','cancel') else ctx['positions'];row=next((r for r in rows if r['id']==p.get('id')),None)
    if not row:raise ValueError('Requested order or position is not active on this account and chart.')
    p['revision']=row['revision']
    if action=='amend':p={**{k:row.get(k) for k in ('qty','price','trigger','stop','target')},**p}
    if action=='bracket':p={**{k:row.get(k) for k in ('stop','target')},**p}
   if action in ('cancel_orders','flatten','reverse'):
    orders=ctx['orders']
    if action=='cancel_orders' and 'ids' in p:
     ids=p.pop('ids')
     if not isinstance(ids,list) or any(i not in [o['id'] for o in orders] for i in ids):raise ValueError('Invalid scoped order selection')
     orders=[o for o in orders if o['id'] in ids]
    p['orders']=[{'id':o['id'],'revision':o['revision']} for o in orders]
    if action!='cancel_orders':p['positions']=[{'id':r['id'],'revision':r['revision']} for r in ctx['positions']]
   if action=='order':
    if not p.get('qty'):return [],'What quantity or dollar risk should I use? Set the ticket size or specify it in your request.'
    if not p.get('stop') and not re.search(r'\b(no stop|without (?:a )?stop|unprotected)\b',request,re.I):return [],'What stop loss should I use? Specify a stop, or explicitly request an unprotected order.'
   result.append({'action':action,'payload':p})
  # Exercise actual engine interfaces and roll back every effect before offering execution.
  with self.engine.lock,self.engine.db() as db:
   db.execute('SAVEPOINT chat_preview')
   try:
    for cmd in result:
     guard=getattr(self.engine,'agent_command_guard',None)
     if guard:guard(db,cmd['action'],cmd['payload'])
     getattr(self.engine,METHODS[cmd['action']])(db,cmd['payload'])
   finally:db.execute('ROLLBACK TO chat_preview');db.execute('RELEASE chat_preview')
  return result,''
 def execute(self,run,p):
  if run.get('trade') is None:raise ValueError('No executable trade plan')
  t=run['trade']
  if p.get('account_id')!=t['account_id'] or p.get('instrument')!=t['instrument']:raise ValueError('Account or chart changed. Send the request again.')
  key='chat:'+run['id']
  with self.engine.lock,self.engine.db() as db:
   db.execute('BEGIN IMMEDIATE')
   old=db.execute('SELECT result FROM commands WHERE id=?',(key,)).fetchone()
   if old:return json.loads(old['result'])
   if time.time()-run['createdAt']>180:raise ValueError('Trade request expired. Request a fresh evaluation.')
   receipts=[]
   for cmd in t['commands']:
    guard=getattr(self.engine,'agent_command_guard',None)
    if guard:guard(db,cmd['action'],cmd['payload'])
    receipts.append({'action':cmd['action'],'result':getattr(self.engine,METHODS[cmd['action']])(db,cmd['payload'])})
   db.execute('INSERT INTO commands VALUES(?,?,?)',(key,'chat-plan',json.dumps(receipts)))
   return receipts
