"""Wallet identity, read-only venue snapshots, and official Robinhood login.

The paper engine remains independent. Mainnet writes are an explicit runtime
configuration; loading a page or signing in never sends an order or transfer.
"""
import hashlib
from http.cookies import SimpleCookie, CookieError
import os
from urllib.parse import parse_qs
from urllib.request import Request, urlopen
import json
import wallet_auth as wallet
from broker_connection import Robinhood

class FundingRoutes:
    def __init__(self,port):
        self.port=port
        self.live=os.environ.get('DESK_LIVE_ENABLED')=='1'
        self.broker=Robinhood(port,live=self.live)
    def token(self,h):
        try:
            cookies=SimpleCookie();cookies.load(h.headers.get('Cookie',''))
            return cookies[wallet.SESSION_COOKIE].value if wallet.SESSION_COOKIE in cookies else None
        except CookieError: return None
    def identity(self,h):
        token=self.token(h);session=wallet.get_session(token)
        if not session: raise ValueError('Sign in with your Base wallet first.')
        return session,hashlib.sha256(token.encode()).hexdigest()
    def cookie(self,h,token='',clear=False):
        h.wallet_cookie=f'{wallet.SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={0 if clear else wallet.SESSION_TTL_SECONDS}'
    def get(self,h,path,q):
        if path=='/api/integrations':
            h.json({'baseChainId':8453,'liveEnabled':self.live,'walletVerificationAvailable':wallet.Account is not None,'hyperliquidDefault':'testnet','robinhoodMcp':'https://agent.robinhood.com/mcp/trading','robinhoodFutures':False,'robinhoodOptionsTicket':False});return True
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
        if path=='/api/integrations/hyperliquid':
            session,key=self.identity(h);testnet=q.get('network',['testnet'])[0]
            if testnet not in ('testnet','mainnet'):raise ValueError('Choose mainnet or testnet.')
            url='https://api.hyperliquid-testnet.xyz/info' if testnet=='testnet' else 'https://api.hyperliquid.xyz/info'
            def info(type):
                req=Request(url,data=json.dumps({'type':type,'user':session['address']}).encode(),headers={'Content-Type':'application/json'})
                with urlopen(req,timeout=12) as r:return json.load(r)
            h.json({'network':testnet,'address':session['address'],'perps':info('clearinghouseState'),'spot':info('spotClearinghouseState'),'orders':info('openOrders'),'fills':info('userFills'),'meta':info('meta'),'observedAt':__import__('time').time()});return True
        return False
    def post(self,h,path,p):
        if not (path.startswith('/api/wallet/') or path.startswith('/api/robinhood/')):return False
        wallet.validate_local_origin(h.headers.get('Host',''),self.port,h.headers.get('Origin'))
        if not isinstance(p,dict):raise ValueError('JSON object required.')
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
        if path=='/api/robinhood/connect':h.json(self.broker.start(key));return True
        if path=='/api/robinhood/disconnect':self.broker.disconnect(key);h.json({'connected':False});return True
        if path=='/api/robinhood/preview':h.json(self.broker.preview(key,p));return True
        if path=='/api/robinhood/submit':h.json(self.broker.submit(key,p));return True
        return False
