export function createPineErrors({host=document.body,reload=()=>location.reload()}={}){
 const errors=new Map(),root=document.createElement('aside');root.className='pine-runtime-errors';root.setAttribute('aria-label','Indicator errors');root.setAttribute('role','alert');root.hidden=true;host.append(root);
 function update({id,source,error}){
  if(id?.startsWith('pine-test-')||(!error&&!errors.has(id)))return;
  if(error)errors.set(id,{title:source?.match(/indicator\s*\(\s*["']([^"']+)/)?.[1]||'Pine indicator',message:error.message||String(error)});else errors.delete(id);
  root.replaceChildren();root.hidden=errors.size===0;
  for(const {title,message} of errors.values()){const row=document.createElement('p'),name=document.createElement('strong'),detail=document.createElement('span');name.textContent=title+' — ';detail.textContent=message;row.append(name,detail);root.append(row);}
  if(errors.size){const retry=document.createElement('button');retry.type='button';retry.textContent='Reload chart to retry';retry.onclick=reload;root.append(retry);const dismiss=document.createElement('button');dismiss.type='button';dismiss.textContent='Dismiss';dismiss.onclick=()=>{errors.clear();root.replaceChildren();root.hidden=true;};root.append(dismiss);}
 }
 return {update,root};
}
