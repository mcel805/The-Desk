// Upgrade only exact, known Desk catalog releases. Edited sources remain user-owned.
const known=new Set([
 '2d9ac8bf5f98cdc1716ed101abfebe6438ed753b5e144ea64db14b3b8ef3a794',
 'ca1bfc8ccb89af71f7cbedac7e2f5f785a021f58e7beb1ba2051ac431c1ebfeb'
]);
const hash=async source=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source.replace(/\r\n/g,'\n')))),x=>x.toString(16).padStart(2,'0')).join('');
let catalog;
async function latest(){
 catalog??=fetch('/pine-examples/agentic-liquidity.pine',{cache:'no-store'}).then(async response=>{
  if(!response.ok)throw Error('Liquidity catalog source unavailable.');
  const source=await response.text();
  if(!source.includes('indicator("Agentic - Liquidity"')||!source.includes('f_reference5Minute()'))throw Error('Unexpected Liquidity catalog source.');
  return source;
 }).catch(error=>{catalog=null;throw error;});
 return catalog;
}
export async function upgradeLiquidityWorkspace(workspace,load=latest){
 if(!workspace||!Array.isArray(workspace.charts))return workspace;
 let result=workspace;
 for(let chart=0;chart<workspace.charts.length;chart++){
  const entries=workspace.charts[chart]?.ext?.['desk.pine.v1'];
  if(!Array.isArray(entries))continue;
  for(let study=0;study<entries.length;study++){
   const source=entries[study]?.script;
   if(typeof source!=='string'||!source.includes('indicator("Agentic - Liquidity"')||!known.has(await hash(source)))continue;
   const script=await load();
   if(result===workspace)result=structuredClone(workspace);
   result.charts[chart].ext['desk.pine.v1'][study].script=script;
  }
 }
 return result;
}
