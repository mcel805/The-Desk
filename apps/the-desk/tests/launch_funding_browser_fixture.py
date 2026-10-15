"""Create an isolated UI fixture server, with actual synthetic SIWE verification.

Run with the wallet test venv. It copies only the required source into a temp
directory and never touches an installed Desk database or wallet extension.
"""
from pathlib import Path
import os
import shutil
import subprocess
import sys
import tempfile

root=Path(__file__).resolve().parents[1]
browser_port=os.environ.get('QA_BROWSER_PORT','18883')
with tempfile.TemporaryDirectory(prefix='desk-wallet-browser-') as tmp:
    target=Path(tmp);(target/'web/vendor').mkdir(parents=True)
    for name in ['server.py','engine.py','market_stream.py','wallet_auth.py','funding_routes.py','broker_connection.py','hyperliquid_requests.py','hardware_wallet.py']:shutil.copyfile(root/name,target/name)
    for name in ['funding-ui.mjs','wallet-pairing.mjs','wallet-model.mjs','hardware-wallet.mjs','funding.css','desk.css']:shutil.copyfile(root/'web'/name,target/'web'/name)
    shutil.copyfile(root/'web/vendor/wallet-transports.js',target/'web/vendor/wallet-transports.js')
    shutil.copyfile(root/'web/vendor/wallet-qr.js',target/'web/vendor/wallet-qr.js')
    shutil.copyfile(root/'web/vendor/WALLET-NOTICE.txt',target/'web/vendor/WALLET-NOTICE.txt')
    # The browser fixture signs only a synthetic order message; it never imports
    # the production exchange transport or sends a venue request.
    (target/'web/vendor/hyperliquid-wallet.js').write_text('''
export function limitOrder(input, meta) { const a=meta.universe.findIndex(x=>x.name===input.coin); if(a<0) throw new Error('unsupported'); return {a,b:input.side==='buy',p:input.price,s:input.quantity,r:!!input.reduceOnly,t:{limit:{tif:'Gtc'}},c:input.cloid}; }
export function exchangeFor(provider,address,testnet) { return { async order({orders}) { await provider.request({method:'eth_signTypedData_v4',params:[address,'0xfixture']}); return {status:'ok',response:{data:{statuses:[{resting:{oid:123}}]}}}; }, async cancel() { await provider.request({method:'eth_signTypedData_v4',params:[address,'0xfixture-cancel']}); return {status:'ok'}; } }; }
export function orderResult(response) { const status=response?.response?.data?.statuses?.[0]; if(response?.status!=='ok'||!status?.resting||!Number.isSafeInteger(status.resting.oid))throw new Error('Unknown fixture response'); return {state:'resting',oid:status.resting.oid}; }
''')
    # Compile the fixture with the installed pinned viem dependency.
    subprocess.run([str(root/'node_modules/esbuild/bin/esbuild'),str(root/'tests/funding-browser-fixture.mjs'),'--bundle','--format=esm','--external:../web/funding-ui.mjs','--outfile='+str(target/'web/fixture.mjs')],check=True)
    p=target/'web/fixture.mjs';p.write_text(p.read_text().replace("../web/funding-ui.mjs","./funding-ui.mjs"))
    (target/'web/index.html').write_text('''<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="desk.css"><link rel="stylesheet" href="funding.css"><title>The Desk wallet · synthetic browser fixture</title></head><body style="display:block;overflow:auto;padding:24px"><h1>Isolated wallet QA</h1><p>TEST ONLY · balances and venue snapshots are synthetic. Identity is verified by the real server. Order signing uses a local mock; no venue order or transfer is sent.</p><button id="walletButton">Connect wallet</button><label><input type="checkbox" id="fixtureReject">Decline signature</label><button id="fixtureChange">Change test account</button><button id="fixtureReset">Reset test fixture</button><p id="fixtureCalls"></p><script type="module" src="fixture.mjs"></script></body></html>''')
    subprocess.run([sys.executable,str(target/'server.py'),'--port',browser_port,'--data-dir',str(target/'data'),'--no-workers'],check=True)
