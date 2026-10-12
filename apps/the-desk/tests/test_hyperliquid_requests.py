import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import json

from funding_routes import FundingRoutes
from hyperliquid_requests import HyperliquidRequestStore


ADDRESS='0x'+'1'*40
OTHER='0x'+'2'*40
INTENT={'coin':'BTC','side':'buy','quantity':'1','price':'100','reduceOnly':False}
CLOID='0x'+'a'*32


class HyperliquidRequestStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.path=Path(self.temp.name)/'requests.sqlite3'

    def tearDown(self):
        self.temp.cleanup()

    def test_unresolved_request_persists_and_blocks_only_same_wallet_network(self):
        store=HyperliquidRequestStore(self.path)
        first=store.reserve(ADDRESS,'testnet',CLOID,INTENT)
        self.assertEqual(first['state'],'reserved')
        restarted=HyperliquidRequestStore(self.path)
        self.assertEqual(restarted.open(ADDRESS,'testnet')[0]['clientOrderId'],CLOID)
        with self.assertRaisesRegex(ValueError,'Reconcile'):
            restarted.reserve(ADDRESS,'testnet','0x'+'b'*32,INTENT)
        self.assertEqual(restarted.reserve(OTHER,'testnet','0x'+'b'*32,INTENT)['walletAddress'],OTHER)
        self.assertEqual(restarted.reserve(ADDRESS,'mainnet','0x'+'c'*32,INTENT)['network'],'mainnet')

    def test_rejection_can_release_before_submission(self):
        store=HyperliquidRequestStore(self.path)
        store.reserve(ADDRESS,'testnet',CLOID,INTENT)
        self.assertEqual(store.release(ADDRESS,'testnet',CLOID)['state'],'released')
        self.assertEqual(store.reserve(ADDRESS,'testnet','0x'+'b'*32,INTENT)['state'],'reserved')

    def test_timeout_and_missing_order_remain_blocked_until_acknowledged(self):
        store=HyperliquidRequestStore(self.path)
        store.reserve(ADDRESS,'testnet',CLOID,INTENT)
        store.mark_submitting(ADDRESS,'testnet',CLOID)
        uncertain=store.uncertain(ADDRESS,'testnet',CLOID,{'transport':'timeout'})
        self.assertEqual(uncertain['state'],'uncertain')
        with self.assertRaisesRegex(ValueError,'Reconcile'):
            store.reserve(ADDRESS,'testnet','0x'+'b'*32,INTENT)
        still_uncertain=store.uncertain(ADDRESS,'testnet',CLOID,{'status':'unknown'})
        self.assertEqual(still_uncertain['state'],'uncertain')
        acknowledged=store.acknowledge(ADDRESS,'testnet',CLOID,'open',987,{'status':'order'})
        self.assertEqual(acknowledged['venueOrderId'],'987')
        self.assertEqual(store.open(ADDRESS,'testnet'),[])
        self.assertEqual(store.reserve(ADDRESS,'testnet','0x'+'b'*32,INTENT)['state'],'reserved')

    def test_order_status_uses_official_info_query_and_exact_scope(self):
        class Response:
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def read(self):return b'{"status":"unknown"}'
        routes=FundingRoutes(18882,self.temp.name)
        with patch('funding_routes.urlopen',return_value=Response()) as opened:
            self.assertEqual(routes.hyperliquid_info('testnet',{'type':'orderStatus','user':ADDRESS,'oid':CLOID}),{'status':'unknown'})
        request=opened.call_args.args[0]
        self.assertEqual(request.full_url,'https://api.hyperliquid-testnet.xyz/info')
        self.assertEqual(json.loads(request.data),{'type':'orderStatus','user':ADDRESS,'oid':CLOID})

    def test_malformed_authoritative_order_status_remains_uncertain(self):
        class Handler:
            headers={'Host':'127.0.0.1:18882','Origin':'http://127.0.0.1:18882'}
            def json(self,obj,status=200):self.response=(obj,status)
        routes=FundingRoutes(18882,self.temp.name)
        routes.hyperliquid_requests.reserve(ADDRESS,'testnet',CLOID,INTENT)
        routes.identity=lambda handler:({'address':ADDRESS},'session')
        routes.hyperliquid_info=lambda network,payload:{'order':{'status':{},'order':{'oid':{}}}}
        handler=Handler()
        self.assertTrue(routes.post(handler,'/api/integrations/hyperliquid/reconcile',{'network':'testnet','clientOrderId':CLOID}))
        self.assertFalse(handler.response[0]['found'])
        self.assertEqual(handler.response[0]['request']['state'],'uncertain')
        self.assertEqual(routes.hyperliquid_requests.open(ADDRESS,'testnet')[0]['state'],'uncertain')


if __name__=='__main__':unittest.main()
