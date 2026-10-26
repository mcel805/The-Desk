"""External-first Desk/Journal supervisor. Never merges divergent SQLite histories."""
from __future__ import annotations
import argparse
import fcntl
import hashlib
import html
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import sqlite3
import subprocess
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parent
POLICY = ROOT / 'storage-policy.local.json'
CAPTURE_RESERVE_BYTES = 64 * 1024 * 1024
MIN_FREE_BYTES = 512 * 1024**2
LOG_LIMIT_BYTES = 8 * 1024**2

def atomic(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name('.' + path.name + '-' + uuid.uuid4().hex)
    with open(temp, 'w') as f:
        os.chmod(temp, 0o600)
        json.dump(value, f, indent=2)
        f.flush(); os.fsync(f.fileno())
    os.replace(temp, path)

def digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''): h.update(block)
    return h.hexdigest()

def inventory(root):
    result = {}
    for p in sorted(Path(root).rglob('*')):
        if p.is_symlink():
            result[str(p.relative_to(root))] = {'symlink': os.readlink(p)}
            continue
        if p.is_file(): result[str(p.relative_to(root))] = {'bytes': p.stat().st_size, 'sha256': digest(p)}
    return result

def size(root):
    return sum(p.stat().st_size for p in Path(root).rglob('*') if p.is_file() and not p.is_symlink())

def verified_copy(source, destination):
    """Call only after writers stop. Sources remain intact on every failure."""
    source, destination = Path(source), Path(destination)
    before = inventory(source)
    if destination.exists(): raise RuntimeError('Destination already exists: ' + str(destination))
    stage = destination.with_name('.copying-' + destination.name)
    if stage.is_symlink() or (stage.exists() and not stage.is_dir()):
        raise RuntimeError('Unowned copy stage needs inspection: ' + str(stage))
    if stage.exists(): shutil.rmtree(stage)
    try:
        shutil.copytree(source, stage, copy_function=shutil.copy2, symlinks=True)
        if before != inventory(stage) or before != inventory(source):
            raise RuntimeError('Copy verification failed or source changed; original retained')
        for p in stage.rglob('*'):
            if p.is_file() and not p.is_symlink():
                with open(p, 'rb') as f: os.fsync(f.fileno())
        os.replace(stage, destination)
    except BaseException:
        if stage.is_dir() and not stage.is_symlink():
            shutil.rmtree(stage, ignore_errors=True)
        raise
    atomic(destination.parent / (destination.name + '.copy-receipt.json'),
           {'source': str(source), 'destination': str(destination), 'checked_at': int(time.time()),
            'files': before, 'verified': True})
    return before

def drive_ready(policy):
    volume = Path(policy['volume'])
    if not volume.is_mount(): return False
    try:
        marker = json.loads((volume / '.mark-storage-volume.json').read_text())
        return marker['volume_uuid'] == policy['volume_uuid'] and marker['id'] == policy['marker']
    except (OSError, ValueError, KeyError): return False

def set_alias(alias, destination):
    alias, destination = Path(alias), Path(destination)
    if alias.is_symlink() and os.readlink(alias) == str(destination): return
    if alias.exists() and not alias.is_symlink():
        raise RuntimeError('Refusing to replace a non-link directory: ' + str(alias))
    temp = alias.with_name('.' + alias.name + '-link-' + uuid.uuid4().hex)
    temp.symlink_to(destination, target_is_directory=True)
    os.replace(temp, alias)

def attach_aliases(policy, base):
    for item in policy['aliases']:
        target = Path(base) / item['name']
        target.mkdir(parents=True, exist_ok=True)
        set_alias(item['path'], target)

def capacity_available(policy, additional=0):
    try:
        used = size(policy['external_root'])
        free = shutil.disk_usage(policy['volume']).free
    except OSError:
        return False, 0
    return (used + additional + CAPTURE_RESERVE_BYTES <= policy['limit_bytes'] and
            free > max(MIN_FREE_BYTES, additional + CAPTURE_RESERVE_BYTES)), used

