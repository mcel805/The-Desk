export function validateBars(rows){
 if(!Array.isArray(rows)||rows.length<61||rows.length>10000)throw Error('Load 61–10,000 complete one-minute candles.');
 let prior;return rows.map((r,i)=>{const b={};for(const key of ['time','open','high','low','close','volume']){if(r[key]==null||r[key]===''||typeof r[key]==='boolean')throw Error(`Row ${i+1}: missing ${key}.`);b[key]=Number(r[key]);if(!Number.isFinite(b[key]))throw Error(`Row ${i+1}: invalid ${key}.`);}
 if(b.time%60000||prior!=null&&b.time!==prior+60000)throw Error(`Row ${i+1}: timestamps must be contiguous one-minute UTC bars.`);if(b.low<=0||b.volume<0||b.high<Math.max(b.open,b.close,b.low)||b.low>Math.min(b.open,b.close))throw Error(`Row ${i+1}: invalid OHLCV.`);prior=b.time;return b;});
}
export function parseCSV(text){
 const records=[];let row=[],field='',quote=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quote&&text[i+1]==='"'){field+='"';i++;}else quote=!quote;}else if(!quote&&c===','){row.push(field);field='';}else if(!quote&&(c==='\n'||c==='\r')){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))records.push(row);row=[];field='';}else field+=c;}
 if(quote)throw Error('Unclosed CSV quote.');row.push(field);if(row.some(v=>v.trim()))records.push(row);
 const header=(records.shift()||[]).map(x=>x.replace(/^\uFEFF/,'').trim().toLowerCase());const keys=['time','open','high','low','close','volume'];if(keys.some(k=>!header.includes(k)))throw Error('CSV needs time,open,high,low,close,volume headers.');
 return validateBars(records.map((r,i)=>{const b=Object.fromEntries(keys.map(k=>[k,r[header.indexOf(k)]?.trim()]));if(/^\d+(\.\d+)?$/.test(b.time||'')){b.time=Number(b.time);if(b.time<1e12)b.time*=1000;}else{if(!/(Z|[+-]\d\d:\d\d)$/i.test(b.time||''))throw Error(`Row ${i+1}: use epoch time or ISO time with Z / UTC offset.`);b.time=Date.parse(b.time);}return b;}));
}
export function syntheticBars(seed=1490,count=360){
 let value=seed>>>0;const rand=()=>{value=(1664525*value+1013904223)>>>0;return value/4294967296;};let close=5000;const start=Date.UTC(2026,9,1,14,0);const rows=[];
 for(let i=0;i<count;i++){const open=close,regime=i<120?.3:i<240?-.5:.1;close=Math.round((open+regime+(rand()-.5)*8)*4)/4;const high=Math.ceil((Math.max(open,close)+rand()*4)*4)/4,low=Math.floor((Math.min(open,close)-rand()*4)*4)/4;rows.push({time:start+i*60000,open,high,low,close,volume:100+Math.floor(rand()*700)});}return rows;
}
export function metrics(rows,key){const scored=rows.filter(r=>r.actual&&r[key]?.result);const n=scored.length;if(!n)return {n:0};const avg=fn=>scored.reduce((s,r)=>s+fn(r),0)/n;return {n,containment:avg(r=>+r[key].result.contained),highOK:avg(r=>+r[key].result.highOK),lowOK:avg(r=>+r[key].result.lowOK),widthTicks:avg(r=>r[key].widthTicks),errorTicks:avg(r=>(r[key].result.highErrorTicks+r[key].result.lowErrorTicks)/2)};}
export function pairedMetrics(rows){const paired=rows.filter(r=>r.actual&&r.comparisonEligible);return {baseline:metrics(paired,'baseline'),jev:metrics(paired,'jev')};}
