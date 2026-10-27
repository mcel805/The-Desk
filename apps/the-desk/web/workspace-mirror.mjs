const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);

export class WorkspaceMirror {
 constructor({storage=globalThis.localStorage,key='the-desk.workspace.mirror.v1',now=Date.now}={}){
  Object.assign(this,{storage,key,now});
 }
 read(){
  try{
   const value=JSON.parse(this.storage?.getItem(this.key)||'null');
   return value?.version===1&&value.workspace&&typeof value.workspace==='object'?value:null;
  }catch{return null;}
 }
 write(value){
  try{this.storage?.setItem(this.key,JSON.stringify(value));return true;}catch{return false;}
 }
 capture(workspace,revision=0){
  if(!workspace||typeof workspace!=='object')return false;
  const previous=this.read(),baseRevision=previous?.pending?previous.baseRevision:Number(revision||0);
  return this.write({version:1,workspace:clone(workspace),pending:true,baseRevision,updatedAt:this.now()});
 }
 acceptServer(workspace,revision=0){
  if(!workspace||typeof workspace!=='object')return false;
  return this.write({version:1,workspace:clone(workspace),pending:false,baseRevision:Number(revision||0),updatedAt:this.now()});
 }
 acknowledge(workspace,revision=0){
  if(!workspace||typeof workspace!=='object')return false;
  const previous=this.read();
  if(previous?.pending&&!same(previous.workspace,workspace))return false;
  return this.acceptServer(workspace,revision);
 }
 reconcile({serverWorkspace,serverRevision=0,pendingWorkspace}={}){
  const revision=Number(serverRevision||0);
  if(pendingWorkspace&&typeof pendingWorkspace==='object'){
   this.capture(pendingWorkspace,revision);
   return {workspace:clone(pendingWorkspace),recover:false,source:'pending'};
  }
  const saved=this.read();
  if(saved?.pending){
   if(same(saved.workspace,serverWorkspace)){
    this.acknowledge(serverWorkspace,revision);
    return {workspace:clone(serverWorkspace),recover:false,source:'server'};
   }
   if(serverWorkspace===undefined||revision<=Number(saved.baseRevision||0)){
    return {workspace:clone(saved.workspace),recover:true,source:'mirror'};
   }
  }
  if(serverWorkspace&&typeof serverWorkspace==='object'){
   this.acceptServer(serverWorkspace,revision);
   return {workspace:clone(serverWorkspace),recover:false,source:'server'};
  }
  if(saved?.workspace)return {workspace:clone(saved.workspace),recover:true,source:'mirror'};
  return {workspace:undefined,recover:false,source:'default'};
 }
}
