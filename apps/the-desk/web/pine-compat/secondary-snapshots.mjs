// SPDX-License-Identifier: AGPL-3.0-only
import {PineTS} from 'pinets';
let installed=false;
export function installSecondarySnapshots(){
 if(installed)return;
 installed=true;
 const run=PineTS.prototype.runPretranspiled;
 // The native complete/stream runners snapshot immediately before the last
 // candle. The pretranspiled secondary runner skips it, causing updateTail's
 // fallback to pop market-data history twice on every live update.
 PineTS.prototype.runPretranspiled=async function(...args){
  const execute=this._executeIterations;
  this._executeIterations=async function(ctx,fn,start,end){
   if(end-start>1)await execute.call(this,ctx,fn,start,end-1);
   ctx._varSnapshot=this._snapshotVarState(ctx);
   return execute.call(this,ctx,fn,Math.max(start,end-1),end);
  };
  try{return await run.apply(this,args);}finally{this._executeIterations=execute;}
 };
}
