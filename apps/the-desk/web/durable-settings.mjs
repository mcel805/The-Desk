// One ordered save queue per tab, revision checks across tabs, retained local drafts.
const clone=v=>JSON.parse(JSON.stringify(v));
export class DurableSettings {
 constructor({read,write,prepare=async v=>v,onState=()=>{},onPending=()=>{},onCommit=()=>{},storage=globalThis.localStorage,writer=globalThis.crypto?.randomUUID?.()||String(Date.now()),schedule=setTimeout,cancel=clearTimeout}){
  Object.assign(this,{read,write,prepare,onState,onPending,onCommit,storage,writer,schedule,cancel});
  this.key='the-desk.unsaved-settings.'+writer;this.pending={};this.expected={};this.revisions={};this.waiters=[];this.busy=false;this.conflict=false;this.timer=null;this.attempt=0;
 }
 persist(){
  try{if(Object.keys(this.pending).length)this.storage?.setItem(this.key,JSON.stringify({values:this.pending,expected:this.expected,at:Date.now()}));else this.storage?.removeItem(this.key);this.local=true;}
  catch{this.local=false;}
 }
 state(state,error=null){this.onState({state,error,local:this.local,pending:Object.keys(this.pending).length});}
 async load(){
  const server=await this.read();this.serverValues=clone(server.values);this.revisions={...server.revisions};let draft;
  try{draft=JSON.parse(this.storage?.getItem(this.key)||'null');}catch{}
  if(draft?.values&&draft?.expected){
   this.pending=clone(draft.values);this.expected={...draft.expected};
   // A response may have been lost after a successful commit; identical values are already saved.
   for(const k of Object.keys(this.pending))if(JSON.stringify(server.values[k])===JSON.stringify(this.pending[k])){delete this.pending[k];delete this.expected[k];}
   // A replacement build may start with a new settings database. There is no
   // server value to conflict with, so seed it from the retained local draft.
   for(const k of Object.keys(this.pending))if(!(k in server.values)&&!this.revisions[k])this.expected[k]=0;
   this.conflict=Object.keys(this.pending).some(k=>this.expected[k]!==this.revisions[k]&&!(this.expected[k]===0&&this.revisions[k]==null));
   this.persist();this.state(this.conflict?'conflict':'recovered');
  }
  return {...server.values,...clone(this.pending)};
 }
 save(values,{force=false}={}){
  if(force)return this.force(values);
  this.blocked=false;
  for(const [k,v] of Object.entries(clone(values))){if(!(k in this.pending))this.expected[k]=this.revisions[k]||0;this.pending[k]=v;}
  this.onPending(clone(this.pending),{...this.expected});
  this.persist();
  const promise=new Promise((resolve,reject)=>this.waiters.push({resolve,reject}));
  if(this.conflict){this.state('conflict');this.reject(Error('Settings changed in another tab. Local changes are retained; use Save layout after reviewing.'));}
  else void this.drain();
  return promise;
 }
 reject(error){for(const w of this.waiters.splice(0))w.reject(error);}
 async force(values){
  // An explicit save may replace newer settings after the user reviews this tab.
  if(this.busy)await new Promise(resolve=>this.waiters.push({resolve,reject:resolve}));
  const server=await this.read();this.revisions={...server.revisions};this.conflict=false;
  for(const k of Object.keys(this.pending))this.expected[k]=this.revisions[k]||0;
  return this.save(values);
 }
 async drain(){
  if(this.busy||this.conflict||this.blocked||!Object.keys(this.pending).length)return;
  this.busy=true;if(this.timer){this.cancel(this.timer);this.timer=null;}this.state('saving');
  const sent=clone(this.pending),expected=Object.fromEntries(Object.keys(sent).map(k=>[k,this.expected[k]||0]));
  try{
   const values=await this.prepare(clone(sent));const result=await this.write({values,expected,writer:this.writer});
   if(result.saved!==true)throw Error('Server did not acknowledge the save');
   this.revisions={...this.revisions,...result.revisions};this.onCommit(values,result);
   for(const k of Object.keys(sent)){
    if(JSON.stringify(this.pending[k])===JSON.stringify(sent[k])){delete this.pending[k];delete this.expected[k];}
    else if(k in this.pending)this.expected[k]=this.revisions[k]||0;
   }
   this.attempt=0;this.persist();
   if(!Object.keys(this.pending).length){this.state('saved');for(const w of this.waiters.splice(0))w.resolve(result);}
  }catch(error){
   this.conflict=error.status===409;this.state(this.conflict?'conflict':error.status>=400&&error.status<500?'failed':'retrying',error.message);this.persist();
   if(this.conflict||(error.status>=400&&error.status<500)){this.blocked=true;this.reject(error);}
   else this.timer=this.schedule(()=>{this.timer=null;void this.drain();},Math.min(30000,500*2**this.attempt++));
  }finally{
   this.busy=false;
   if(!this.timer&&!this.conflict&&!this.blocked&&Object.keys(this.pending).length&&this.attempt===0)void this.drain();
  }
 }
 resume(){if(!this.conflict)void this.drain();}
 close(){if(this.timer)this.cancel(this.timer);this.persist();}
}
