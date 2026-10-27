async () => {
 if(location.hostname!=='127.0.0.1'||location.pathname!=='/')throw Error('Local Desk trading page required');
 const {refreshStorageNotice}=await import('/storage-notice.mjs');
 const assert=(condition,message)=>{if(!condition)throw Error(message);};
 const geometry=()=>{
  const box=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {top:r.top,height:r.height,bottom:r.bottom};};
  return {header:box('.desk-header'),account:box('.account-strip'),main:box('.desk-main'),workspace:box('#workspace'),footer:box('footer')};
 };
 const fetchOriginal=window.fetch;
 const real=await fetchOriginal('/api/storage/status').then(r=>r.json());
 const snapshots=[];
 try {
  for(const mode of ['EXTERNAL','WAITING','LOCAL_TEMPORARY','EXTERNAL']){
   window.fetch=(url,...args)=>url==='/api/storage/status'?Promise.resolve(new Response(JSON.stringify({
    ...real,mode,message:'Synthetic disconnected storage warning',can_return:mode==='LOCAL_TEMPORARY'
   }),{headers:{'Content-Type':'application/json'}})):fetchOriginal(url,...args);
   await refreshStorageNotice();
   const notice=document.getElementById('storageNotice');
   const current=geometry();
   assert(current.header.top===0,'Header begins at top of viewport');
   assert(Math.abs(current.account.top-current.header.bottom)<1,'Account strip follows header');
   assert(Math.abs(current.main.top-current.account.bottom)<1,'Chart follows account strip');
   assert(current.workspace.height>150,'Chart has usable height');
   assert(current.footer.bottom<=innerHeight+1,'Footer stays inside viewport');
   assert(notice.parentElement===document.querySelector('.desk-header'),'Notice is nested inside header');
   if(mode!=='EXTERNAL')assert(getComputedStyle(notice).position==='fixed','Warning remains outside grid flow');
   if(mode==='WAITING')assert([...notice.querySelectorAll('button')].some(b=>b.textContent.includes('temporary local')),'Disconnected notice offers temporary workspace');
   if(mode==='LOCAL_TEMPORARY')assert([...notice.querySelectorAll('button')].some(b=>b.textContent.includes('return to USB')),'Reconnected notice offers archive and return');
   if(snapshots.length)assert(JSON.stringify(current)===JSON.stringify(snapshots[0].geometry),'Storage states cannot shift chart rows');
   snapshots.push({mode,geometry:current});
  }
  return {passed:true,viewport:[innerWidth,innerHeight],snapshots};
 } finally {window.fetch=fetchOriginal;await refreshStorageNotice();}
}
