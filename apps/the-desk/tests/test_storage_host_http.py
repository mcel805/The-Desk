"""Exercise disconnect, consent, reconnect, and separate-dataset preservation."""
import json
from pathlib import Path
import socket
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from urllib.request import Request,urlopen
from urllib.error import HTTPError
import storage_host as module

class HostHTTPTests(unittest.TestCase):
 def test_disconnected_gate_then_local_then_verified_external_return(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);external=root/'external';(external/'live/desk').mkdir(parents=True)
   (external/'live/desk/history').write_text('original external history')
   alias=root/'desk-link';alias.symlink_to(external/'live/desk')
   policy={'volume':str(external),'external_root':str(external),'control':str(root/'control'),
           'limit_bytes':200_000_000_000,'aliases':[{'path':str(alias),'name':'desk'}]}
   with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
   h=module.Host(policy,port);connected=[False]
   def start(host):module.attach_aliases(policy,host.active)
   def wait_for(predicate):
    for _ in range(160):
     if predicate():return
     time.sleep(.1)
    self.fail('Storage transition timed out: '+json.dumps(h.state()))
   def request(path,body=None,origin=None):
    headers={'Content-Type':'application/json'}
    if origin:headers['Origin']=origin
    req=Request('http://127.0.0.1:'+str(port)+path,data=json.dumps(body).encode() if body is not None else None,headers=headers)
    with urlopen(req,timeout=2) as r:return json.load(r)
   with patch.object(module,'drive_ready',side_effect=lambda p:connected[0]),patch.object(module.Host,'start_apps',start):
    worker=threading.Thread(target=h.run);worker.start()
    try:
     wait_for(lambda:h.gate is not None)
     self.assertEqual(request('/api/storage/status')['mode'],'WAITING')
     with self.assertRaises(HTTPError) as err:request('/api/state')
     self.assertEqual(err.exception.code,503)
     with self.assertRaises(HTTPError):request('/api/storage/continue-local',{},'http://evil.example')
     request('/api/storage/continue-local',{},'http://127.0.0.1:'+str(port))
     wait_for(lambda:h.mode=='LOCAL_TEMPORARY' and alias.resolve()!=(external/'live/desk').resolve())
     (alias/'offline-record').write_text('temporary work')
     connected[0]=True
     self.assertTrue(h.state()['can_return']);h.return_external.touch()
     wait_for(lambda:h.mode=='EXTERNAL' and alias.resolve()==(external/'live/desk').resolve())
     self.assertEqual((alias/'history').read_text(),'original external history')
     self.assertFalse((alias/'offline-record').exists())
     archives=list((external/'offline-sessions').glob('*/desk/offline-record'))
     self.assertEqual(len(archives),1);self.assertEqual(archives[0].read_text(),'temporary work')
    finally:h.quit.set();worker.join(timeout=5)
    self.assertFalse(worker.is_alive())

if __name__=='__main__':unittest.main()
