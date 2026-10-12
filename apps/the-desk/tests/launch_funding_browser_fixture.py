"""Create an isolated UI fixture server, with actual synthetic SIWE verification.

Run with the wallet test venv. It copies only the required source into a temp
directory and never touches an installed Desk database or wallet extension.
"""
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='desk-wallet-browser-') as tmp:
    target=Path(tmp);(target/'web/vendor').mkdir(parents=True)
    for name in ['server.py','engine.py','market_stream.py','wallet_auth.py','funding_routes.py','broker_connection.py','hyperliquid_requests.py']:shutil.copyfile(root/name,target/name)
    for name in ['funding-ui.mjs','wallet-model.mjs','funding.css','desk.css']:shutil.copyfile(root/'web'/name,target/'web'/name)
    shutil.copyfile(root/'web/vendor/hyperliquid-wallet.js',target/'web/vendor/hyperliquid-wallet.js')
    # Compile the fixture with the installed pinned viem dependency.
    subprocess.run(['node',str(root/'node_modules/esbuild/bin/esbuild'),str(root/'tests/funding-browser-fixture.mjs'),'--bundle','--format=esm','--external:../web/funding-ui.mjs','--outfile='+str(target/'web/fixture.mjs')],check=True)
    p=target/'web/fixture.mjs';p.write_text(p.read_text().replace("../web/funding-ui.mjs","./funding-ui.mjs"))
    (target/'web/index.html').write_text('''<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="desk.css"><link rel="stylesheet" href="funding.css"><title>The Desk wallet · synthetic browser fixture</title></head><body style="display:block;overflow:auto;padding:24px"><h1>Isolated wallet QA</h1><p>TEST ONLY · balances and venue snapshots are synthetic. Identity is verified by the real server. No order or transfer methods are available.</p><button id="walletButton">Connect wallet</button><label><input type="checkbox" id="fixtureReject">Decline signature</label><button id="fixtureChange">Change test account</button><button id="fixtureReset">Reset test fixture</button><p id="fixtureCalls"></p><script type="module" src="fixture.mjs"></script></body></html>''')
    subprocess.run([sys.executable,str(target/'server.py'),'--port','18883','--data-dir',str(target/'data'),'--no-workers'],check=True)
