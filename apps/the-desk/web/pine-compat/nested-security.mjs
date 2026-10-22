// SPDX-License-Identifier: AGPL-3.0-only
// Host compatibility extension for PineTS 0.11.0. Uses its public Context,
// Indicator and PineTS interfaces; the user's Pine calculations are unchanged.
import {Context,Indicator,PineTS,decodeTickerId,splitTickerModifier} from 'pinets';
import {findSecContextIdx} from './findSecContextIdx.ts';
import {findLTFContextIdx} from './findLTFContextIdx.ts';
import {expressionSlices} from './expression-slices.mjs';
import {lazyRequests} from './lazy-requests.mjs';
import {installCandleCloseTimes} from './candle-close-times.mjs';
import {installSecondarySnapshots} from './secondary-snapshots.mjs';
const preparedSources=new Map();
const suffix=n=>String(n).match(/p\d+$/)?.[0]||String(n);
function seconds(tf){const s=String(tf).toUpperCase(),m=s.match(/^(\d*)([SDWM])?$/);if(!m)throw Error('Invalid security timeframe: '+tf);return (Number(m[1])||1)*({S:1,D:86400,W:604800,M:2592000}[m[2]]||60);}
function primitive(v){if(v&&typeof v==='object'){if('__value'in v)return primitive(v.__value);if(typeof v.get==='function'&&Array.isArray(v.data))return v.get(0);if(Array.isArray(v))return v.map(primitive);}return v;}
function wrapped(v){return Array.isArray(v)&&v.length===2&&typeof v[1]==='string';}
const unwrap=v=>wrapped(v)?v[0]:v;
function slots(args){const names=['symbol','timeframe','expression','gaps','lookahead','ignore_invalid_symbol','currency','calc_bars_count'];const result={};args.forEach((a,i)=>{const val=unwrap(a);if(val&&typeof val==='object'&&!Array.isArray(val)&&!(typeof val.get==='function')&&i>=3){for(const[k,v]of Object.entries(val))result[k]=v;}else result[names[i]]=a;});return result;}
function sourceFunction(source,target){let entry=preparedSources.get(source);if(!entry){const fn=Indicator.from(source).prepare().fn;entry={fn,slices:expressionSlices(fn)};preparedSources.set(source,entry);if(preparedSources.size>8)preparedSources.delete(preparedSources.keys().next().value);}return entry.slices.get(target)||entry.fn;}
function capture(source,target,graph,parent){const fn=sourceFunction(source,target),stop={};const wrapper=async ctx=>{ctx.pineTSCode=source;ctx._deskRequestGraph=graph;ctx._propOverrides=parent._propOverrides;ctx._deskTarget={name:target,stop};try{return await fn(ctx);}catch(e){if(e!==stop)throw e;}finally{ctx._deskTarget=null;}};wrapper._pineVersion=fn._pineVersion;return wrapper;}
function values(ctx,name){if(ctx.params[name])return ctx.params[name];const keys=Object.keys(ctx.params).filter(k=>suffix(k)===suffix(name));if(keys.length!==1)throw Error('Security expression history unavailable: '+name);return ctx.params[keys[0]];}
function security(ctx){return async (...args)=>{
 const s=slots(args),rawSym=primitive(unwrap(s.symbol)),decoded=decodeTickerId(rawSym||ctx.tickerId),symbol=(typeof decoded==='object'?decoded.symbol:decoded)||rawSym||ctx.tickerId;
 // Keep the venue: bare requests depend on provider enumeration, which may
 // fail during throttling. They must not lose the chart's explicit identity.
 const qualify=value=>{const raw=String(value),at=raw.indexOf(':'),prefix=String(ctx.tickerId).split(':');return at>=0?raw.slice(0,at).toLowerCase()+raw.slice(at):prefix.length>1?prefix[0].toLowerCase()+':'+raw:raw;};
 const sym=qualify(symbol),current=qualify(ctx.tickerId),tf=String(primitive(unwrap(s.timeframe))||ctx.timeframe),expr=unwrap(s.expression),name=wrapped(s.expression)?s.expression[1]:null;
 if(!name)throw Error('Security expression has no compiled identity.');
 const reqParts=splitTickerModifier(sym),curParts=splitTickerModifier(current),sameSymbol=reqParts.symbol===curParts.symbol&&(reqParts.modifier||'standard')===(curParts.modifier||'standard');
 const reqSec=seconds(tf),ctxSec=seconds(ctx.timeframe),sameTF=reqSec===ctxSec&&String(tf).replace(/^1D$/,'D')===String(ctx.timeframe).replace(/^1D$/,'D');
 const count=primitive(unwrap(s.calc_bars_count)),limit=Number.isFinite(count)&&count>0?count:undefined;
 // Liquidity's canonical ledgers must receive the requested source depth even
 // when a source interval equals the viewing chart. Vela's chart-series shortcut
 // otherwise substitutes (for example) 600 chart bars for 800 source bars.
 const liquidityHistory=Boolean(limit)&&/f_masterPools/.test(ctx.pineTSCode)&&(reqParts.modifier||'standard')==='standard';
 if(sameSymbol&&sameTF&&!liquidityHistory){const v=primitive(typeof expr==='function'?ctx.pine.request.param(primitive(await expr()),undefined,name)[0]:expr);return Array.isArray(v)?[v]:v;}
 const ahead=primitive(unwrap(s.lookahead)),g=primitive(unwrap(s.gaps)),lookahead=ahead===true||ahead==='lookahead_on',gaps=g===true||g==='gaps_on';
 const key=JSON.stringify([sym,tf,name,limit]),graph=ctx._deskRequestGraph||(ctx._deskRequestGraph=new Map());
 let cached=ctx.cache['desk.security:'+key];
 if(!cached){
  const lastClose=ctx.marketData?.at(-1)?.closeTime||(ctx.marketData?.at(-1)?.openTime!=null?ctx.marketData.at(-1).openTime+ctxSec*1000:ctx.eDate||Date.now()),start=limit?undefined:(ctx.sDate||ctx.marketData?.[0]?.openTime),from=start?start-Math.max(2592000000,2*reqSec*1000):undefined;
  const graphKey=JSON.stringify([sym,tf,suffix(name),limit,from,lastClose,ctx.inputs,ctx._propOverrides]);
  let task=graph.get(graphKey);
  if(!task){task=(async()=>{const source=liquidityHistory?{...ctx.source,getMarketData:(ticker,...range)=>ctx.source.getMarketData(ticker.includes(';')?ticker:ticker+';standard',...range)}:ctx.source;const pine=new PineTS(source,sym,tf,limit,from,lastClose);if(ctx.viewportLeft!=null&&ctx.viewportRight!=null)pine.setVisibleRange(ctx.viewportLeft,ctx.viewportRight);const context=await pine.runPretranspiled(capture(ctx.pineTSCode,suffix(name),graph,ctx),ctx.inputs);return {pine,context,dataVersion:ctx.dataVersion};})();graph.set(graphKey,task);}
  cached=await task;ctx.cache['desk.security:'+key]=cached;
 }
 if(ctx.dataVersion>cached.dataVersion){await cached.pine.updateTail(cached.context);cached.dataVersion=ctx.dataVersion;}
 const open=primitive(ctx.data.openTime),close=primitive(ctx.data.closeTime),other=cached.context,ltf=ctxSec>reqSec,realtime=ctx.idx===ctx.length-1&&close>Date.now();
 const index=ltf?findLTFContextIdx(open,close,other.data.openTime.data,other.data.closeTime.data,lookahead,ctx.eDate,gaps):findSecContextIdx(open,close,other.data.openTime.data,other.data.closeTime.data,lookahead,realtime);
 if(index<0)return NaN;
 if(!ltf&&gaps){const prior=ctx.cache[key+':prior'];ctx.cache[key+':prior']=index;if(prior===index||prior===undefined)return NaN;}
 const value=primitive(values(other,name)[index]);return Array.isArray(value)?[value]:value;
};}
// Vela candles omit raw closeTime; PineTS infers it for the data series but
// its penultimate-bar detector reads the raw candle. Preserve Pine's completed
// history boundary even while the newest source candle is still forming.
function installCompletedHistory(ctx){
 const state=ctx.pine.barstate;
 Object.defineProperty(state,'islastconfirmedhistory',{configurable:true,get(){
  if(ctx.idx===ctx.length-1)return primitive(ctx.data.closeTime)<=Date.now();
  if(ctx.idx!==ctx.length-2)return false;
  const last=ctx.marketData?.at(-1),close=last?.closeTime??(last?.openTime+seconds(ctx.timeframe)*1000);
  return primitive(ctx.data.closeTime)<=Date.now()&&close>Date.now();
 }});
}
let installed=false;
export function installNestedSecurity(){if(installed)return;installed=true;installCandleCloseTimes();installSecondarySnapshots();
 const prepare=Indicator.prototype.prepare;Indicator.prototype.prepare=function(...args){const prepared=prepare.apply(this,args);if(!prepared.fn._deskLazy){prepared.fn=lazyRequests(prepared.fn);prepared.ltfSlices=undefined;}return prepared;};
 const bind=Context.prototype.bindContextObject;
 Context.prototype.bindContextObject=function(...args){bind.apply(this,args);if(!this._deskSecurityInstalled&&this.pine?.request){this._deskSecurityInstalled=true;installCompletedHistory(this);const arrayNew=this.pine.array.new;this.pine.array.new=(size,value)=>typeof value==='number'&&Number.isNaN(value)?arrayNew(size):arrayNew(size,value);const param=this.pine.request.param;this.pine.request.param=(source,index,name)=>{const result=param(primitive(source),index,name);if(this._deskTarget&&suffix(name)===this._deskTarget.name)throw this._deskTarget.stop;return result;};this.pine.request.paramThunk=async(thunk,index,name)=>{if(this._deskTarget&&suffix(name)===this._deskTarget.name){param(primitive(await thunk()),index,name);throw this._deskTarget.stop;}return [thunk,name];};this.pine.request.security=security(this);}};
 // Keep the function's local state active until its awaited request finishes.
 Context.prototype.call=function(fn,id,...args){this._deskFunctions??=new Map();const stable=this._deskFunctions.get(fn.name)||fn;this._deskFunctions.set(fn.name,stable);this.pushId(id);let result;try{result=stable(...args);}catch(e){this.popId();throw e;}if(result&&typeof result.then==='function')return result.then(value=>value===undefined?NaN:value).finally(()=>this.popId());this.popId();return result===undefined?NaN:result;};
}
