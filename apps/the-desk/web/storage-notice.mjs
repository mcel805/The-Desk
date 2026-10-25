// One storage notice across Desk pages; no credentials or broker data.
let notice,inlineNotice=false;
export async function refreshStorageNotice(){
 try {
  const response=await fetch('/api/storage/status');if(!response.ok)return;
  const state=await response.json();if(state.mode==='UNMANAGED')return;
  if(!notice){notice=document.createElement('aside');notice.setAttribute('role','status');
   notice.id='storageNotice';
   notice.style.cssText='display:flex;align-items:center;gap:8px;flex:none;max-width:100%;font:11px/1.4 system-ui;color:var(--muted,#a8b1c4)';
   const header=document.querySelector('.desk-header');
   if(header){header.append(notice);inlineNotice=true;}
   else{notice.style.cssText+=';position:fixed;bottom:30px;right:10px;z-index:100;background:var(--surface,#22304a);padding:8px 12px;border:1px solid var(--line,#54709a);border-radius:5px;max-width:min(520px,calc(100vw - 20px))';document.body.append(notice);}}
  notice.style.position=state.mode==='EXTERNAL'&&inlineNotice?'':'fixed';
  notice.style.bottom=state.mode==='EXTERNAL'&&inlineNotice?'':'30px';
  notice.style.right=state.mode==='EXTERNAL'&&inlineNotice?'':'10px';
  notice.style.zIndex=state.mode==='EXTERNAL'&&inlineNotice?'':'100';
  notice.style.background=state.mode==='EXTERNAL'&&inlineNotice?'':'var(--surface,#22304a)';
  notice.style.padding=state.mode==='EXTERNAL'&&inlineNotice?'':'10px 14px';
  notice.style.flexWrap=state.mode==='EXTERNAL'?'nowrap':'wrap';
  notice.replaceChildren();
  const label=document.createElement('span');
  label.textContent=state.mode==='EXTERNAL'?`USB · ${(state.used_bytes/1e9).toFixed(2)} / ${(state.limit_bytes/1e9).toFixed(0)} GB`:state.message+' ';
  notice.title=state.mode==='EXTERNAL'?'SAMSUNG USB · External storage active':state.message;
  notice.append(label);
  if(state.offline_archives?.length){const saved=document.createElement('span');saved.textContent=`${state.offline_archives.length} temporary workspace(s) preserved separately on the USB. `;saved.title=state.offline_archives.join('\n');notice.append(saved);}
  if(state.mode==='WAITING'){
   const local=document.createElement('button');local.textContent='Continue with temporary local storage';
   local.onclick=async()=>{local.disabled=true;try{const r=await fetch('/api/storage/continue-local',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const result=await r.json();if(!r.ok)throw Error(result.error);setTimeout(()=>location.reload(),8000);}catch(e){label.textContent=e.message;local.disabled=false;}};
   notice.append(local);
  }
  if(state.can_return){const button=document.createElement('button');button.textContent='Save temporary work & return to USB';
   button.onclick=async()=>{button.disabled=true;button.textContent='Preserving temporary workspace…';
    try{const r=await fetch('/api/storage/return-external',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!r.ok)throw Error();
     setTimeout(()=>location.reload(),8000);}catch{button.disabled=false;button.textContent='Switch unavailable — retry';}};
   notice.append(button);}
 }catch{}
}
void refreshStorageNotice();setInterval(refreshStorageNotice,5000);
