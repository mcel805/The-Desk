import {MARKET_GEOMETRY_CATALOG_ORIGIN} from './market-geometry-origin.mjs';
// Exact-release migration; keep the full previous source for rollback and custom inputs.
export const ORIGINAL_GEOMETRY_HASH='0cef7b9b6e5fc250d428e8d3900df017f8ec1145ed60e74033c8a410b74c47c8';
export const PRE_FOCUS_GEOMETRY_HASH='fdb5da809587f9019cd756e32bcdcade9c78756674ca1e0568485301c8ef4325';
const hash=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s.replace(/\r\n/g,'\n'))))].map(v=>v.toString(16).padStart(2,'0')).join('');
async function latest(){const r=await fetch('/pine-examples/agentic-market-geometry-mtf.pine',{cache:'no-store'});if(!r.ok)throw Error('Geometry catalog unavailable');return r.text();}
export async function upgradeGeometryWorkspace(workspace,load=latest){
 if(!Array.isArray(workspace?.charts))return workspace;let result=workspace;
 for(let i=0;i<workspace.charts.length;i++){
  const entries=workspace.charts[i]?.ext?.['desk.pine.v1'];if(!Array.isArray(entries))continue;
  for(let j=0;j<entries.length;j++){
   const entry=entries[j];if(typeof entry?.script!=='string'||!entry.script.includes('indicator("Agentic - Market Geometry"'))continue;
   const release=await hash(entry.script);if(![ORIGINAL_GEOMETRY_HASH,PRE_FOCUS_GEOMETRY_HASH].includes(release))continue;
   const script=await load();if(!script.includes('// Desk MTF Geometry v2.'))throw Error('Unexpected Geometry catalog source');
   if(result===workspace)result=structuredClone(workspace);
   const target=result.charts[i].ext['desk.pine.v1'][j];if(release===ORIGINAL_GEOMETRY_HASH)target.geometryOriginal={script:entry.script,inputs:structuredClone(entry.inputs||{}),version:1};target.deskPineOrigin=MARKET_GEOMETRY_CATALOG_ORIGIN;target.script=script;target.inputs={...target.inputs,geometryMode:release===ORIGINAL_GEOMETRY_HASH?'Context + Micro':target.inputs?.geometryMode||'Context + Micro',geometryPresentation:target.inputs?.geometryPresentation||'Focus'};
  }
 }
 return result;
}
