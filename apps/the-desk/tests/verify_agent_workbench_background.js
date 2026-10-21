async () => {
 if(location.origin!=='http://127.0.0.1:18891'||location.pathname!=='/')throw Error('Synthetic Trader origin required');
 const get=async path=>{const r=await fetch(path);if(!r.ok)throw Error('HTTP '+r.status);return r.json();};
 if((await get('/api/health')).market_stream!=='SYNTHETIC AGENT WORKSPACE FIXTURE')throw Error('Synthetic marker required');
 const saved=JSON.parse(sessionStorage.getItem('agent-workbench-qa')||'null');if(!saved)throw Error('Run creation acceptance first');
 const assert=(v,m)=>{if(!v)throw Error(m);},wait=async(fn,label)=>{const end=Date.now()+30000;while(Date.now()<end){const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,200));}throw Error('Timeout '+label);};
 const select=await wait(()=>document.getElementById('accountSelect')?.options.length?document.getElementById('accountSelect'):null,'manual account menu');
 for(const account of saved.accounts)assert(![...select.options].some(o=>o.value===account),'agent account excluded from manual trader');
 const before=(await get('/api/state')).positions.length;
 const details=await wait(async()=>{const ds=await Promise.all(saved.ids.map(id=>get('/api/agents/detail?id='+id)));return ds.every(d=>d.runs.some(r=>r.order_id))?ds:null;},'both agents trade while Trader is visible');
 const checks=[...saved.checks,'dedicated agent accounts excluded from manual Trader','two agents submitted attributed orders with no Agent chart page open'];
 for(const [i,d] of details.entries()){
  assert(d.orders.every(o=>o.account_id===saved.accounts[i]),'owned account routing');assert(d.runs.every(r=>r.payload.chart.authority==='independent-agent-runtime'),'independent source evidence');assert(d.agent.metrics.fills>=1,'actual simulated fills');
  const chart=await wait(async()=>{const c=await get('/api/agents/chart-data?id='+d.agent.id);return c.bars.length>=200?c:null;},'server history persists without chart view');assert(chart.revision===d.agent.revision,'chart history matches published version');
  await fetch('/api/agents/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:d.agent.id,revision:d.agent.revision,action:'pause'})});
 }
 assert((await get('/api/state')).positions.length===before,'manual account positions untouched');checks.push('manual account remains independent and agent data jobs continue');
 const final=await wait(async()=>{const ds=await Promise.all(saved.ids.map(id=>get('/api/agents/detail?id='+id)));return ds.every(d=>d.agent.metrics.closedTrades>=1)?ds:null;},'protective exits reconcile');
 assert(final.every(d=>d.agent.state==='paused'),'paused after test');assert(final.every(d=>d.runs.filter(r=>r.order_id).length===1),'dedup per line/session');checks.push('protective exits and measured performance reconcile after pause');
 sessionStorage.setItem('agent-workbench-result',JSON.stringify({checks,agents:final.map(d=>({id:d.agent.id,version:d.agent.revision,runs:d.runs.length,closedTrades:d.agent.metrics.closedTrades,journal:d.agent.workspace.journal}))}));
 return {checks,synthetic:true,agents:final.map(d=>({name:d.agent.name,state:d.agent.state,version:d.agent.revision,closedTrades:d.agent.metrics.closedTrades,fees:d.agent.metrics.fees}))};
}