def port_occupied(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.settimeout(.2)
        return probe.connect_ex(('127.0.0.1', port)) == 0

def bounded_log(stream, path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        existing = path.read_bytes()[-LOG_LIMIT_BYTES:]
    except OSError:
        existing = b''
    with open(path, 'w+b') as log:
        log.write(existing)
        while True:
            block = stream.read(64 * 1024)
            if not block: break
            log.write(block)
            log.flush()
            if log.tell() > LOG_LIMIT_BYTES:
                log.flush(); log.seek(-LOG_LIMIT_BYTES, os.SEEK_END)
                tail = log.read(LOG_LIMIT_BYTES)
                log.seek(0); log.truncate(); log.write(tail); log.flush()
    stream.close()

def fsync_directory(path):
    fd = os.open(str(path), os.O_RDONLY)
    try: os.fsync(fd)
    finally: os.close(fd)

def migrate_journal_secret(source, destination):
    source, destination = Path(source), Path(destination)
    if source.is_symlink() or destination.is_symlink():
        raise RuntimeError('Journal decryption key must be a regular local file')
    if not source.exists(): return
    if not source.is_file(): raise RuntimeError('Journal decryption key is not a regular file')
    destination.parent.mkdir(parents=True, exist_ok=True)
    key = source.read_bytes()
    if destination.exists():
        if not destination.is_file() or destination.read_bytes() != key:
            raise RuntimeError('Journal decryption key mismatch; refusing to remove the external copy')
    else:
        temp = destination.with_name('.' + destination.name + '-' + uuid.uuid4().hex)
        try:
            with open(temp, 'wb') as target:
                os.chmod(temp, 0o600); target.write(key); target.flush(); os.fsync(target.fileno())
            if temp.read_bytes() != key: raise RuntimeError('Journal decryption key verification failed')
            os.replace(temp, destination); fsync_directory(destination.parent)
        finally:
            if temp.exists(): temp.unlink()
    if source.read_bytes() != destination.read_bytes():
        raise RuntimeError('Journal decryption key mismatch; refusing to remove the external copy')
    source.unlink(); fsync_directory(source.parent)

class BoundedLog:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.file = open(self.path, 'a+b')
        self.file.seek(0, os.SEEK_END)
        if self.file.tell() > LOG_LIMIT_BYTES:
            self.file.flush(); self.file.seek(-LOG_LIMIT_BYTES, os.SEEK_END)
            tail = self.file.read(LOG_LIMIT_BYTES)
            self.file.seek(0); self.file.truncate(); self.file.write(tail); self.file.flush()
    def write(self, value):
        data = value.encode() if isinstance(value, str) else value
        self.file.write(data); self.file.flush()
        if self.file.tell() > LOG_LIMIT_BYTES:
            self.file.seek(-LOG_LIMIT_BYTES, os.SEEK_END)
            tail = self.file.read(LOG_LIMIT_BYTES)
            self.file.seek(0); self.file.truncate(); self.file.write(tail); self.file.flush()
    def flush(self): self.file.flush()
    def close(self): self.file.close()

def supervisor_command(port, no_workers=False, ibkr_mode='off', journal_port=None):
    command = [sys.executable, '-B', str(ROOT / 'storage_host.py'), '--port', str(port)]
    if no_workers: command.append('--no-workers')
    if ibkr_mode != 'off': command.extend(['--ibkr-mode', ibkr_mode])
    if journal_port is not None: command.extend(['--journal-port', str(journal_port)])
    return command

def route_if_configured(data_dir, port, detach=False, stop=False, qa=False, no_workers=False, ibkr_mode='off', journal_port=None):
    """Route normal launches through the external-first supervisor."""
    if qa or os.environ.get('DESK_STORAGE_MANAGED') == '1' or not POLICY.is_file(): return False
    command = supervisor_command(port, no_workers, ibkr_mode, journal_port)
    if stop: command.append('--stop')
    if detach: command.append('--detach')
    subprocess.run(command, check=True)
    return True

class Host:
    def __init__(self, policy, port, no_workers=False, ibkr_mode='off', journal_port=None):
        self.policy, self.port = policy, port
        self.no_workers, self.ibkr_mode = no_workers, ibkr_mode
        self.journal_port = journal_port if journal_port is not None else policy.get('journal_port', 3000)
        self.control = Path(policy['control']); self.control.mkdir(parents=True, exist_ok=True)
        self.state_file = self.control / 'state.json'
        self.quit = threading.Event(); self.continue_local = threading.Event()
        self.return_external = self.control / 'return-external'
        self.children = []; self.gate = None
        self.active = None; self.mode = 'WAITING'; self.used = 0
        self.error = ''; self.archives = []
        if (self.control / 'archives.json').exists():
            self.archives = json.loads((self.control / 'archives.json').read_text())

    def state(self):
        ready = drive_ready(self.policy)
        return_capacity = ready and self.mode == 'LOCAL_TEMPORARY' and self.active and self.active.exists()
        if return_capacity:
            return_capacity, self.used = capacity_available(self.policy, size(self.active))
        return {'mode': self.mode, 'external_connected': ready, 'external_root': self.policy['external_root'],
                'active_root': str(self.active) if self.active else None,
                'limit_bytes': self.policy['limit_bytes'], 'used_bytes': self.used,
                'message': self.error or ('SAMSUNG USB is the active data drive.' if self.mode == 'EXTERNAL' else
                   'Temporary local storage. Plug in SAMSUNG USB; external history is available when reconnected.'),
                'can_return': bool(return_capacity),
                'offline_archives': self.archives,
                'history_policy': 'Offline sessions are separate datasets, copied and verified on reconnect. Histories are never overwritten or automatically merged.'}

    def publish(self): atomic(self.state_file, self.state())

    def flush_captures(self):
        """Screenshot inbox remains writable while the USB is absent."""
        inbox=self.control/'Capture-Inbox';inbox.mkdir(exist_ok=True)
        if not drive_ready(self.policy):return
        destination=Path(self.policy['external_root'])/'live/captures/macOS'
        destination.mkdir(parents=True,exist_ok=True)
        for source in inbox.iterdir():
            if not source.is_file() or source.is_symlink() or time.time()-source.stat().st_mtime<5:continue
            # A recording or screenshot still held open stays local until complete.
            opened=subprocess.run(['lsof','-t',str(source)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            if opened.returncode!=1:continue
            source_size=source.stat().st_size
            available, self.used = capacity_available(self.policy, source_size)
            if not available:continue
            target=destination/source.name
            if target.exists():target=destination/(source.stem+'-'+uuid.uuid4().hex[:8]+source.suffix)
            stage=destination/('.copying-'+target.name+'-'+uuid.uuid4().hex)
            try:
                before=digest(source);shutil.copy2(source,stage)
                if before!=digest(stage) or before!=digest(source):raise RuntimeError('Capture verification failed')
                with open(stage,'rb') as f:os.fsync(f.fileno())
                os.replace(stage,target)
            except (OSError,RuntimeError):
                try:stage.unlink(missing_ok=True)
                except OSError:pass
                continue
            self.used+=target.stat().st_size;source.unlink()


    def stop_children(self):
        # Every owned child is a new process session; never touch arbitrary PIDs.
        for child, _ in self.children:
            if child.poll() is None:
                try: os.killpg(child.pid, signal.SIGTERM)
                except ProcessLookupError: pass
        for child, log_thread in self.children:
            try: child.wait(timeout=25)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL); child.wait(timeout=5)
            log_thread.join(timeout=5)
        self.children = []

    def child(self, command, cwd, env, log_name):
        # Logs stay on the active data volume along with all app records.
        proc = subprocess.Popen(command, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
        log_thread = threading.Thread(target=bounded_log, args=(proc.stdout, self.active / log_name), daemon=True)
        log_thread.start()
        self.children.append((proc, log_thread))
        return proc

    def start_apps(self):
        occupied = [name for name, port in (('Desk', self.port), ('Journal', self.journal_port)) if port_occupied(port)]
        if occupied: raise RuntimeError('Cannot start storage services; ' + ' and '.join(occupied) + ' port is already occupied')
        attach_aliases(self.policy, self.active)
        temporary=self.active/'.tmp';temporary.mkdir(exist_ok=True)
        migrate_journal_secret(self.active / 'journal' / '.secret', self.control / 'journal-secret')
        env = dict(os.environ, TMPDIR=str(temporary), SQLITE_TMPDIR=str(temporary),
                   DESK_CODEX_STATE_DIR=str(self.active/'desk/llm-runtime'), DESK_STORAGE_MANAGED='1', DESK_STORAGE_STATE=str(self.state_file),
                   DESK_STORAGE_RETURN=str(self.return_external),
                   DESK_STORAGE_POLICY=str(POLICY), DESK_STORAGE_MODE=self.mode,
                   JOURNAL_DATA_DIR=str(self.active / 'journal'),
                   JOURNAL_SECRET_FILE=str(self.control / 'journal-secret'),
                   DESK_JOURNAL_DB_PATH=str(self.active / 'journal/journal.db'))
        # Reuse the established launcher's restricted credential loading.
        from launch import env_values, TRADER
        journal = Path(self.policy['journal_app'])
        for path in (TRADER / '.env', TRADER / 'count-dashboard/.env', journal / '.env.local', journal / '.env'):
            for key, value in env_values(path).items(): env.setdefault(key, value)
        if self.mode == 'LOCAL_TEMPORARY':
            # New offline sessions must never reuse broker grants or resume paid collection.
            env['DESK_JEV_KEYCHAIN'] = 'disabled'
            env.pop('TYPESAFE_API_KEY', None)
        env.pop('DESK_HOST_LOG_PATH', None)
        env['LUX_JOURNAL_URL'] = 'http://127.0.0.1:' + str(self.journal_port)
        node = self.policy.get('node', 'node')
        self.child([node, str(journal / 'node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1',
                    '-p', str(self.journal_port)], str(journal), env, 'journal.log')
        python = self.policy.get('python', sys.executable)
        command = [python, '-B', str(ROOT / 'server.py'), '--port', str(self.port),
                   '--data-dir', str(self.active / 'desk')]
        if self.no_workers: command.append('--no-workers')
        if self.ibkr_mode != 'off': command.extend(['--ibkr-mode', self.ibkr_mode])
        self.child(command, str(ROOT), env, 'desk.log')

    def activate(self):
        try:self.start_apps()
        except Exception as e:
            self.stop_children()
            self.error='Storage services could not start: '+str(e)
            self.mode='ERROR' if drive_ready(self.policy) else 'WAITING'
            if not self.gate and not port_occupied(self.port):self.start_gate()

    def start_gate(self):
        host = self
        class Gate(BaseHTTPRequestHandler):
            def log_message(self, *args): pass
            def trusted(self):
                allowed = ('127.0.0.1:' + str(host.port), 'localhost:' + str(host.port))
                return self.headers.get('Host') in allowed and self.headers.get('Origin') in (None, *('http://' + h for h in allowed))
            def send(self, code, payload, content='application/json'):
                self.send_response(code); self.send_header('Content-Type', content)
                self.send_header('Cache-Control', 'no-store'); self.send_header('Content-Length', str(len(payload)))
                self.end_headers(); self.wfile.write(payload)
            def do_GET(self):
                if not self.trusted(): return self.send(403, b'{}')
                if self.path in ('/api/storage/status', '/api/data/status'):
                    return self.send(200, json.dumps(host.state()).encode())
                if self.path.startswith('/api/'): return self.send(503, b'{"error":"Connect SAMSUNG USB or choose temporary local storage."}')
                page = '''<!doctype html><meta name="viewport" content="width=device-width"><title>The Desk · Connect storage</title>
                <style>body{background:#151922;color:#eee;font:18px system-ui;max-width:760px;margin:12vh auto;padding:24px}button{background:#3268ff;color:white;border:0;border-radius:6px;padding:14px;cursor:pointer}p{line-height:1.6}.muted{color:#a8b1c4}</style>
                <h1>Connect SAMSUNG USB</h1><p id="message"></p><p>Your saved history is on the external drive. Plug it in to continue with that history.</p>
                <button id="local">Continue with temporary local storage</button><p class="muted">Temporary work starts in a separate workspace. When the drive returns, it is copied and verified before switching back. Nothing overwrites your external history.</p>
                <script>const b=document.querySelector('#local');b.onclick=async()=>{b.disabled=true;const r=await fetch('/api/storage/continue-local',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!r.ok)b.disabled=false;};setInterval(async()=>{try{const r=await fetch('/api/storage/status');const s=await r.json();document.querySelector('#message').textContent=s.message;if(s.mode==='EXTERNAL'||s.mode==='LOCAL_TEMPORARY')location.reload();}catch{}},2000);</script>'''
                return self.send(200, page.encode(), 'text/html; charset=utf-8')
            def do_POST(self):
                if not self.trusted() or not self.headers.get('Origin'): return self.send(403, b'{}')
                if self.path != '/api/storage/continue-local': return self.send(404, b'{}')
                if shutil.disk_usage(host.control).free < 512 * 1024**2:
                    return self.send(507, b'{"error":"Local disk needs at least 512 MiB free."}')
                host.continue_local.set(); self.send(200, b'{"starting":true}')
        self.gate = ThreadingHTTPServer(('127.0.0.1', self.port), Gate)
        threading.Thread(target=self.gate.serve_forever, daemon=True).start()

    def close_gate(self):
        if self.gate:
            self.gate.shutdown(); self.gate.server_close(); self.gate = None

    def archive_local(self):
        if not self.active or self.mode != 'LOCAL_TEMPORARY': return
        if not drive_ready(self.policy): raise RuntimeError('External drive disconnected before archive')
        root = Path(self.policy['external_root'])
        needed = size(self.active)
        available, self.used = capacity_available(self.policy, needed)
        if not available: raise RuntimeError('External storage lacks capacity; temporary work remains local')
        destination = root / 'offline-sessions' / self.active.name
        destination.parent.mkdir(parents=True, exist_ok=True)
        verified_copy(self.active, destination)
        self.archives.append(str(destination))
        atomic(self.control / 'archives.json', self.archives)
        atomic(self.control / 'offline-active.json', {'path':str(self.active),'archived':str(destination)})

    def run(self):
        if (self.control / 'offline-active.json').exists():
            saved=json.loads((self.control / 'offline-active.json').read_text())
            self.active = Path(saved['path'])
            if saved.get('archived') and drive_ready(self.policy):
                destination=Path(saved['archived'])
                if not destination.is_dir():raise RuntimeError('Archived offline workspace is missing')
                if self.active.exists():
                    if inventory(self.active)!=inventory(destination):raise RuntimeError('Offline archive verification differs')
                    shutil.rmtree(self.active)
                (self.control / 'offline-active.json').unlink()
                self.active=None
            else:
                if not self.active.is_dir(): raise RuntimeError('Saved temporary workspace is missing; inspect before continuing')
                self.mode = 'LOCAL_TEMPORARY'
        try:
            while not self.quit.is_set():
                ready = drive_ready(self.policy)
                if ready:
                    ready, self.used = capacity_available(self.policy)
                try:self.flush_captures()
                except OSError:pass # Inbox files remain available for the next reconnect.
                if self.mode == 'LOCAL_TEMPORARY':
                    return_ready = ready and self.active and self.active.exists()
                    if return_ready:
                        return_ready, self.used = capacity_available(self.policy, size(self.active))
                    if return_ready and self.return_external.exists():
                        self.stop_children()
                        try:self.archive_local()
                        except Exception as e:
                            self.error = 'Temporary work remains local: ' + str(e)
                            self.return_external.unlink(missing_ok=True); self.activate(); self.publish()
                            self.quit.wait(3); continue
                        shutil.rmtree(self.active)
                        (self.control / 'offline-active.json').unlink(missing_ok=True)
                        self.return_external.unlink(missing_ok=True)
                        self.active = None; self.mode = 'WAITING'
                    else:
                        if not self.children: self.activate()
                        self.publish(); self.quit.wait(3); continue
                if self.mode == 'EXTERNAL' and not ready:
                    self.error = 'SAMSUNG USB is disconnected, full, or has reached the 200 GB budget. Connect the drive or continue temporarily on this Mac.'
                    self.stop_children(); self.mode = 'WAITING'; self.active = None
                if self.mode == 'WAITING':
                    if ready:
                        self.close_gate(); self.error = ''
                        self.active = Path(self.policy['external_root']) / 'live'; self.mode = 'EXTERNAL'
                        self.publish()
                        self.activate()
                    elif self.continue_local.is_set():
                        self.close_gate(); self.continue_local.clear(); self.error = ''
                        self.active = self.control / 'temporary' / time.strftime('%Y%m%dT%H%M%S')
                        self.active.mkdir(parents=True, exist_ok=False); self.mode = 'LOCAL_TEMPORARY'
                        atomic(self.control / 'offline-active.json', {'path': str(self.active)})
                        self.publish()
                        self.activate()
                    elif not self.gate: self.start_gate()
                if self.children and any(p.poll() is not None for p, _ in self.children):
                    self.stop_children(); self.error = 'A storage service stopped. Inspect the private Desk/Journal logs before restarting.'
                    self.mode = 'ERROR'; self.start_gate()
                self.publish(); self.quit.wait(3)
        finally:
            self.close_gate(); self.stop_children(); self.publish()

def main():
    p = argparse.ArgumentParser(); p.add_argument('--port', type=int, default=18880)
    p.add_argument('--detach', action='store_true'); p.add_argument('--stop', action='store_true')
    p.add_argument('--no-workers', action='store_true'); p.add_argument('--ibkr-mode', choices=('off','demo','gateway'), default='off'); p.add_argument('--journal-port', type=int)
    args = p.parse_args(); policy = json.loads(POLICY.read_text())
    control = Path(policy['control']); control.mkdir(parents=True, exist_ok=True)
    lock = open(control / 'host.lock', 'a+')
    if args.stop:
        # PID identity is checked against the exact script before signalling.
        saved = json.loads((control / 'host.json').read_text())
        cmd = subprocess.check_output(['ps', '-p', str(saved['pid']), '-o', 'command='], text=True)
        if str(ROOT / 'storage_host.py') not in cmd: raise RuntimeError('Storage host PID no longer matches')
        os.kill(saved['pid'], signal.SIGTERM); return
    try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print('The Desk storage host is already running: http://127.0.0.1:' + str(args.port)); return
    if args.detach:
        fcntl.flock(lock, fcntl.LOCK_UN); lock.close()
        env = os.environ.copy(); env['DESK_HOST_LOG_PATH'] = str(control / 'host.log')
        subprocess.Popen(supervisor_command(args.port, args.no_workers, args.ibkr_mode, args.journal_port),
                         env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        print('The Desk: http://127.0.0.1:' + str(args.port)); return
    if os.environ.get('DESK_HOST_LOG_PATH'):
        sys.stdout = BoundedLog(os.environ['DESK_HOST_LOG_PATH'])
        sys.stderr = sys.stdout
    atomic(control / 'host.json', {'pid': os.getpid(), 'port': args.port})
    host = Host(policy, args.port, args.no_workers, args.ibkr_mode, args.journal_port)
    for sig in (signal.SIGTERM, signal.SIGINT): signal.signal(sig, lambda *a: host.quit.set())
    host.run()

if __name__ == '__main__': main()
