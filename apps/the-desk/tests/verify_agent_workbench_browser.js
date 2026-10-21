async () => {
 if(location.origin!=='http://127.0.0.1:18891'||location.pathname!=='/agents.html')throw Error('Synthetic fixture origin required');
 const get=async path=>{const r=await fetch(path);if(!r.ok)throw Error('HTTP '+r.status);return r.json();};
 if((await get('/api/health')).market_stream!=='SYNTHETIC AGENT WORKSPACE FIXTURE')throw Error('Synthetic marker required');
 const assert=(v,m)=>{if(!v)throw Error(m);},wait=async(fn,label,ms=25000)=>{const end=Date.now()+ms;while(Date.now()<end){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out: '+label);};
 const checks=[],created=[];
 for(const [name,instrument]of [['SYNTHETIC BTC Agent','hyperliquid:BTC'],['SYNTHETIC ETH Agent','hyperliquid:ETH']]){
  document.getElementById('createAgent').click();await wait(()=>document.getElementById('agForm'),'creation form');
  const form=document.getElementById('agForm');assert(form.querySelectorAll('h3').length>=6,'modular chart setup exists');
  form.elements.name.value=name;form.elements.instrument.value=instrument;form.elements.instrument.dispatchEvent(new Event('change',{bubbles:true}));form.elements.capital.value='2500';form.elements['manual-cyan'].checked=true;form.elements.liquidity.checked=false;
  document.getElementById('agNewLevel').click();form.querySelector('[name=levelPrice]').value='100';form.querySelector('[name=levelLabel]').value='Synthetic cyan';
  form.dispatchEvent(new Event('input',{bubbles:true}));form.requestSubmit();
  const a=await wait(async()=>(await get('/api/agents/state')).agents.find(a=>a.name===name),'created '+name);assert(a.state==='paused'&&a.runCount===0,'starts paused and untraded');assert(a.workspace.exclusive,'dedicated account');assert(a.chart.levels[0].price==='100','published cyan price');created.push(a);
  await wait(()=>document.getElementById('agentsWorkspace').getAttribute('aria-busy')==='false','modal idle');document.getElementById('agClose').click();
 }
 assert(created[0].account.id!==created[1].account.id,'separate accounts');assert(created[0].workspace.chart_id!==created[1].workspace.chart_id,'separate assigned charts');assert(created[0].workspace.journal_id!==created[1].workspace.journal_id,'separate journals');checks.push('UI creation provisions distinct chart account and journal for each agent');
 for(const a of created)await wait(()=>document.querySelector(`[data-agent-id="${a.id}"] canvas`),'actual Vela chart');checks.push('two assigned native charts render independent server candles');
 const first=created[0],tile=document.querySelector(`[data-agent-id="${first.id}"]`);tile.querySelector('[data-add-level]').click();await wait(()=>document.getElementById('levelDraftDialog').open,'draft cyan dialog');
 const lf=document.getElementById('levelDraftForm');lf.elements.price.value='99';lf.elements.label.value='Draft only';lf.requestSubmit();
 const draft=await wait(async()=>{const d=await get('/api/agents/detail?id='+first.id);return d.draft?d:null;},'draft persisted');assert(draft.agent.chart.levels.length===1&&draft.draft.config.chart.levels.length===2,'draft cannot mutate published inputs');checks.push('chart cyan level creates isolated draft');
 await wait(()=>document.getElementById('agPublishDraft'),'publish control');await wait(()=>document.getElementById('agentsWorkspace').getAttribute('aria-busy')==='false','draft modal idle');document.getElementById('agPublishDraft').click();
 const published=await wait(async()=>{const d=await get('/api/agents/detail?id='+first.id);return d.agent.revision===2?d:null;},'published v2');assert(published.agent.account.id===first.account.id&&published.agent.workspace.journal_id===first.workspace.journal_id,'publication retains resources');assert(published.agent.state==='paused','published paused');created[0]=published.agent;checks.push('explicit publication creates immutable v2 and retains account journal');
 await wait(()=>document.getElementById('agentsWorkspace').getAttribute('aria-busy')==='false','publication idle');document.getElementById('agClose').click();
 // Establish the away-price phase, then arm through the real chart controls.
 await wait(async()=>{const d=await get('/api/agents/chart-data?id='+first.id);return Number(d.quote?.bid)>100.5;},'away-price phase',20000);
 for(const a of created){const tile=await wait(()=>document.querySelector(`[data-agent-id="${a.id}"]`),'tile');tile.querySelector('[data-arm]').click();await wait(async()=>(await get('/api/agents/detail?id='+a.id)).agent.state==='armed','armed '+a.name);}
 const state=await get('/api/agents/state');sessionStorage.setItem('agent-workbench-qa',JSON.stringify({ids:created.map(a=>a.id),accounts:created.map(a=>a.account.id),armedAt:Date.now(),checks}));
 location.assign('/');return {checks,next:'Trader view while independent agents run',ids:created.map(a=>a.id),armed:state.agents.filter(a=>a.state==='armed').length};
}
