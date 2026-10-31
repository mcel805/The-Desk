"""Chunked chart video archive in the same managed data root as Swing Lab."""
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json
import os
import re
import threading
import uuid
from zoneinfo import ZoneInfo
from storage import atomic_json, external_guard, fsync_dir, StorageFault

MAX_CHUNK = 8 * 1024 * 1024
ID = re.compile(r'^\d{4}-\d{2}-\d{2}_[a-f0-9]{32}$')

class TradeRecordings:
    def __init__(self, data, engine, guard=external_guard):
        self.root=Path(data)/'trade-videos';self.engine=engine;self.guard=guard;self.lock=threading.RLock()

    def folder(self, ident):
        if not isinstance(ident,str) or not ID.fullmatch(ident):raise ValueError('Invalid recording identity')
        return self.root/ident[:10]/ident

    def read(self, ident):
        try:return json.loads((self.folder(ident)/'manifest.json').read_text())
        except FileNotFoundError:raise ValueError('Recording not found')

    def catalog(self):
        # A date directory is the trading-session version; each clip is immutable.
        result=[]
        if self.root.exists():
            for date in sorted(self.root.iterdir(),reverse=True):
                if not re.fullmatch(r'\d{4}-\d{2}-\d{2}',date.name) or not date.is_dir():continue
                for folder in sorted(date.iterdir(),reverse=True):
                    if not ID.fullmatch(folder.name):continue
                    try:
                        m=self.read(folder.name);result.append({k:v for k,v in m.items() if k!='chunks'})
                    except (ValueError,OSError):continue
                    if len(result)>=200:break
                if len(result)>=200:break
        return {'recordings':sorted(result,key=lambda r:r['started_at'],reverse=True),
                'storage_mode':os.environ.get('DESK_STORAGE_MODE','LOCAL'), 'root':str(self.root),
                'session_timezone':'America/Los_Angeles','limit':200}

    def start(self,p):
        with self.lock:
            self.guard()
            aid=p.get('account_id');state=self.engine.state(aid)
            if aid!=state.get('active_account'):raise ValueError('Valid paper account required')
            market=p.get('instrument')
            if not isinstance(market,str) or len(market)>100 or ':' not in market:raise ValueError('Exact chart market required')
            if p.get('mime') not in ('video/webm','video/webm;codecs=vp8','video/webm;codecs=vp9'):raise ValueError('WebM recording required')
            now=datetime.now(timezone.utc);day=now.astimezone(ZoneInfo('America/Los_Angeles')).date().isoformat()
            ident=day+'_'+uuid.uuid4().hex
            m={'schema':'desk.trade-video.v1','id':ident,'account_id':aid,'instrument':market,
               'timeframe':str(p.get('timeframe',''))[:20],'mode':'PAPER','status':'recording',
               'started_at':now.isoformat(),'session_date':day,'session_timezone':'America/Los_Angeles',
               'mime':p['mime'],'bytes':0,'chunks':[], 'capture':'Chart canvas and trade overlays; browser must remain open and visible',
               'storage_mode':os.environ.get('DESK_STORAGE_MODE','LOCAL')}
            atomic_json(self.folder(ident)/'manifest.json',m);return {k:v for k,v in m.items() if k!='chunks'}

    def append(self,ident,sequence,body):
        if type(sequence) is not int or sequence<0 or not body or len(body)>MAX_CHUNK:raise ValueError('Invalid video chunk')
        digest=hashlib.sha256(body).hexdigest()
        with self.lock:
            self.guard();m=self.read(ident);chunks=m['chunks']
            if sequence<len(chunks):
                if chunks[sequence]['sha256']!=digest:raise ValueError('Chunk retry differs from accepted content')
                return {'accepted':sequence,'bytes':m['bytes']}
            if m['status']!='recording' or sequence!=len(chunks):raise ValueError('Recording closed or chunk out of sequence')
            lease=None;policy=os.environ.get('DESK_STORAGE_POLICY')
            if policy and os.environ.get('DESK_STORAGE_MODE')=='EXTERNAL':
                from storage_budget import reserve
                lease=reserve(json.loads(Path(policy).read_text()),len(body)+4096)
            path=self.folder(ident)/'chart.webm';before=path.stat().st_size if path.exists() else 0
            try:
                # Roll back only an unacknowledged tail left by an interrupted append.
                with open(path,'r+b' if path.exists() else 'w+b') as f:
                    os.chmod(path,0o600);f.truncate(m['bytes']);f.seek(m['bytes']);f.write(body);f.flush();os.fsync(f.fileno())
                m['chunks'].append({'sha256':digest,'bytes':len(body)});m['bytes']+=len(body)
                m['last_chunk_at']=datetime.now(timezone.utc).isoformat()
                atomic_json(self.folder(ident)/'manifest.json',m)
            finally:
                if lease:lease.finish(max(0,(path.stat().st_size if path.exists() else 0)-before))
            return {'accepted':sequence,'bytes':m['bytes']}

    def finish(self,p):
        with self.lock:
            self.guard();m=self.read(p.get('id'))
            if m['status']!='recording':return m
            reason=p.get('reason','closed')
            if reason not in ('closed','cancelled','disarmed','context-changed','hidden','error'):raise ValueError('Invalid recording finish reason')
            m.update(status='complete' if reason in ('closed','cancelled') else 'interrupted',reason=reason,
                     ended_at=datetime.now(timezone.utc).isoformat(),post_roll_seconds=120)
            atomic_json(self.folder(m['id'])/'manifest.json',m);return {k:v for k,v in m.items() if k!='chunks'}

    def get(self,handler,path,q):
        if path=='/api/trade-videos':handler.json(self.catalog());return True
        if path!='/api/trade-videos/media':return False
        ident=q.get('id',[''])[0];m=self.read(ident);file=self.folder(ident)/'chart.webm'
        if not file.exists():raise ValueError('No video data has arrived')
        size=min(file.stat().st_size,m['bytes']);start=0;end=size-1;status=200
        requested=handler.headers.get('Range')
        if requested:
            match=re.fullmatch(r'bytes=(\d+)-(\d*)',requested)
            if not match:raise ValueError('Unsupported media range')
            start=int(match[1]);end=min(end,int(match[2])) if match[2] else end
            if start>end or start>=size:
                handler.send_response(416);handler.send_header('Content-Range',f'bytes */{size}');handler.end_headers();return True
            status=206
        handler.send_response(status);handler.send_header('Content-Type','video/webm');handler.send_header('Accept-Ranges','bytes')
        handler.send_header('Content-Length',str(max(0,end-start+1)))
        if status==206:handler.send_header('Content-Range',f'bytes {start}-{end}/{size}')
        handler.end_headers()
        with file.open('rb') as f:
            f.seek(start);remaining=end-start+1
            while remaining>0:
                block=f.read(min(65536,remaining))
                if not block:break
                handler.wfile.write(block);remaining-=len(block)
        return True

    def post(self,handler,path,p):
        if path=='/api/trade-videos/start':handler.json(self.start(p));return True
        if path=='/api/trade-videos/finish':handler.json(self.finish(p));return True
        return False
