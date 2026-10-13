"""Local Ledger USB login and Base balances; no arbitrary signing or transfers."""
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
from threading import Lock
import time
from urllib.request import Request, urlopen
import wallet_auth as wallet

COOKIE = 'desk_hardware_session'
TTL = wallet.SESSION_TTL_SECONDS
USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

class HardwareWallet:
    def __init__(self, runner=None, rpc=None, clock=time.time):
        self.root = Path(__file__).resolve().parent
        self.runner = runner or self._run
        self.rpc = rpc or self._rpc
        self.clock = clock
        self.records = {}
        self.lock = Lock()
        self.usb_lock = Lock()
        self._capabilities = None

    def _run(self, payload):
        node = os.environ.get('NODE_BIN') or shutil.which('node')
        if not node: raise ValueError('Install Node.js 22 and run npm ci in apps/the-desk.')
        try:
            result = subprocess.run([node, str(self.root / 'native-ledger.mjs')], input=json.dumps(payload), text=True,
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, cwd=self.root, timeout=110, check=False)
            value = json.loads(result.stdout)
        except subprocess.TimeoutExpired as exc:
            raise ValueError('Hardware request timed out. Unlock Ledger and reconnect.') from exc
        except (OSError, json.JSONDecodeError) as exc:
            raise ValueError('USB connector could not start. Run npm ci in apps/the-desk.') from exc
        if not isinstance(value, dict) or value.get('ok') is not True:
            raise ValueError(value.get('error', 'USB connector unavailable.') if isinstance(value, dict) else 'USB connector unavailable.')
        return value

    def _device(self, payload):
        if not self.usb_lock.acquire(blocking=False): raise ValueError('A hardware request is already pending. Finish it on the device first.')
        try: return self.runner(payload)
        finally: self.usb_lock.release()

    def capabilities(self):
        if self._capabilities and self.clock() - self._capabilities[0] < 60: return self._capabilities[1]
        try:
            value = self.runner({'operation': 'capabilities'})
            result = {'available': value.get('available') is True, 'device': 'Ledger', 'transport': 'native-usb', 'chainId': 8453}
        except ValueError as exc: result = {'available': False, 'device': 'Ledger', 'error': str(exc)}
        self._capabilities = (self.clock(), result)
        return result

    def discover(self): return {'devices': self._device({'operation': 'discover'}).get('devices', [])}

    def _record(self, token):
        with self.lock:
            record = self.records.get(hashlib.sha256((token or '').encode()).hexdigest())
            if not record or record['expires'] <= self.clock(): raise ValueError('Hardware connection expired. Scan and reconnect your Ledger.')
            return dict(record)

    def connect(self, device_id, scheme, index, previous=None):
        if not isinstance(device_id, str) or not re.fullmatch(r'[a-f0-9]{64}', device_id): raise ValueError('Select a Ledger from the USB scan.')
        if scheme not in ('ledger-live', 'legacy') or type(index) is not int or not 0 <= index <= 19: raise ValueError('Choose an Ethereum account from 1 to 20.')
        value = self._device({'operation': 'account', 'deviceId': device_id, 'scheme': scheme, 'index': index, 'confirmAddress': True})
        address = value.get('address')
        if not isinstance(address, str) or not wallet.ADDRESS_RE.fullmatch(address): raise ValueError('USB device returned an invalid Ethereum address.')
        token = secrets.token_urlsafe(32)
        with self.lock:
            for key, record in list(self.records.items()):
                if record['expires'] <= self.clock(): self.records.pop(key, None)
            if len(self.records) >= 64: raise ValueError('Too many hardware sessions. Disconnect unused sessions.')
            self.records[hashlib.sha256(token.encode()).hexdigest()] = {'address': address, 'deviceId': device_id, 'scheme': scheme,
                'index': index, 'path': value['path'], 'expires': self.clock() + TTL}
        self.disconnect(previous)
        return token, {'address': address, 'path': value['path'], 'chainId': 8453, 'connector': 'ledger-usb'}

    def selected(self, token):
        record = self._record(token)
        value = self._device({'operation': 'account', **{k: record[k] for k in ('deviceId', 'scheme', 'index')}, 'confirmAddress': False})
        if str(value.get('address', '')).lower() != record['address'].lower():
            self.disconnect(token); raise ValueError('Hardware account changed. Reconnect and sign in again.')
        return {'address': record['address'], 'path': record['path'], 'chainId': 8453, 'connector': 'ledger-usb'}

    def sign_login(self, token, payload, host, port, origin):
        record = self._record(token)
        wallet.validate_pending_challenge(record['address'], payload.get('nonce'), payload.get('message'), host, port, origin)
        value = self._device({'operation': 'sign-login', **{k: record[k] for k in ('deviceId', 'scheme', 'index', 'address')}, 'message': payload['message']})
        signature = value.get('signature')
        if str(value.get('address', '')).lower() != record['address'].lower() or not isinstance(signature, str) or not re.fullmatch(r'0x[0-9a-fA-F]{130}', signature):
            raise ValueError('Invalid device login response. Reconnect the hardware wallet.')
        wallet.validate_pending_challenge(record['address'], payload.get('nonce'), payload.get('message'), host, port, origin)
        return {'signature': signature}

    def disconnect(self, token):
        with self.lock: self.records.pop(hashlib.sha256((token or '').encode()).hexdigest(), None)

    def _rpc(self, method, params):
        url = os.environ.get('DESK_BASE_RPC_URL', 'https://mainnet.base.org')
        if not url.startswith('https://'): raise ValueError('The configured Base RPC must use HTTPS.')
        request = Request(url, data=json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': method, 'params': params}).encode(), headers={'Content-Type': 'application/json', 'User-Agent': 'TheDesk/1.0'})
        try:
            with urlopen(request, timeout=12) as response: value = json.load(response)
        except Exception as exc: raise ValueError('Base RPC unavailable. Refresh balances shortly.') from exc
        if not isinstance(value, dict) or value.get('error') or value.get('id') != 1 or not isinstance(value.get('result'), str): raise ValueError('Base RPC returned an invalid response.')
        return value['result']

    def read_rpc(self, token, session, method, params):
        record = self._record(token); address = record['address']
        if session['address'].lower() != address.lower(): raise ValueError('Hardware account does not match this signed-in wallet.')
        if not isinstance(params, list): raise ValueError('RPC parameters must be a list.')
        block_ok = lambda v: isinstance(v, str) and (v == 'latest' or re.fullmatch(r'0x[0-9a-fA-F]{1,16}', v))
        allowed = method == 'eth_blockNumber' and params == []
        allowed |= method == 'eth_getBalance' and len(params) == 2 and isinstance(params[0], str) and params[0].lower() == address.lower() and bool(block_ok(params[1]))
        if method == 'eth_call' and len(params) == 2 and isinstance(params[0], dict):
            call = params[0]; data = '0x70a08231' + address[2:].lower().rjust(64, '0')
            allowed |= set(call) == {'to', 'data'} and str(call.get('to', '')).lower() == USDC.lower() and str(call.get('data', '')).lower() == data and bool(block_ok(params[1]))
        if not allowed: raise ValueError('Only this wallet’s Base ETH and native USDC balances can be read.')
        if self.rpc('eth_chainId', []) != '0x2105': raise ValueError('Configured RPC is not Base Mainnet.')
        result = self.rpc(method, params)
        if not re.fullmatch(r'0x[0-9a-fA-F]+', result): raise ValueError('Base RPC returned invalid balance data.')
        return {'result': result}
