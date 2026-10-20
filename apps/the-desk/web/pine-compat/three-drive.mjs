// SPDX-License-Identifier: AGPL-3.0-only
// PineTS 0.11.0 resolves lab(num) to the global Maximum Swing Length input.
// Repair the compiled method's binding, preserving the supplied Pine source.
import {Indicator} from 'pinets';
export const isThreeDriveSource=source=>typeof source==='string'&&
 /indicator\('(?:Agentic - Three Drive Pattern|Three Drive Pattern Detector)'/.test(source)&&
 source.includes('method lab(float level, float levelL, float levelH, int x1, int x2, float y1, float y2, float num, color col)')&&
 /method zigzag\s*\(/.test(source);
export function correctThreeDriveBindings(fn){
 if(fn._deskThreeDrive)return fn;
 const compiled=fn.toString(),start=compiled.indexOf('function $M_lab('),end=compiled.indexOf('$M_lab.__pineMethod__',start);
 if(start<0||end<0)throw Error('Three Drive ratio-label method was not found in the pinned Pine runtime.');
 const method=compiled.slice(start,end),wrong='$.let.glb1_num';
 // A future engine may already bind the local parameter correctly.
 if(!method.includes(wrong))return fn;
 if(method.split(wrong).length!==2)throw Error('Three Drive ratio-label binding changed; review the compatibility correction.');
 const fixed=new Function('return ('+compiled.slice(0,start)+method.replace(wrong,'num')+compiled.slice(end)+')')();
 Object.assign(fixed,fn);fixed._deskThreeDrive=true;return fixed;
}
let installed=false;
export function installThreeDriveCompatibility(){
 if(installed)return;installed=true;
 const prepare=Indicator.prototype.prepare;
 Indicator.prototype.prepare=function(...args){
  const prepared=prepare.apply(this,args);
  if(isThreeDriveSource(this.source))prepared.fn=correctThreeDriveBindings(prepared.fn);
  return prepared;
 };
}
