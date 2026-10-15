"""Wallet identity, Hyperliquid reconciliation, snapshots, and Robinhood login.

The paper engine remains independent. Hyperliquid signs venue actions in the
browser wallet; this server records request intent and reconciles venue status.
Loading a page or signing in never sends an order or transfer.
"""
import hashlib
from http.cookies import SimpleCookie, CookieError
import math
import os
import re
from pathlib import Path
from urllib.parse import parse_qs
from urllib.request import Request, urlopen
import json
import wallet_auth as wallet
from broker_connection import Robinhood
from hyperliquid_requests import HyperliquidRequestStore
from hardware_wallet import HardwareWallet, COOKIE as HARDWARE_COOKIE

class FundingRoutes:
    def __init__(self,port,data_dir=None):
        self.port=port
        self.hyperliquid_live=os.environ.get('DESK_HYPERLIQUID_LIVE_ENABLED')=='1'
        self.broker=Robinhood(port)
        self.hardware=HardwareWallet()
        root=Path(data_dir) if data_dir else Path(__file__).resolve().parent/'data'
        self.hyperliquid_requests=HyperliquidRequestStore(root/'hyperliquid-requests.sqlite3')
    def token(self,h,cookie_name=wallet.SESSION_COOKIE):
        try:
            cookies=SimpleCookie();cookies.load(h.headers.get('Cookie',''))
            return cookies[cookie_name].value if cookie_name in cookies else None
        except CookieError: return None
    def identity(self,h):
        token=self.token(h);session=wallet.get_session(token)
        if not session: raise ValueError('Sign in with your Base wallet first.')
        return session,hashlib.sha256(token.encode()).hexdigest()
    def cookie(self,h,token='',clear=False):
        h.wallet_cookie=f'{wallet.SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={0 if clear else wallet.SESSION_TTL_SECONDS}'
    @staticmethod
    def network(value):
        if value not in ('testnet','mainnet'): raise ValueError('Choose testnet or mainnet.')
        return value
    @staticmethod
    def hyperliquid_url(network):
        return 'https://api.hyperliquid-testnet.xyz/info' if network=='testnet' else 'https://api.hyperliquid.xyz/info'
    @staticmethod
    def valid_scalar(value):
        if value is None or isinstance(value,bool):return False
        if isinstance(value,str):return bool(value.strip())
        return isinstance(value,(int,float)) and math.isfinite(value)
    def hyperliquid_info(self,network,payload):
        req=Request(self.hyperliquid_url(network),data=json.dumps(payload).encode(),headers={'Content-Type':'application/json'})
        with urlopen(req,timeout=12) as response:return json.load(response)
    def get(self,h,path,q):
        if path=='/api/integrations':
            h.json({'baseChainId':8453,'walletConnectProjectId':os.environ.get('DESK_WALLETCONNECT_PROJECT_ID','') if re.fullmatch(r'[a-fA-F0-9]{32}',os.environ.get('DESK_WALLETCONNECT_PROJECT_ID','')) else '','liveEnabled':False,'hyperliquidLiveEnabled':self.hyperliquid_live,'walletVerificationAvailable':wallet.Account is not None,'hyperliquidDefault':'testnet','robinhoodMcp':'https://agent.robinhood.com/mcp/trading','robinhoodFutures':False,'robinhoodOptionsTicket':False});return True
        if path=='/api/wallet/hardware/capabilities':
            h.json(self.hardware.capabilities());return True
        if path=='/api/wallet/session':
            session=wallet.get_session(self.token(h))
            h.json({'authenticated':bool(session),**(session or {})});return True
        if path=='/api/robinhood/callback':
            session,key=self.identity(h)
            value=lambda k:q.get(k,[''])[0]
            self.broker.callback(key,value('state'),value('code'),value('iss'))
            h.send_response(303);h.send_header('Location','/?connection=robinhood');h.send_header('Referrer-Policy','no-referrer');h.end_headers();return True
        if path=='/api/robinhood/status':
            session,key=self.identity(h);h.json(self.broker.status(key));return True
        if path=='/api/robinhood/portfolio':
            session,key=self.identity(h);h.json(self.broker.portfolio(key,q.get('accountId',[''])[0]));return True
        if path=='/api/integrations/hyperliquid/requests':
            session,key=self.identity(h);h.json({'network':self.network(q.get('network',['testnet'])[0]),'requests':self.hyperliquid_requests.open(session['address'],q.get('network',['testnet'])[0])});return True
        if path=='/api/integrations/hyperliquid':
            session,key=self.identity(h);testnet=self.network(q.get('network',['testnet'])[0])
            def info(type):
                return self.hyperliquid_info(testnet,{'type':type,'user':session['address']})
            h.json({'network':testnet,'address':session['address'],'perps':info('clearinghouseState'),'spot':info('spotClearinghouseState'),'orders':info('openOrders'),'fills':info('userFills'),'meta':info('meta'),'observedAt':__import__('time').time()});return True
        return False
    def post(self,h,path,p):
        if not (path.startswith('/api/wallet/') or path.startswith('/api/robinhood/') or path.startswith('/api/integrations/hyperliquid/')):return False
        wallet.validate_local_origin(h.headers.get('Host',''),self.port,h.headers.get('Origin'))
        if not isinstance(p,dict):raise ValueError('JSON object required.')
        if path.startswith('/api/wallet/hardware/'):
            if h.headers.get('Origin') != 'http://'+h.headers.get('Host',''):
                h.json({'error':'Exact same-origin hardware request required.'},403);return True
            token=self.token(h,HARDWARE_COOKIE)
            if path=='/api/wallet/hardware/discover':h.json(self.hardware.discover());return True
            if path=='/api/wallet/hardware/connect':
                token,value=self.hardware.connect(p.get('deviceId'),p.get('scheme'),p.get('index'),token)
                h.hardware_cookie=f'{HARDWARE_COOKIE}={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={wallet.SESSION_TTL_SECONDS}'
                h.json(value);return True
            if path=='/api/wallet/hardware/selected':h.json(self.hardware.selected(token));return True
            if path=='/api/wallet/hardware/sign-login':
                h.json(self.hardware.sign_login(token,p,h.headers.get('Host',''),self.port,h.headers.get('Origin')));return True
            if path=='/api/wallet/hardware/disconnect':
                self.hardware.disconnect(token)
                h.hardware_cookie=f'{HARDWARE_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'
                h.json({'connected':False});return True
            if path=='/api/wallet/hardware/rpc':
                session,key=self.identity(h)
                h.json(self.hardware.read_rpc(token,session,p.get('method'),p.get('params')));return True
            return False
        if path=='/api/wallet/challenge':
            h.json(wallet.issue_challenge(p.get('address'),h.headers.get('Host',''),self.port,h.headers.get('Origin')));return True
        if path=='/api/wallet/verify':
            token,session=wallet.verify_challenge(p.get('address'),p.get('nonce'),p.get('message'),p.get('signature'),h.headers.get('Host',''),self.port,h.headers.get('Origin'))
            old=self.token(h)
            if old:self.broker.disconnect(hashlib.sha256(old.encode()).hexdigest());wallet.revoke_session(old)
            self.cookie(h,token);h.json({'authenticated':True,**session});return True
        if path=='/api/wallet/logout':
            token=self.token(h)
            if token:self.broker.disconnect(hashlib.sha256(token.encode()).hexdigest());wallet.revoke_session(token)
            self.cookie(h,clear=True);h.json({'authenticated':False});return True
        session,key=self.identity(h)
        if path=='/api/robinhood/connect':h.json(self.broker.start(key,h.headers.get('Host','')));return True
        if path=='/api/robinhood/disconnect':self.broker.disconnect(key);h.json({'connected':False});return True
        if path=='/api/robinhood/preview':h.json(self.broker.preview(key,p));return True
        if path=='/api/integrations/hyperliquid/reserve':
            session,key=self.identity(h);h.json({'request':self.hyperliquid_requests.reserve(session['address'],self.network(p.get('network')),p.get('clientOrderId'),p.get('intent'))});return True
        if path=='/api/integrations/hyperliquid/submitting':
            session,key=self.identity(h);h.json({'request':self.hyperliquid_requests.mark_submitting(session['address'],self.network(p.get('network')),p.get('clientOrderId'))});return True
        if path=='/api/integrations/hyperliquid/release':
            session,key=self.identity(h);h.json({'request':self.hyperliquid_requests.release(session['address'],self.network(p.get('network')),p.get('clientOrderId'))});return True
        if path=='/api/integrations/hyperliquid/uncertain':
            session,key=self.identity(h);observed=p.get('observed') if isinstance(p.get('observed'),dict) else {'state':'uncertain'};h.json({'request':self.hyperliquid_requests.uncertain(session['address'],self.network(p.get('network')),p.get('clientOrderId'),observed)});return True
        if path=='/api/integrations/hyperliquid/reconcile':
            session,key=self.identity(h);network=self.network(p.get('network'));client_order_id=p.get('clientOrderId')
            request=self.hyperliquid_requests.get(session['address'],network,client_order_id)
            if not request:raise ValueError('Hyperliquid request is not recorded.')
            try:observed=self.hyperliquid_info(network,{'type':'orderStatus','user':session['address'],'oid':client_order_id})
            except Exception:
                h.json({'error':'Reconciliation unavailable; this request remains blocked.'},503);return True
            wrapper=observed.get('order') if isinstance(observed,dict) else None
            order=wrapper.get('order') if isinstance(wrapper,dict) else None
            venue_state=wrapper.get('status') if isinstance(wrapper,dict) else None
            if isinstance(order,dict) and self.valid_scalar(venue_state) and self.valid_scalar(order.get('oid')):
                request=self.hyperliquid_requests.acknowledge(session['address'],network,client_order_id,venue_state,order['oid'],observed)
                h.json({'found':True,'request':request});return True
            request=self.hyperliquid_requests.uncertain(session['address'],network,client_order_id,observed)
            h.json({'found':False,'request':request});return True
        return False
