// Hydrate settings independently of history, costs and audit rendering.
export function settingsController({form,market,request,onState,onMessage,storage=globalThis.localStorage}){
 let ready=false,dirty=false,revision=null,pending=null,pendingMarket=null,boundMarket=null,baseWarnings=null;
 const fields=()=>[...form.elements].filter(e=>e.name);
 function fill(config){baseWarnings=config.warning_settings?structuredClone(config.warning_settings):null;for(const e of fields()){const value=e.name.split('.').reduce((v,k)=>v?.[k],config);if(value===undefined)throw Error('Incomplete server setting: '+e.name);if(e.type==='checkbox')e.checked=!!value;else e.value=value??'';}}
 function values(){const cfg={};for(const e of fields()){
  const value=e.type==='checkbox'?e.checked:['target_mode','manual_bias','study_playbook','study_phase'].includes(e.name)?e.value:e.name==='study_cost_bps'&&e.value.trim()===''?null:Number(e.value);
  if(e.name.startsWith('warning_settings.')){
   cfg.warning_settings??=structuredClone(baseWarnings||{});
   const keys=e.name.split('.').slice(1);let target=cfg.warning_settings;
   for(const k of keys.slice(0,-1))target=target[k];target[keys.at(-1)]=value;
  }else cfg[e.name]=value;
 }return cfg;}

 function remember(config){try{storage?.setItem('desk.swing.settings.'+market(),JSON.stringify(config));}catch{}}
 function preview(){ready=false;dirty=false;revision=null;boundMarket=market();
  for(const e of fields())e.disabled=true;
  try{const raw=storage?.getItem('desk.swing.settings.'+market());if(raw)fill(JSON.parse(raw));}catch{}
  onMessage('Syncing saved settings… You can press Start; it will wait for the complete configuration.');
 }
 async function load(){const selected=market();if(pending){await pending;if(selected!==pendingMarket)return load();return;}pendingMarket=selected;
  pending=(async()=>{try{const state=await request('/api/swing/settings');if(selected!==market())return;
   const s=state.symbols[selected];if(!s?.config||!s.revision)throw Error('Settings unavailable');
   if(!dirty||boundMarket!==selected){fill(s.config);remember(s.config);revision=s.revision;}
   boundMarket=selected;ready=true;for(const e of fields())e.disabled=false;
   onState(state);onMessage(dirty?'Manual edits ready · Start freezes these edits.':'Saved settings ready · Start freezes a new measured run.');
  }catch(e){ready=false;onMessage('Settings sync failed · '+e.message+'. Press Start to retry; blank values will never be submitted.');throw e;}
  finally{pending=null;}})();return pending;
 }
 async function submitStart(action,enable=false){await load();if(!ready||boundMarket!==market())throw Error('Settings still syncing. Try again.');
  if(!form.reportValidity())throw Error('Check the highlighted setting.');
  const config=values();if(enable)config.jev_enabled=true;
  const result=await request('/api/swing/control',{action,symbol:market(),config,expected_revision:revision});dirty=false;return result;
 }
 form.addEventListener('input',()=>{if(ready)dirty=true;});form.addEventListener('change',()=>{if(ready)dirty=true;});
 preview();return {load,start:enable=>submitStart('start',enable),startAutomatic:enable=>submitStart('start_auto',enable),values,preview,markDirty:()=>{if(ready)dirty=true;},get ready(){return ready;},get dirty(){return dirty;}};
}
