import unittest
import io
import json
from unittest.mock import patch
import wallet_auth as wallet
from hardware_wallet import HardwareWallet
try:
    from eth_account import Account
    from eth_account.messages import encode_defunct
except ImportError: Account=None

@unittest.skipUnless(Account,'Install requirements-wallet.txt')
class HardwareWalletTests(unittest.TestCase):
    def setUp(self):
        self.account=Account.create();self.calls=[];self.now=[100]
        def runner(p):
            self.calls.append(p)
            if p['operation']=='capabilities':return {'available':True}
            if p['operation']=='discover':return {'devices':[{'id':'a'*64,'name':'Ledger USB'}]}
            if p['operation']=='account':return {'address':self.account.address,'path':"44'/60'/0'/0/0"}
            if p['operation']=='sign-login':return {'address':self.account.address,'signature':'0x'+Account.sign_message(encode_defunct(text=p['message']),self.account.key).signature.hex().removeprefix('0x')}
            raise AssertionError(p)
        self.rpc_calls=[]
        def rpc(method,params):self.rpc_calls.append((method,params));return '0x2105' if method=='eth_chainId' else '0x10'
        self.hw=HardwareWallet(runner=runner,rpc=rpc,clock=lambda:self.now[0]);self.host='127.0.0.1:18882';self.origin='http://'+self.host
        self.token,_=self.hw.connect('a'*64,'ledger-live',0)
    def challenge(self):return wallet.issue_challenge(self.account.address,self.host,18882,self.origin)
    def test_actual_signature_verifies_and_cannot_be_replayed(self):
        c=self.challenge();s=self.hw.sign_login(self.token,c,self.host,18882,self.origin)
        _,session=wallet.verify_challenge(self.account.address,c['nonce'],c['message'],s['signature'],self.host,18882,self.origin)
        self.assertEqual(session['address'],self.account.address)
        with self.assertRaises(ValueError):self.hw.sign_login(self.token,c,self.host,18882,self.origin)
    def test_arbitrary_message_wrong_nonce_origin_address_and_expired_challenge_never_reach_usb(self):
        c=self.challenge();before=len(self.calls)
        for payload,host,origin in [({**c,'message':'sign arbitrary text'},self.host,self.origin),({**c,'nonce':'invented'},self.host,self.origin),(c,self.host,'https://foreign.example'),(c,'localhost:18882','http://localhost:18882')]:
            with self.subTest(payload=payload,origin=origin):
                with self.assertRaises(ValueError):self.hw.sign_login(self.token,payload,host,18882,origin)
        other=Account.create();c2=wallet.issue_challenge(other.address,self.host,18882,self.origin)
        with self.assertRaises(ValueError):self.hw.sign_login(self.token,c2,self.host,18882,self.origin)
        with patch('wallet_auth.time.time',return_value=10**12):
            with self.assertRaises(ValueError):self.hw.sign_login(self.token,c,self.host,18882,self.origin)
        self.assertEqual(len(self.calls),before)
    def test_disconnect_expiry_account_swap_and_busy_usb_fail_closed(self):
        self.assertEqual(self.hw.selected(self.token)['address'],self.account.address)
        self.hw.usb_lock.acquire()
        try:
            with self.assertRaisesRegex(ValueError,'pending'):self.hw.selected(self.token)
        finally:self.hw.usb_lock.release()
        self.account=Account.create()
        with self.assertRaisesRegex(ValueError,'changed'):self.hw.selected(self.token)
        with self.assertRaisesRegex(ValueError,'expired'):self.hw.selected(self.token)
        token,_=self.hw.connect('a'*64,'ledger-live',0);self.now[0]+=30000
        with self.assertRaises(ValueError):self.hw.selected(token)
        token,_=self.hw.connect('a'*64,'ledger-live',0);self.hw.disconnect(token)
        with self.assertRaises(ValueError):self.hw.selected(token)
    def test_rpc_is_only_authenticated_account_balances_and_requires_base_network(self):
        session={'address':self.account.address}
        self.assertEqual(self.hw.read_rpc(self.token,session,'eth_getBalance',[self.account.address,'0x10'])['result'],'0x10')
        bad=[('eth_sendRawTransaction',['0xbad']),('eth_getBalance',['0x'+'2'*40,'latest']),('eth_call',[{'to':'0x'+'2'*40,'data':'0x'},'latest']),('eth_getBalance',[self.account.address,{}])]
        before=len(self.rpc_calls)
        for method,params in bad:
            with self.assertRaises(ValueError):self.hw.read_rpc(self.token,session,method,params)
        self.assertEqual(len(self.rpc_calls),before)
        with self.assertRaises(ValueError):self.hw.read_rpc(self.token,{'address':'0x'+'2'*40},'eth_blockNumber',[])
        self.hw.rpc=lambda m,p:'0x1'
        with self.assertRaisesRegex(ValueError,'not Base'):self.hw.read_rpc(self.token,session,'eth_blockNumber',[])
    def test_invalid_account_choices_do_not_contact_device(self):
        before=len(self.calls)
        for device,scheme,index in [('bad','ledger-live',0),('a'*64,'custom',0),('a'*64,'legacy',True),('a'*64,'legacy',20)]:
            with self.assertRaises(ValueError):self.hw.connect(device,scheme,index)
        self.assertEqual(len(self.calls),before)
    def test_capability_failure_is_visible_not_false_readiness(self):
        def broken(p):raise ValueError('Install hardware dependencies')
        hw=HardwareWallet(runner=broken)
        self.assertFalse(hw.capabilities()['available']);self.assertIn('Install',hw.capabilities()['error'])

class BaseTransportTests(unittest.TestCase):
    def test_rpc_sends_json_with_identified_client_and_handles_provider_errors(self):
        requests=[]
        def gateway(request,timeout):
            requests.append(request)
            # Public RPC gateway declines unidentified/default Python clients.
            if not request.get_header('User-agent'):raise OSError('Forbidden')
            if request.get_header('Content-type')!='application/json':raise OSError('Wrong content type')
            payload=json.loads(request.data)
            return io.BytesIO(json.dumps({'jsonrpc':'2.0','id':payload['id'],'result':'0x2105'}).encode())
        hw=HardwareWallet()
        with patch('hardware_wallet.urlopen',side_effect=gateway):
            self.assertEqual(hw._rpc('eth_chainId',[]),'0x2105')
        self.assertEqual(json.loads(requests[0].data),{'jsonrpc':'2.0','id':1,'method':'eth_chainId','params':[]})
        with patch('hardware_wallet.urlopen',side_effect=OSError('provider down')):
            with self.assertRaisesRegex(ValueError,'Base RPC unavailable'):hw._rpc('eth_blockNumber',[])

if __name__=='__main__':unittest.main()
