// Pure presentation helpers. Missing broker values must never turn into zero.
export function money(value,currency='USD'){
 if(value===null||value===undefined||value==='')return 'Unavailable';
 const n=Number(value);return Number.isFinite(n)?new Intl.NumberFormat('en-US',{style:'currency',currency,maximumFractionDigits:2}).format(n):'Unavailable';
}
export function sourceLabel(source,connected=true){
 if(!source)return 'Not loaded';
 const state=({complete:'Loaded to end of requested scope',partial:'More pages available',error:'Read failed · previous data may be stale',unavailable:'Tool or account data unavailable'})[source.status]||'Unknown coverage';
 return (!connected?'Cached · disconnected · ':'')+state;
}
export function collection(source,keys){
 if(!source?.data)return null;
 for(const key of keys)if(Array.isArray(source.data[key]))return source.data[key];
 return null;
}
export function configPayload(form,agent,accountId){
 const v=Object.fromEntries(form);
 return {id:agent?.id,expectedRevision:agent?.revision??0,accountId,name:v.name,mode:v.mode,
 strategy:'chart-ticket-v1',symbols:String(v.symbols||'').split(',').map(x=>x.trim().toUpperCase()).filter(Boolean),
 maxOrderUSD:v.maxOrderUSD,maxQuoteAgeSeconds:Number(v.maxQuoteAgeSeconds),maxSpreadBps:Number(v.maxSpreadBps),notes:v.notes||''};
}
