import {timeframeDuration} from './pine-validation.mjs';
const canonical=tf=>tf==='D'?'1D':tf==='W'?'1W':String(tf);
export function elliotHistoryFrames(inputs={},chartTF='60'){
 const ms=timeframeDuration(chartTF),manual=inputs.ladder==='Manual timeframes';
 const parent=manual?inputs.parentInput:ms>=86400000?'1W':ms>=14400000?'1D':ms>=3600000?'240':ms>=900000?'60':ms>=300000?'30':'5';
 const child=manual?inputs.childInput:ms>=86400000?'240':ms>=14400000?'60':ms>=3600000?'30':ms>=900000?'5':'1';
 const frames=[parent,manual?inputs.coreInput:chartTF,child,inputs.bridgeTF||'60'];
 if(inputs.agenticSummary!==false)frames.push('1D','240','60','30','15','5','1');
 return [...new Set(frames.filter(Boolean).map(canonical))].filter(tf=>tf!==canonical(chartTF));
}
export function elliotHistoryEnd(bars,tf){return bars.at(-1).time+timeframeDuration(tf);}
