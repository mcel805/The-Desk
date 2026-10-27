// Explicit offline audit of saved Desk observations. No provider/model requests.
import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';import path from 'node:path';import {createHash} from 'node:crypto';
import {normalize,label,fit} from '../../../indicators/agentic-swing-tracker-v1.3/reversal-study.mjs';
export function auditWarningExport(data){
 const runs=new Map((data.runs||[]).map(r=>[r.id,r])),seen=new Set(),groups=new Map(),skipped={unavailable:0,duplicates:0,missingRun:0,warmup:0};
 const predictions=(data.predictions||[]).map(r=>({...r,state:typeof r.state==='string'?JSON.parse(r.state):r.state})).sort((a,b)=>a.at-b.at);
 const sourceBars=new Map();
 for(const r of data.run_bars||[]){const b=typeof r.payload==='string'?JSON.parse(r.payload):r.payload;const rows=sourceBars.get(r.run)||[];rows.push({...b,warmup:r.warmup===1||r.warmup===true});sourceBars.set(r.run,rows);}
 for(const rows of sourceBars.values())rows.sort((a,b)=>a.time-b.time);
 for(const row of predictions){
  const raw=row.state?.swing_warnings?.closed;
  if(!raw){skipped.unavailable++;continue;}
  const run=runs.get(row.run);if(!run||raw.symbol!==row.symbol||run.symbol!==row.symbol){skipped.missingRun++;continue;}
  let o;try{o=normalize(raw);}catch{skipped.unavailable++;continue;}
  if(o.provisional||o.observedAt>row.at||o.closedCutoff>row.at){skipped.unavailable++;continue;}
  if((sourceBars.get(row.run)||[]).some(b=>b.time+60000===o.closedCutoff&&b.warmup)){skipped.warmup++;continue;}
  // Deduplicate the closed cutoff across sampling slots. Keep the FIRST receipt.
  const key=[o.symbol,o.featureConfig,o.closedCutoff].join('|');
  if(seen.has(key)){skipped.duplicates++;continue;}seen.add(key);
  const cohort=createHash('sha256').update(o.symbol+'|'+o.featureConfig).digest('hex');
  const group=groups.get(cohort)||{cohort,symbol:o.symbol,featureConfig:o.featureConfig,observations:[]};
  // Warmup measurements have no owned live receipt. Freeze the first saved
  // forward sample's receipt; outcome eligibility begins after that receipt.
  o={...o,observedAt:row.at,recordedClosedAt:o.observedAt,run:row.run};
  group.observations.push(label(o,sourceBars.get(row.run)||[]));groups.set(cohort,group);
 }
 return {version:'desk-warning-audit.1',scope:'Recorded first closed observations only. Source bars stay within the same run. No paid calls or automatic parameter promotion.',skipped,
  cohorts:[...groups.values()].map(g=>({...g,observations:g.observations,model:fit(g.observations)}))};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 try{const [input,output]=process.argv.slice(2);if(!input)throw Error('Usage: node scripts/score-swing-warnings.mjs <Desk export.json> [report.json]');const report=auditWarningExport(JSON.parse(await fs.readFile(input,'utf8')));const text=JSON.stringify(report,null,2)+'\n';if(output)await fs.writeFile(output,text);else process.stdout.write(text);}catch(e){process.stderr.write(e.message+'\n');process.exitCode=1;}
}
