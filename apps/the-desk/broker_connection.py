"""Official Robinhood OAuth/PKCE and a deliberately bounded MCP adapter.

Tokens, previews, and account mappings stay in process memory and are scoped to
the authenticated wallet session. No brokerage passwords or private keys.
"""
import base64
import hashlib
import json
import os
import secrets
import threading
import time
import uuid
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen
from decimal import Decimal, InvalidOperation

RESOURCE = 'https://agent.robinhood.com/mcp/trading'
ISSUER = RESOURCE
AUTH = 'https://robinhood.com/oauth'
TOKEN = 'https://api.robinhood.com/oauth2/token/'
REGISTER = 'https://agent.robinhood.com/oauth/trading/register'
DISCOVERY = 'https://agent.robinhood.com/.well-known/oauth-authorization-server'

def fetch_json(url, payload=None, headers=None, form=False):
    data = (urlencode(payload).encode() if form else json.dumps(payload).encode()) if payload is not None else None
    req = Request(url, data=data, headers={'Content-Type':'application/x-www-form-urlencoded' if form else 'application/json', **(headers or {})})
    with urlopen(req, timeout=20) as response:
        session_id=response.headers.get('Mcp-Session-Id')
        if 'text/event-stream' in response.headers.get('Content-Type',''):
            # Persistent SSE responses need not close after a JSON-RPC result.
            # Stop at the matching id; notifications and unrelated results are ignored.
            expected=(payload or {}).get('id');size=0;parts=[];result=None
            while True:
                line=response.readline(2_000_001)
                if not line: break
                size+=len(line)
                if size>2_000_000: raise ValueError('Robinhood response exceeded the supported size.')
                line=line.decode().rstrip('\r\n')
                if line.startswith('data:'): parts.append(line[5:].lstrip())
                if not line and parts:
                    event=json.loads('\n'.join(parts));parts=[]
                    if isinstance(event,dict) and event.get('id')==expected and ('result' in event or 'error' in event):
                        result=event;break
            if result is None: raise ValueError('Robinhood returned no matching MCP response.')
        else:
            raw=response.read(2_000_001)
            if len(raw)>2_000_000: raise ValueError('Robinhood response exceeded the supported size.')
            result=json.loads(raw) if raw.strip() else {}
        if session_id: result['__mcp_session_id']=session_id
        return result

def tool_data(result):
    if result.get('isError'): raise ValueError('Robinhood rejected the request. Review the account in Robinhood.')
    value = result.get('structuredContent')
    if not isinstance(value,dict):
        blocks = result.get('content',[])
        value = next((json.loads(b['text']) for b in blocks if b.get('type')=='text' and b.get('text','').lstrip().startswith('{')), {})
    return value.get('data',value)

def decimal(value):
    if not isinstance(value,str) or len(value)>40: raise ValueError('Enter a positive decimal amount.')
    try: amount=Decimal(value)
    except InvalidOperation: raise ValueError('Invalid decimal amount.')
    if not amount.is_finite() or amount<=0: raise ValueError('Enter a positive decimal amount.')
    return amount

