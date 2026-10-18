// SPDX-License-Identifier: AGPL-3.0-only
// Timestamp-exact source binding for the named ABC study. Missing samples are na.
import {Context} from 'pinets';
let installed=false;
export function installABCExternalSources(){
 if(installed)return;installed=true;
 const bind=Context.prototype.bindContextObject;
 Context.prototype.bindContextObject=function(...args){
  bind.apply(this,args);if(this._deskABCSourceInstalled||!this.pine?.input)return;
  this._deskABCSourceInstalled=true;const source=this.pine.input.source;
  this.pine.input.source=(...values)=>{
   const result=source(...values);
   if(result?.__deskABCSource===1&&String(this.pineTSCode).includes('indicator("Agentic - ABC Reversal"')){
    const value=result.values?.[this.data.openTime.get(0)];return typeof value==='number'&&Number.isFinite(value)?value:NaN;
   }
   return result;
  };
 };
}
