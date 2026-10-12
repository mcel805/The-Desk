import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import unittest
from unittest.mock import patch
try:
    from eth_account import Account
    from eth_account.messages import encode_defunct
except ImportError:
    Account=None
import wallet_auth as auth
from broker_connection import Robinhood,AUTH,TOKEN,REGISTER,DISCOVERY,ISSUER,fetch_json

@unittest.skipUnless(Account is not None,'Install requirements-wallet.txt for cryptographic wallet tests')
class WalletTests(unittest.TestCase):
    def setUp(self):
        self.account=Account.create();self.host='127.0.0.1:18882';self.origin='http://'+self.host
    def challenge(self):return auth.issue_challenge(self.account.address,self.host,18882,self.origin)
    def verify(self,c,account=None):
        signature=Account.sign_message(encode_defunct(text=c['message']),private_key=(account or self.account).key).signature.hex()
        return auth.verify_challenge(self.account.address,c['nonce'],c['message'],signature,self.host,18882,self.origin)
    def test_signature_replay_and_revocation(self):
        c=self.challenge();token,session=self.verify(c);self.assertEqual(session['chainId'],8453);self.assertEqual(auth.get_session(token)['address'],self.account.address)
        with self.assertRaises(ValueError):self.verify(c)
        auth.revoke_session(token);self.assertIsNone(auth.get_session(token))
    def test_wrong_signer_and_wrong_domain(self):
        with self.assertRaisesRegex(ValueError,'selected wallet'):self.verify(self.challenge(),Account.create())
        with self.assertRaises(ValueError):auth.issue_challenge(self.account.address,self.host,18882,'https://evil.example')
        with self.assertRaises(ValueError):auth.issue_challenge(self.account.address,'evil.example:18882',18882,None)
    def test_expiry_and_message_tampering(self):
        c=self.challenge()
        with patch.object(auth.time,'time',return_value=10**12):
            with self.assertRaisesRegex(ValueError,'expired'):self.verify(c)
        c=self.challenge();c['message']=c['message'].replace('Chain ID: 8453','Chain ID: 1')
        with self.assertRaises(ValueError):self.verify(c)