class Robinhood:
    def __init__(self, port, http=fetch_json):
        self.port=port;self.http=http;self.pending={};self.sessions={};self.lock=threading.RLock();self.client_id=os.environ.get('DESK_ROBINHOOD_CLIENT_ID','');self.client_ids={}
    def disconnect(self, key):
        with self.lock:
            self.sessions.pop(key,None)
            self.pending={k:v for k,v in self.pending.items() if v['key']!=key}
    def start(self,key,host=None,callback_path='/api/robinhood/callback'):
        with self.lock:
            metadata=self.http(DISCOVERY)
            if any(metadata.get(k)!=v for k,v in [('issuer',ISSUER),('authorization_endpoint',AUTH),('token_endpoint',TOKEN),('registration_endpoint',REGISTER)]):
                raise ValueError('Robinhood OAuth metadata changed. Review the integration before connecting.')
            if 'S256' not in metadata.get('code_challenge_methods_supported',[]): raise ValueError('Robinhood PKCE support unavailable.')
            host=host or f'127.0.0.1:{self.port}'
            if host not in (f'127.0.0.1:{self.port}',f'localhost:{self.port}'):
                raise ValueError('Robinhood login requires a trusted loopback host.')
            if callback_path not in ('/api/robinhood/callback','/api/robinhood/workspace/callback'):
                raise ValueError('Unsupported Robinhood callback.')
            redirect=f'http://{host}{callback_path}'
            client_id=self.client_id or self.client_ids.get(redirect)
            if not client_id:
                registered=self.http(REGISTER,{'client_name':'The Desk local trading workspace','redirect_uris':[redirect],'grant_types':['authorization_code','refresh_token'],'response_types':['code'],'token_endpoint_auth_method':'none'})
                client_id=registered.get('client_id','')
                if client_id:self.client_ids[redirect]=client_id
            if not client_id: raise ValueError('Robinhood client registration is unavailable. Configure an approved client ID.')
            self.pending={k:v for k,v in self.pending.items() if v['expires']>time.time()}
            if len(self.pending)>=128: raise ValueError('Too many login attempts. Retry shortly.')
            state=secrets.token_urlsafe(32);verifier=secrets.token_urlsafe(48)
            challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
            self.pending[state]={'key':key,'verifier':verifier,'redirect':redirect,'client_id':client_id,'expires':time.time()+300}
            return {'url':AUTH+'?'+urlencode({'client_id':client_id,'response_type':'code','redirect_uri':redirect,'state':state,'code_challenge':challenge,'code_challenge_method':'S256','scope':'internal','resource':RESOURCE})}
    def callback(self,key,state,code,issuer):
        with self.lock:
            p=self.pending.get(state)
            if not p or p['key']!=key or p['expires']<=time.time(): raise ValueError('Robinhood login expired or does not belong to this Desk session.')
            if issuer!=ISSUER or not code: raise ValueError('Robinhood login issuer or code is invalid.')
            self.pending.pop(state)
            token=self.http(TOKEN,{'grant_type':'authorization_code','code':code,'redirect_uri':p['redirect'],'client_id':p['client_id'],'code_verifier':p['verifier'],'resource':RESOURCE},form=True)
            if not token.get('access_token'): raise ValueError('Robinhood did not return a session.')
            self.sessions[key]={'token':token,'client_id':p['client_id'],'expires':time.time()+float(token.get('expires_in',300)),'tools':{},'accounts':{},'previews':{}}
            self.rpc(key,'initialize',{'protocolVersion':'2025-03-26','capabilities':{},'clientInfo':{'name':'The Desk','version':'0.1'}})
            self.rpc(key,'notifications/initialized',{},notification=True)
            tools={};cursor=None
            for _ in range(20):
                page=self.rpc(key,'tools/list',{'cursor':cursor} if cursor else {})
                tools.update({t['name']:t for t in page.get('tools',[])})
                cursor=page.get('nextCursor')
                if not cursor: break
            self.sessions[key]['tools']=tools
            return self.status(key)
    def rpc(self,key,method,params,notification=False):
        s=self.sessions.get(key)
        if not s: raise ValueError('Sign in to Robinhood first.')
        if s['expires']<=time.time():
            refresh=s['token'].get('refresh_token')
            if not refresh: self.disconnect(key);raise ValueError('Robinhood session expired. Sign in again.')
            token=self.http(TOKEN,{'grant_type':'refresh_token','refresh_token':refresh,'client_id':s['client_id'],'resource':RESOURCE},form=True)
            if not token.get('access_token'): self.disconnect(key);raise ValueError('Robinhood session expired. Sign in again.')
            s['token']={**s['token'],**token};s['expires']=time.time()+float(token.get('expires_in',300))
        body={'jsonrpc':'2.0','method':method,'params':params}
        if not notification: body['id']=str(uuid.uuid4())
        result=self.http(RESOURCE,body,{'Authorization':'Bearer '+s['token']['access_token'],'Accept':'application/json, text/event-stream','MCP-Protocol-Version':'2025-03-26','x-timezone-id':'America/Los_Angeles',**({'Mcp-Session-Id':s['mcpSessionId']} if s.get('mcpSessionId') else {})})
        if result.get('__mcp_session_id'): s['mcpSessionId']=result.pop('__mcp_session_id')
        if notification: return {}
        if result.get('error'): raise ValueError('Robinhood MCP request failed. Reconnect or review the account in Robinhood.')
        return result.get('result',{})
    def call(self,key,name,arguments):
        if name not in self.sessions[key]['tools']: raise ValueError('This Robinhood tool is unavailable for the connection.')
        return tool_data(self.rpc(key,'tools/call',{'name':name,'arguments':arguments}))
    def status(self,key):
        with self.lock:
            s=self.sessions.get(key)
            if not s: return {'connected':False,'futures':False,'liveEnabled':False}
            accounts=self.call(key,'get_accounts',{}).get('accounts') or []
            s['accounts']={}
            public=[]
            for a in sorted((a for a in accounts if isinstance(a,dict)),key=lambda a:(not a.get('is_default'),not a.get('agentic_allowed'))):
                aid=hashlib.sha256((key+str(a['account_number'])).encode()).hexdigest()[:24];s['accounts'][aid]=a
                public.append({'id':aid,'account':'••••'+str(a['account_number'])[-4:],'cryptoAccount':'••••'+str(a['rhc_account_number'])[-4:] if a.get('rhc_account_number') else None,'name':a.get('nickname') or a.get('brokerage_account_type','Account'),'type':a.get('brokerage_account_type'),'tradingType':a.get('type'),'default':a.get('is_default',False),'tradable':a.get('agentic_allowed') is True and a.get('state')=='active' and not a.get('deactivated') and not a.get('permanently_deactivated'),'optionsApproved':a.get('option_level') in ('option_level_2','option_level_3')})
            names=s['tools']
            return {'connected':True,'accounts':public,'equities':'review_equity_order' in names,'crypto':'preview_crypto_order' in names,'options':False,'futures':False,'liveEnabled':False,'observedAt':time.time()}
    def account(self,key,aid,trade=False):
        a=self.sessions.get(key,{}).get('accounts',{}).get(aid)
        if not a: raise ValueError('Select a connected Robinhood account.')
        if trade and (a.get('agentic_allowed') is not True or a.get('state')!='active' or a.get('deactivated') or a.get('permanently_deactivated')): raise ValueError('This account is not available for trading through this connection.')
        return a
    def portfolio(self,key,aid):
        with self.lock:
            a=self.account(key,aid)
            p=self.call(key,'get_portfolio',{'account_number':a['account_number']})
            return {k:p.get(k) for k in ('buying_power','crypto_buying_power','total_value','cash','currency','pending_deposits')}
    def preview(self,key,p):
        with self.lock:
            a=self.account(key,p.get('accountId'),True)
            asset=p.get('asset')
            if asset not in ('equity','crypto'): raise ValueError('Native tickets currently support stocks/ETFs and crypto. Options and futures use Robinhood.')
            if p.get('side') not in ('buy','sell') or p.get('type')!='limit': raise ValueError('Select Buy or Sell and a limit order.')
            symbol=p.get('symbol','').upper()
            if not symbol or len(symbol)>20 or any(c not in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-' for c in symbol): raise ValueError('Invalid symbol.')
            qty=decimal(p.get('quantity'));price=decimal(p.get('limit_price'))
            if asset=='equity' and qty!=qty.to_integral_value(): raise ValueError('Equity limit orders require whole shares.')
            args={'symbol':symbol,'side':p['side'],'type':'limit','quantity':str(qty),'limit_price':str(price),'time_in_force':'gtc'}
            if asset=='equity':
                if p.get('market_hours','regular_hours') not in ('regular_hours','extended_hours','all_day_hours'): raise ValueError('Invalid trading session.')
                args.update(account_number=a['account_number'],market_hours=p.get('market_hours','regular_hours'))
            else:
                if not a.get('rhc_account_number') or not a.get('rhs_account_number'): raise ValueError('No linked crypto routing account is available.')
                args['rhs_account_number']=a['rhs_account_number']
            result=self.call(key,'review_equity_order' if asset=='equity' else 'preview_crypto_order',args)
            echo=result.get('order',result)
            valid_echo=isinstance(echo,dict) and echo.get('symbol','').upper()==symbol and echo.get('side')==args['side'] and str(echo.get('quantity'))==args['quantity'] and str(echo.get('limit_price'))==args['limit_price']
            valid_checks=asset!='equity' or isinstance(result.get('order_checks'),dict)
            blocked=not valid_echo or not valid_checks or bool(result.get('order_checks') or result.get('errors') or result.get('error') or result.get('validation_errors'))
            if not valid_echo or not valid_checks: result={**result,'validation_errors':'Provider preview schema is unverified; submit is blocked.'}
            preview_id=secrets.token_urlsafe(24);ref=str(uuid.uuid4())
            self.sessions[key]['previews']={k:v for k,v in self.sessions[key]['previews'].items() if v['expires']>time.time()}
            self.sessions[key]['previews'][preview_id]={'args':args,'aid':p['accountId'],'asset':asset,'blocked':blocked,'expires':time.time()+30,'ref':ref}
            # Preserve provider review and mandatory quote disclosure; redact any account identifiers.
            public=json.dumps(result)
            for field in ('account_number','rhs_account_number','rhc_account_number'):
                if a.get(field): public=public.replace(str(a[field]),'••••'+str(a[field])[-4:])
            return {'id':preview_id,'ref':ref,'review':json.loads(public),'blocked':blocked,'expiresAt':time.time()+30}
