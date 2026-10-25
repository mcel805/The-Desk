// One storage notice across Desk pages; no credentials or broker data.
let notice;
async function refreshStorageNotice(){
 try {
  const response=await fetch('/api/storage/status');if(!response.ok)return;
  const state=await response.json();if(state.mode==='UNMANAGED')return;
  if(!notice){notice=document.createElement('aside');notice.setAttribute('role','status');
   notice.style.cssText='position:relative;z-index:100;padding:10px 24px;background:#22304a;color:#eef3ff;font:13px system-ui;border-bottom:1px solid #54709a';
   document.body.prepend(notice);}
  notice.replaceChildren();
  const label=document.createElement('span');
  label.textContent=state.mode==='EXTERNAL'?`SAMSUNG USB · External storage active · ${(state.used_bytes/1e9).toFixed(2)} / ${(state.limit_bytes/1e9).toFixed(0)} GB. `:state.message+' ';
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
