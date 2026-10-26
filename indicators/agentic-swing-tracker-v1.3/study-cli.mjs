import fs from 'node:fs/promises';
import {label,fit,predict,normalize} from './reversal-study.mjs';
const [command,...paths]=process.argv.slice(2);
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
try{
  let result;
  if(command==='label'&&paths.length===2){const observations=await read(paths[0]),bars=await read(paths[1]);result=observations.map(o=>label(o,bars));}
  else if(command==='fit'&&paths.length===1)result=fit(await read(paths[0]));
  else if(command==='predict'&&paths.length===2)result=predict(await read(paths[0]),await read(paths[1]));
  else if(command==='normalize'&&paths.length===1){const content=await fs.readFile(paths[0],'utf8'),seen=new Set();result=[];for(const line of content.split('\n').filter(x=>x.trim())){const raw=JSON.parse(line);for(const item of [raw,raw.closed_observation].filter(Boolean)){const o=normalize(item),key=o.symbol+'|'+(o.provisional?'live|'+o.observedAt:'closed|'+o.closedCutoff);if(!seen.has(key)){seen.add(key);result.push(o);}}}}
  else throw Error('Usage: node study-cli.mjs normalize alerts.ndjson | label observations.json bars.json | fit labeled.json | predict model.json observation.json');
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}catch(e){process.stderr.write(e.message+'\n');process.exitCode=1;}
