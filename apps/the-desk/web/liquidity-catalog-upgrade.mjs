// Upgrade only exact, known Desk catalog releases. Edited sources remain user-owned.
const known=new Set([
 '0420b929eb883c681a02c1b6d19eed8ca17e7a6c5aebd89085dac1117fb28ac4',
 '9406c000e7f2801c97040568207642fbb1f12b057193326fa9a1bf8413f4bc46',
 'a990bbdc6d05a1111b29e5532d51b36665d378acc4f1a2ddfaa6f107f8d80647',
 '90d0a0567bf2ed989fb97e54e09870407d04a8e3eeb36a224a615e78b893c7f8',
 'c7c12a6833001a4caa17a73a0c296762f5dd5a71331a474b2a430ecefd6ee03b',
 '96b6036bc99a5e0674d98993b35fad97a1057111a8a0db3fd7d5afc72a049528',
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
