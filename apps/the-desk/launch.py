"""Start The Desk and the existing Lux journal without copying credentials."""
import argparse
import json
import os
from pathlib import Path
import secrets
import signal
import sqlite3
import subprocess
import sys
import time
from urllib.request import urlopen

ROOT=Path(__file__).resolve().parent
REPO_DEFAULT=ROOT.parents[1] if (ROOT.parents[1]/'integrations/open-source/trade-journal').is_dir() else Path('/Users/markceleste/Documents/ChatGPT/The Trader - a trading company')
TRADER=Path(os.environ.get('TRADER_REPO',str(REPO_DEFAULT)))

def reachable(url):
    try:
        with urlopen(url,timeout=1) as r:return r.status==200
    except Exception:return False

def process_start(pid):
    try:return subprocess.check_output(['ps','-p',str(pid),'-o','lstart='],text=True).strip()
    except subprocess.CalledProcessError:return None

def env_values(path):
    result={}
    if path.is_file():
        for line in path.read_text().splitlines():
            line=line.strip()
            if line.startswith('export '):line=line[7:]
            if '=' not in line or line.startswith('#'):continue
            key,value=line.split('=',1)
            if key.strip() in ('COUNT_DESK_JOURNAL_BRIDGE_TOKEN','LUX_JOURNAL_URL'):
                result[key.strip()]=value.strip().strip('"').strip("'")
    return result

def main():
    p=argparse.ArgumentParser();p.add_argument('--data-dir',default=os.environ.get('DESK_DATA_DIR'));p.add_argument('--port',type=int,default=18880);p.add_argument('--journal-port',type=int,default=3000);p.add_argument('--qa',action='store_true');p.add_argument('--stop',action='store_true');p.add_argument('--detach',action='store_true');args=p.parse_args()
    data=Path(args.data_dir).expanduser().resolve() if args.data_dir else ROOT/('qa-data' if args.qa else 'data');data.mkdir(parents=True,exist_ok=True)
    pidfile=data/'processes.json'
    if args.stop:
        if pidfile.exists():
            saved=json.loads(pidfile.read_text())
            for pid in saved.get('owned',[]):
                try:
                    command=subprocess.check_output(['ps','-p',str(pid),'-o','command='],text=True)
                    # A stale PID file must never terminate an unrelated reused PID.
                    fingerprint=saved.get('starts',{}).get(str(pid))
                    valid_start=fingerprint and process_start(pid)==fingerprint
                    known_command=str(ROOT/'server.py') in command or ('trade-journal/apps/web/node_modules/next/dist/bin/next' in command and ' start ' in command)
                    # Next renames its process to next-server after startup.
                    next_owned=valid_start and command.strip().startswith('next-server')
                    if (known_command and (not fingerprint or valid_start)) or next_owned:
                        if valid_start:os.killpg(int(pid),signal.SIGTERM)
                        else:os.kill(int(pid),signal.SIGTERM)
                except ProcessLookupError:pass
                except subprocess.CalledProcessError:pass
            pidfile.unlink()
        return
    desk_url='http://127.0.0.1:'+str(args.port)
    if reachable(desk_url+'/api/health') or reachable(desk_url+'/api/data/status'):
        print(desk_url if reachable(desk_url+'/api/health') else desk_url+'/data-health.html');return
    env=os.environ.copy()
    if not args.qa:
        for path in (TRADER/'.env',TRADER/'count-dashboard/.env',TRADER/'integrations/open-source/trade-journal/apps/web/.env.local',TRADER/'integrations/open-source/trade-journal/apps/web/.env'):
            for k,v in env_values(path).items():env.setdefault(k,v)
    token_path=data/'bridge-token'
    if not env.get('COUNT_DESK_JOURNAL_BRIDGE_TOKEN'):
        if not token_path.exists():token_path.write_text(secrets.token_urlsafe(40));token_path.chmod(0o600)
        env['COUNT_DESK_JOURNAL_BRIDGE_TOKEN']=token_path.read_text().strip()
    journal=Path(env.get('LUX_JOURNAL_DIR',str(TRADER/'integrations/open-source/trade-journal')))/'apps/web'
    journal_url='http://127.0.0.1:'+str(args.journal_port)
    env['LUX_JOURNAL_URL']=journal_url
    env['DESK_JOURNAL_DB_PATH']=str(data/'journal/journal.db' if args.qa else journal/'data/journal.db')
    owned=[];children=[]
    if args.qa and reachable(journal_url):
        raise RuntimeError('QA journal port is occupied. Choose a free --journal-port; QA never reuses an unknown journal runtime.')
    if not args.qa and (journal/'data/journal.db').is_file():
        backup=data/'journal-startup-backup.db'
        if not backup.exists():
            with sqlite3.connect(str(journal/'data/journal.db')) as src, sqlite3.connect(str(backup)) as out:src.backup(out)
    if not reachable(journal_url):
        if not (journal/'.next/BUILD_ID').is_file():raise RuntimeError('Existing Lux journal build not found. Build the journal first; no alternate journal will be substituted.')
        if args.qa:env['JOURNAL_DATA_DIR']=str(data/'journal')
        node=os.environ.get('NODE_BIN','node')
        cmd=[node,str(journal/'node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p',str(args.journal_port)]
        log=open(data/'journal.log','ab')
        proc=subprocess.Popen(cmd,cwd=str(journal),env=env,stdout=log,stderr=log,start_new_session=True);children.append(proc);owned.append(proc.pid)
        for _ in range(60):
            if reachable(journal_url):break
            if proc.poll() is not None:raise RuntimeError('Lux journal failed to start; inspect the private runtime journal.log')
            time.sleep(.5)
        else:raise RuntimeError('Lux journal readiness timeout')
    log=open(data/'desk.log','ab')
    candidates=[ROOT/'.venv/bin/python',TRADER/'count-dashboard/.venv/bin/python']
    server_python=os.environ.get('DESK_PYTHON_BIN') or next((str(p) for p in candidates if p.is_file()),sys.executable)
    proc=subprocess.Popen([server_python,str(ROOT/'server.py'),'--port',str(args.port),'--data-dir',str(data)],cwd=str(ROOT),env=env,stdout=log,stderr=log,start_new_session=True);children.append(proc);owned.append(proc.pid)
    pidfile.write_text(json.dumps({'owned':owned,'starts':{str(pid):process_start(pid) for pid in owned},'desk_url':desk_url,'journal_url':journal_url}))
    for _ in range(30):
        if reachable(desk_url+'/api/health') or reachable(desk_url+'/api/data/status'):break
        if proc.poll() is not None:raise RuntimeError('The Desk failed to start; inspect runtime desk.log')
        time.sleep(.25)
    else:raise RuntimeError('The Desk readiness timeout')
    print('The Desk: '+desk_url+'\nLux Journal: '+journal_url)
    if not args.detach:
        try:proc.wait()
        except KeyboardInterrupt:
            for child in children:
                if child.poll() is None:child.terminate()

if __name__=='__main__':main()
