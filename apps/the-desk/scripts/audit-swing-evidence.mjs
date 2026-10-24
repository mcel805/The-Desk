#!/usr/bin/env node
// Rebuild an audit from a saved raw export. Never calls Jev or changes the ledger.
import fs from 'node:fs/promises';
import {buildSwingEvidence} from '../web/swing-evidence.mjs';
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){
  if(!['--source','--out','--run','--cost-bps'].includes(args[i])||args[i+1]==null)throw Error('Usage: node scripts/audit-swing-evidence.mjs --source raw.json --out audit.json [--run ID] [--cost-bps NUMBER]');
  options[args[i]]=args[i+1];
}
if(!options['--source']||!options['--out'])throw Error('--source and --out are required');
const raw=JSON.parse(await fs.readFile(options['--source'],'utf8'));
const report=buildSwingEvidence(raw,{activeRun:options['--run'],costBps:options['--cost-bps']==null?null:Number(options['--cost-bps'])});
await fs.writeFile(options['--out'],JSON.stringify({...report,exported_at:new Date().toISOString()},null,2),{flag:'wx'});
process.stdout.write(JSON.stringify({version:report.version,cohort_id:report.cohort_id,counts:report.counts,issues:report.coverage.issues})+'\n');
