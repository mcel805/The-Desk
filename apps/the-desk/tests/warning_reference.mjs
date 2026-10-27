import {WarningEngine} from '../../../indicators/agentic-swing-tracker-v1.3/warning-engine.mjs';
let data='';for await(const x of process.stdin)data+=x;
const {config,steps}=JSON.parse(data),e=new WarningEngine(config),out=[];
for(const s of steps){if(s.kind==='levels'){e.setLevels(s.levels,s.at);out.push(null);}else if(s.kind==='live')out.push(e.observe(s.bar,s.at,{sourceAt:s.sourceAt??s.at}));else out.push(e.feed(s.bar,s.at));}
console.log(JSON.stringify({out,events:e.events}));
