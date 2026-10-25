"""Loopback-only storage diagnostics. Restore tests never replace live files."""
import json
from pathlib import Path
import shutil
import tempfile
import zipfile
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import urlparse,parse_qs
from storage import StorageFault

class DataRoutes:
    def __init__(self,vault,research=None):self.vault=vault;self.research=research
    def get(self,h,path,q):
        if path=='/api/data/status':
            state=self.vault.status()
            if self.research:
                try:
                    research=self.research.status()
                    state['collection']={k:{name:v.get(name) for name in ('status','running','run','observed_at','archived','detail','collection')} for k,v in research['symbols'].items()}
                except Exception:state['collection_error']='Research storage is unavailable; no healthy collection status can be asserted.'
            h.json(state);return True
        if path=='/api/data/download':
            sid=q.get('id',[''])[0];self.vault.verify(sid);m=self.vault.manifest(sid)
            with tempfile.TemporaryFile() as out:
                with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
                    z.write(self.vault.root/sid/'manifest.json','manifest.json')
                    for name in m['files']:z.write(self.vault.root/sid/name,name)
                length=out.tell();out.seek(0)
                h.send_response(200);h.send_header('Content-Type','application/zip');h.send_header('Content-Length',str(length));h.send_header('Content-Disposition','attachment; filename="desk-backup-'+sid+'.zip"');h.end_headers();shutil.copyfileobj(out,h.wfile)
            return True
        return False
    def post(self,h,path,p):
        fields={'/api/data/backup':set(),'/api/data/verify':{'id'},'/api/data/test-restore':{'id'},'/api/data/mirror':{'path'}}
        if path not in fields:return False
        if not h.headers.get('Origin'):h.json({'error':'Same-origin browser action required'},403);return True
        if not isinstance(p,dict) or set(p)!=fields[path]:raise ValueError('Invalid data action')
        if path=='/api/data/backup':result=self.vault.snapshot('manual')
        elif path=='/api/data/verify':result=self.vault.verify(p['id'])
        elif path=='/api/data/test-restore':result=self.vault.test_restore(p['id'])
        else:
            if not isinstance(p['path'],str):raise ValueError('Invalid folder path')
            result=self.vault.set_mirror(p['path'])
        h.json(result);return True

def serve_recovery(vault,port,web):
    """Keep recovery diagnostics available when normal services cannot safely open."""
    routes=DataRoutes(vault)
    class Recovery(SimpleHTTPRequestHandler):
        def __init__(self,*a,**kw):super().__init__(*a,directory=str(web),**kw)
        def log_message(self,*a):pass
        def json(self,value,status=200):
            payload=json.dumps(value).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload)
        def trusted(self):
            allowed=('127.0.0.1:'+str(port),'localhost:'+str(port))
            return self.headers.get('Host') in allowed and (not self.headers.get('Origin') or self.headers['Origin'] in ('http://'+x for x in allowed))
        def do_GET(self):
            if not self.trusted():return self.json({'error':'Loopback origin required'},403)
            p=urlparse(self.path)
            try:
                if routes.get(self,p.path,parse_qs(p.query)):return
                if p.path=='/api/health':return self.json({'ok':False,'application':'The Desk','storage':'RECOVERY_REQUIRED'},503)
                if p.path in ('/','/swing-lab.html'):self.path='/data-health.html'
                if p.path.startswith('/api/'):return self.json({'error':'Recovery mode: collection and trading services are stopped'},503)
                return super().do_GET()
            except Exception:return self.json({'error':'Recovery action failed; current data has not been replaced'},400)
        def do_POST(self):
            if not self.trusted() or not self.headers.get('Content-Type','').startswith('application/json'):return self.json({'error':'Same-origin JSON required'},403)
            try:
                n=int(self.headers.get('Content-Length','0'))
                if not 0<n<=4096:raise ValueError('Invalid action size')
                if routes.post(self,urlparse(self.path).path,json.loads(self.rfile.read(n))):return
                return self.json({'error':'Recovery mode: writes and collection are stopped'},503)
            except Exception:return self.json({'error':'Recovery action failed; current data has not been replaced'},400)
    server=ThreadingHTTPServer(('127.0.0.1',port),Recovery)
    try:server.serve_forever()
    finally:server.server_close()
