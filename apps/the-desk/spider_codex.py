"""Local Codex app-server JSON-RPC transport. No generic command/tool endpoint.

Uses the trader's existing CLI authentication. Tokens are never read or sent to
browser clients. Native shell, browser, apps, plugins, MCP and agent tools are
explicitly disabled for this analyst process; live web search remains enabled.
"""
from __future__ import annotations
import json
import os
from pathlib import Path
import queue
import shutil
import subprocess
import threading
import time
import re
try:
    import tomllib
except ImportError:
    tomllib=None

class CodexError(RuntimeError):pass

class CodexSession:
    def __init__(self, cwd, on_event=lambda *a:None, web_search='live', service_name='the-desk-spider'):
        self.cwd=str(cwd);self.on_event=on_event;self.proc=None;self.pending={};self.sequence=0
        if web_search not in ('live','disabled'):raise ValueError('Invalid research web mode')
        self.web_search=web_search;self.service_name=service_name
        self.lock=threading.RLock();self.start_lock=threading.Lock();self.write_lock=threading.Lock();self.thread_id=None
        self.finished=threading.Event();self.turn=None;self.stream_text=False;self.messages={};self.searches=[];self.failure=None

    def start(self):
        with self.start_lock:
            if self.proc and self.proc.poll() is None:return
            executable=os.environ.get('DESK_CODEX_BIN') or shutil.which('codex') or str(Path.home()/'.local/bin/codex')
            command=[executable,'app-server']
            overrides={'web_search':self.web_search,'features.shell_tool':False,'features.apps':False,
              'features.plugins':False,'features.browser_use':False,'features.computer_use':False,
              'features.multi_agent':False,'features.multi_agent_v2':False,'features.memories':False,
              'features.hooks':False,'features.image_generation':False}
            if os.environ.get('DESK_CODEX_STATE_DIR'):
                state=Path(os.environ['DESK_CODEX_STATE_DIR']);state.mkdir(parents=True,exist_ok=True);(state/'logs').mkdir(exist_ok=True)
                overrides.update(log_dir=str(state/'logs'))
            # Config is inspected only for server names, never authentication values.
            config=Path(os.environ.get('CODEX_HOME',str(Path.home()/'.codex')))/'config.toml'
            if config.exists():
                if tomllib:
                    with config.open('rb') as f:names=tomllib.load(f).get('mcp_servers',{}).keys()
                else:
                    names=[m.strip('\"') for m in re.findall(r'^\s*\[mcp_servers\.("[^"]+"|[^.\]\s]+)\s*\]',config.read_text(),re.M)]
                for name in names:
                    if not re.fullmatch(r'[A-Za-z0-9_-]+',name):raise CodexError('Unsupported MCP server name in local Codex config; isolate or rename it before connecting Spider.')
                    overrides['mcp_servers.'+name+'.enabled']=False
            for key,value in overrides.items():command+=['-c',key+'='+json.dumps(value)]
            try:self.proc=subprocess.Popen(command,cwd=self.cwd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,bufsize=1,start_new_session=True)
            except OSError as e:raise CodexError('Codex CLI unavailable. Install Codex CLI and sign in using codex login.') from e
            threading.Thread(target=self._read,daemon=True).start()
            self.request('initialize',{'clientInfo':{'name':'the_desk_spider','title':'The Desk · Spider','version':'1.0'},'capabilities':{'experimentalApi':True}},timeout=30)
            self.send({'method':'initialized','params':{}})

    def send(self,value):
        with self.write_lock:
            if not self.proc or self.proc.poll() is not None:raise CodexError('Codex process disconnected. Reconnect Spider.')
            self.proc.stdin.write(json.dumps(value,separators=(',',':'))+'\n');self.proc.stdin.flush()

    def request(self,method,params,timeout=35):
        with self.lock:
            self.sequence+=1;i=self.sequence;result=queue.Queue();self.pending[i]=result
        try:
            self.send({'id':i,'method':method,'params':params})
            try:message=result.get(timeout=timeout)
            except queue.Empty:raise CodexError('Codex '+method+' timed out. Reconnect and retry.')
            if 'error'in message:raise CodexError(str(message['error'].get('message','Codex request failed'))[:800])
            return message.get('result',{})
        finally:
            with self.lock:self.pending.pop(i,None)

    def _read(self):
        try:
            for line in self.proc.stdout:
                try:message=json.loads(line)
                except ValueError:continue
                if 'id'in message and 'method'not in message:
                    with self.lock:q=self.pending.get(message['id'])
                    if q:q.put(message)
                    continue
                method=message.get('method','');p=message.get('params',{})
                # No tool call or permission request is forwarded to the host.
                if 'id'in message:
                    self.send({'id':message['id'],'error':{'code':-32601,'message':'Spider supports read-only built-in web research only. Host tools are unavailable.'}})
                    self.on_event('blocked-tool',{'method':method});continue
                if method=='item/agentMessage/delta':

                    if self.stream_text:self.on_event('delta',{'text':p.get('delta',''),'itemId':p.get('itemId')})
                    continue
                if method=='item/completed':
                    item=p.get('item',{});kind=item.get('type')
                    if kind=='agentMessage':self.messages[item['id']]=item.get('text','')
                    if kind=='webSearch':self.searches.append(item);self.on_event('search',{'action':item.get('action')or{'query':item.get('query','')},'status':'completed'})
                if method=='turn/completed':
                    turn=p.get('turn',{});self.turn=turn
                    if turn.get('status')!='completed':self.failure=turn.get('error',{}).get('message') if isinstance(turn.get('error'),dict) else turn.get('status')
                    self.finished.set()
                if method in ('error','account/login/completed','account/updated'):
                    self.on_event(method,{k:v for k,v in p.items() if k in ('message','success','error','authMode')})
        finally:
            self.failure='Codex process disconnected.';self.finished.set()
            with self.lock:
                for q in self.pending.values():q.put({'error':{'message':self.failure}})

    def account(self):
        self.start();data=self.request('account/read',{'refreshToken':False});a=data.get('account')
        return {'connected':bool(a),'type':a.get('type') if a else None,'requiresOpenaiAuth':data.get('requiresOpenaiAuth',True)}

    def login(self):
        self.start();data=self.request('account/login/start',{'type':'chatgptDeviceCode'})
        return {k:data[k] for k in ('type','loginId','verificationUrl','userCode') if k in data}

    def ensure_thread(self,instructions):
        self.start()
        if not self.thread_id:
            data=self.request('thread/start',{'cwd':self.cwd,'sandbox':'read-only','approvalPolicy':'never','environments':[],
              'ephemeral':bool(os.environ.get('DESK_CODEX_STATE_DIR')),
              'config':{'web_search':self.web_search,'model_reasoning_effort':'medium'},'baseInstructions':instructions,'serviceName':self.service_name})
            self.thread_id=data['thread']['id']
        return self.thread_id

    def run(self,prompt,schema=None,timeout=600,cancel=None):
        self.stream_text=schema is None;self.finished.clear();self.messages={};self.searches=[];self.failure=None;self.turn=None
        p={'threadId':self.thread_id,'input':[{'type':'text','text':prompt}],'environments':[]}
        if schema:p['outputSchema']=schema
        result=self.request('turn/start',p);turn_id=result['turn']['id']
        deadline=time.monotonic()+timeout
        while not self.finished.wait(.25):
            if (cancel and cancel.is_set()) or time.monotonic()>deadline:
                self.request('turn/interrupt',{'threadId':self.thread_id,'turnId':turn_id},timeout=10)
                if not self.finished.wait(10):self.close()
                raise CodexError('Spider run cancelled.' if cancel and cancel.is_set() else 'Spider analysis exceeded ten minutes. Retry manually.')
        if self.failure:raise CodexError(str(self.failure))
        text=next(reversed(self.messages.values()),'')
        if not text:
            for item in (self.turn or {}).get('items',[]):
                if item.get('type')=='agentMessage':text=item.get('text','')
        if not text:raise CodexError('Codex completed without a final answer.')
        return (json.loads(text) if schema else text),list(self.searches)

    def close(self):
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()
            try:self.proc.wait(timeout=3)
            except subprocess.TimeoutExpired:self.proc.kill()
        self.thread_id=None;self.proc=None
