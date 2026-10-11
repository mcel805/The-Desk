// Validation contracts are independent of the chart and Pine compiler.
export const MAX_SOURCE_BYTES=250000;
export function checkPineSource(source){
 if(typeof source!=='string'||!source.trim())throw Error('Paste Pine Script source first.');
 if(new TextEncoder().encode(source).length>MAX_SOURCE_BYTES)throw Error('Source exceeds the 250 KB indicator limit.');
 if(!/^\s*\/\/@version\s*=\s*[56]\s*$/m.test(source))throw Error('Use native Pine Script v5 or v6 with its //@version declaration.');
 const code=source.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/[^\n]*|\/\*[^]*?\*\//g,token=>token.startsWith('/')?token.replace(/[^\n]/g,' '):token);
 if(/^\s*(?:strategy|library)\s*\(/m.test(code))throw Error('This editor creates indicators. Strategy and library scripts are not supported here.');
 if(!/^\s*indicator\s*\(/m.test(code))throw Error('An indicator() declaration is required.');
 if(/^\s*import\s/m.test(code))throw Error('Imported Pine libraries need an explicit dependency adapter; paste self-contained source.');
 return source;
}
export async function sourceHash(source){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export function drawingCounts(model){return Object.fromEntries(['series','lines','boxes','labels','polylines','linefills','tables'].map(k=>[k,(model?.[k]||[]).length]));}
export const GRAVITY_PROBES=['netGravity','u1Score','u2Score','u3Score','l1Score','l2Score','l3Score','u1Price','u2Price','u3Price','l1Price','l2Price','l3Price'];
export function validationSource(source){
 const globals=new Set(source.split(/\r?\n/).map(line=>line.match(/^(?:(?:var|varip)\s+)?(?:(?:float|int|bool|string|color)\s+)?([A-Za-z_]\w*)\s*=/)?.[1]).filter(Boolean));
 for(const line of source.split(/\r?\n/)){const tuple=line.match(/^\[([^\]]+)\]\s*=/);if(tuple)for(const name of tuple[1].split(','))globals.add(name.trim());}
 const names=GRAVITY_PROBES.filter(n=>globals.has(n));
 // Diagnostic plots only observe original variables. The installed source stays unchanged.
 return {source:source+(names.length?'\n\n// The Desk comparison outputs. Original calculations above are unchanged.\n'+names.map(n=>`plot(${n}, title="Desk: ${n}", display=display.data_window)`).join('\n')+'\n':''),probes:names};
}
export function plotRows(model,bars,cutoff){
 const outputs=new Map();
 for(const s of model?.series||[]){
  if(!s.title||!Array.isArray(s.points))continue;
  for(const p of s.points){if(!outputs.has(p.time))outputs.set(p.time,{});outputs.get(p.time)[s.title]=Number.isFinite(p.value)?p.value:null;}
 }
 return bars.filter(b=>b.time<=cutoff).map(b=>({...b,...outputs.get(b.time)}));
}
function quoteCsv(value){const s=value==null?'':String(value);return /[",\n\r]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;}
export function rowsToCsv(rows){
 const columns=[...new Set(rows.flatMap(r=>Object.keys(r)))];
 return columns.map(quoteCsv).join(',')+'\n'+rows.map(r=>columns.map(c=>quoteCsv(r[c])).join(',')).join('\n');
}
export function parseCsv(text){
 const matrix=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(!quoted&&(c===','||c==='\n')){row.push(cell.replace(/\r$/,''));cell='';if(c==='\n'){if(row.some(x=>x!==''))matrix.push(row);row=[];}}else cell+=c;}
 if(quoted)throw Error('CSV has an unterminated quoted field.');
 row.push(cell.replace(/\r$/,''));if(row.some(x=>x!==''))matrix.push(row);
 if(matrix.length<2)throw Error('CSV needs a header and data rows.');
 const headers=matrix.shift().map(h=>h.replace(/^\uFEFF/,'').trim());
 if(new Set(headers.map(h=>h.toLowerCase())).size!==headers.length)throw Error('CSV has duplicate column names.');
 return matrix.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])));
}
function timestamp(v){if(v===''||v==null)return NaN;let n=Number(v);if(!Number.isFinite(n))n=Date.parse(v);else if(n<1e12)n*=1000;return n;}
function numeric(v){return v===''||v==null||String(v).toLowerCase()==='na'?null:Number(v);}
export function compareReference(rows,csv,{absoluteTolerance=1e-7,relativeTolerance=1e-8}={}){
 const ref=parseCsv(csv),headers=Object.keys(ref[0]),key=name=>headers.find(h=>h.toLowerCase()===name),timeKey=key('time')||key('timestamp');
 if(!timeKey||['open','high','low','close'].some(n=>!key(n)))throw Error('Reference CSV must contain time and matching open/high/low/close columns.');
 const base=new Set(['time','open','high','low','close','volume']);
 const outputNames=[...new Set(rows.flatMap(r=>Object.keys(r)))].filter(k=>!base.has(k));
 if(!outputNames.length)throw Error('No numeric plot outputs are available. Use the exported comparison Pine script for drawing-only indicators.');
 const missing=outputNames.filter(n=>!headers.includes(n));if(missing.length)throw Error('Reference CSV is missing outputs: '+missing.join(', '));
 const byTime=new Map(rows.map(r=>[r.time,r])),seen=new Set(),mismatches=[];let matchedBars=0,valuesCompared=0;
 const equal=(a,b)=>a===null&&b===null||Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=absoluteTolerance+relativeTolerance*Math.max(Math.abs(a),Math.abs(b));
 for(const r of ref){const t=timestamp(r[timeKey]);if(!Number.isFinite(t))throw Error('Reference CSV contains an invalid timestamp.');if(seen.has(t))throw Error('Reference CSV contains duplicate timestamps.');seen.add(t);const actual=byTime.get(t);if(!actual)continue;matchedBars++;
  for(const n of ['open','high','low','close'])if(!equal(actual[n],numeric(r[key(n)])))throw Error('OHLC differs at '+new Date(t).toISOString()+'. Compare the same venue, timeframe and bars.');
  if(key('volume')&&!equal(actual.volume,numeric(r[key('volume')])))throw Error('Volume differs at '+new Date(t).toISOString()+'. Use the same provider data.');
  for(const n of outputNames){const a=numeric(actual[n]),b=numeric(r[n]);if(a!==null&&Number.isFinite(a)||b!==null&&Number.isFinite(b))valuesCompared++;if(!equal(a,b))mismatches.push({time:t,output:n,actual:a,reference:b});}
 }
 if(matchedBars<3)throw Error('At least three shared completed bars are required.');
 if(!valuesCompared)throw Error('No finite output values were available to compare after warmup.');
 return {matched:mismatches.length===0,matchedBars,valuesCompared,absoluteTolerance,relativeTolerance,mismatches:mismatches.slice(0,100),mismatchCount:mismatches.length,scope:'Numeric outputs on shared completed bars; visual parity is unverified.'};
}