class BrokerTests(unittest.TestCase):
    def setUp(self):
        self.calls=[];self.alerts={};self.fail_place=False
        def http(url,payload=None,headers=None,form=False):
            self.calls.append((url,payload,headers))
            if url==DISCOVERY:return {'issuer':ISSUER,'authorization_endpoint':AUTH,'token_endpoint':TOKEN,'registration_endpoint':REGISTER,'code_challenge_methods_supported':['S256']}
            if url==REGISTER:return {'client_id':'desk-test'}
            if url==TOKEN:return {'access_token':'test-only','expires_in':3600}
            method=payload['method']
            if method=='initialize':return {'result':{'protocolVersion':'2025-03-26'}}
            if method=='notifications/initialized':return {}
            if method=='tools/list':return {'result':{'tools':[{'name':n} for n in ['get_accounts','get_portfolio','review_equity_order','place_equity_order','preview_crypto_order','place_crypto_order']]}}
            name=payload['params']['name'];args=payload['params']['arguments']
            if name=='get_accounts':data={'accounts':[{'account_number':'12345678','rhs_account_number':'12345678','state':'active','agentic_allowed':True,'type':'limited_margin','is_default':True,'brokerage_account_type':'individual'},{'account_number':'98765432','rhs_account_number':'98765432','state':'active','agentic_allowed':False,'type':'margin'}]}
            elif name=='get_portfolio':data={'total_value':'100','buying_power':{'buying_power':'50'},'currency':'USD'}
            elif name=='review_equity_order':data={**args,'order_checks':self.alerts,'customer_approval_required':True,'market_data_disclosure':'Exact quote disclosure'}
            elif name=='preview_crypto_order':data={**args,'customer_approval_required':True,'market_data_disclosure':'Exact quote disclosure'}
            elif name=='place_equity_order':
                if self.fail_place:raise TimeoutError('Simulated lost response')
                data={'status':'approval_required'}
            else:raise ValueError(name)
            return {'result':{'structuredContent':{'data':data}}}
        self.broker=Robinhood(18882,http=http,live=True)
    def connect(self,key='wallet-session'):
        from urllib.parse import urlparse,parse_qs
        url=self.broker.start(key)['url'];params=parse_qs(urlparse(url).query)
        self.assertEqual(params['code_challenge_method'],['S256'])
        state=params['state'][0];return self.broker.callback(key,state,'code',ISSUER)
    def draft(self):
        s=self.connect();return {'accountId':s['accounts'][0]['id'],'asset':'equity','symbol':'AAPL','side':'buy','type':'limit','quantity':'1','limit_price':'50'}
    def test_login_session_binding_masks_account_numbers(self):
        from urllib.parse import urlparse,parse_qs
        q=parse_qs(urlparse(self.broker.start('wallet-session')['url']).query)
        with self.assertRaises(ValueError):self.broker.callback('other-wallet',q['state'][0],'code',ISSUER)
        s=self.broker.callback('wallet-session',q['state'][0],'code',ISSUER)
        self.assertEqual(s['accounts'][0]['account'],'••••5678');self.assertFalse(s['futures']);self.assertFalse(s['options'])
        with self.assertRaises(ValueError):self.broker.callback('wallet-session',q['state'][0],'code',ISSUER)

    def test_login_redirect_matches_initiating_loopback_host(self):
        from urllib.parse import urlparse,parse_qs
        url=self.broker.start('wallet-session','localhost:18882')['url'];params=parse_qs(urlparse(url).query)
        self.assertEqual(params['redirect_uri'],['http://localhost:18882/api/robinhood/callback'])
        registration=next(payload for url,payload,headers in self.calls if url==REGISTER)
        self.assertEqual(registration['redirect_uris'],['http://localhost:18882/api/robinhood/callback'])
    def test_preview_submit_confirmation_idempotency_and_no_auto_trade(self):
        p=self.draft();preview=self.broker.preview('wallet-session',p)
        self.assertEqual(preview['review']['market_data_disclosure'],'Exact quote disclosure')
        self.assertFalse(any((c[1] or {}).get('params',{}).get('name')=='place_equity_order' for c in self.calls))
        with self.assertRaises(ValueError):self.broker.submit('wallet-session',{'id':preview['id']})
        args={'id':preview['id'],'confirmation':'PLACE LIVE ORDER'}
        one=self.broker.submit('wallet-session',args);two=self.broker.submit('wallet-session',args);self.assertEqual(one,two)
        self.assertEqual(sum((c[1] or {}).get('params',{}).get('name')=='place_equity_order' for c in self.calls),1)

    def test_crypto_preview_uses_verified_rhs_account(self):
        s=self.connect();p={'accountId':s['accounts'][0]['id'],'asset':'crypto','symbol':'BTC-USD','side':'buy','type':'limit','quantity':'1','limit_price':'50'}
        preview=self.broker.preview('wallet-session',p)
        self.assertFalse(preview['blocked'])
        call=next(payload for url,payload,headers in self.calls if (payload or {}).get('params',{}).get('name')=='preview_crypto_order')
        self.assertEqual(call['params']['arguments']['rhs_account_number'],'12345678')
    def test_read_only_account_and_broker_alerts_block_submit(self):
        p=self.draft();p['accountId']=list(self.broker.sessions['wallet-session']['accounts'])[1]
        with self.assertRaises(ValueError):self.broker.preview('wallet-session',p)
        p['accountId']=list(self.broker.sessions['wallet-session']['accounts'])[0];self.alerts={'alert_type':'INSUFFICIENT_BUYING_POWER'}
        preview=self.broker.preview('wallet-session',p);self.assertTrue(preview['blocked'])
        with self.assertRaises(ValueError):self.broker.submit('wallet-session',{'id':preview['id'],'confirmation':'PLACE LIVE ORDER'})
    def test_timeout_does_not_duplicate_write(self):
        p=self.draft();preview=self.broker.preview('wallet-session',p);self.fail_place=True
        args={'id':preview['id'],'confirmation':'PLACE LIVE ORDER'}
        with self.assertRaises(TimeoutError):self.broker.submit('wallet-session',args)
        with self.assertRaisesRegex(ValueError,'unknown'):self.broker.submit('wallet-session',args)
        self.assertEqual(sum((c[1] or {}).get('params',{}).get('name')=='place_equity_order' for c in self.calls),1)
    def test_live_disabled_and_expired_preview(self):
        p=self.draft();self.broker.live=False
        with self.assertRaises(ValueError):self.broker.preview('wallet-session',p)
        self.broker.live=True;preview=self.broker.preview('wallet-session',p)
        self.broker.sessions['wallet-session']['previews'][preview['id']]['expires']=0
        with self.assertRaisesRegex(ValueError,'expired'):self.broker.submit('wallet-session',{'id':preview['id'],'confirmation':'PLACE LIVE ORDER'})
    def test_disconnect_clears_tokens_accounts_and_previews(self):
        self.draft();self.broker.disconnect('wallet-session');self.assertFalse(self.broker.status('wallet-session')['connected'])


class TransportTests(unittest.TestCase):
    def test_sse_stops_at_matching_rpc_result_without_stream_close(self):
        import io
        class Stream:
            headers={'Content-Type':'text/event-stream','Mcp-Session-Id':'session-test'}
            def __enter__(self):return self
            def __exit__(self,*a):pass
            def readline(self,limit):
                value=self.stream.readline(limit)
                if not value:raise AssertionError('Adapter waited for stream close after result')
                return value
        response=Stream();response.stream=io.BytesIO(b'data: {"method":"notifications/message"}\n\ndata: {"id":"unrelated","result":{}}\n\ndata: {"id":"expected","result":{"tools":[]}}\n\n')
        with patch('broker_connection.urlopen',return_value=response):
            result=fetch_json('https://agent.robinhood.com/mcp/trading',{'id':'expected'})
        self.assertEqual(result['result'],{'tools':[]});self.assertEqual(result['__mcp_session_id'],'session-test')

if __name__=='__main__':unittest.main()
