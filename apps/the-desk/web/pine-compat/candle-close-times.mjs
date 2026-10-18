// SPDX-License-Identifier: AGPL-3.0-only
import {PineTS} from 'pinets';
let installed=false;
export function installCandleCloseTimes(){
 if(installed)return;
 installed=true;
 // PineTS 0.11 infers missing closeTime on initial load, but its tail
 // replacement/append paths copy undefined over that inferred value. Match
 // the initial-load fallback on both paths; keep provider session closes.
 const normalize=(pine,candle)=>{
  if(candle.closeTime!=null)return candle;
  const match=String(pine.timeframe).toUpperCase().match(/^(\d*)([SDWM])?$/);
  if(!match)throw Error('Invalid candle timeframe: '+pine.timeframe);
  const ms=(Number(match[1])||1)*({S:1000,D:86400000,W:604800000,M:2592000000}[match[2]]||60000);
  return {...candle,closeTime:candle.openTime+ms};
 };
 // These two pinned-version hooks feed both the main chart stream and
 // request.security's cached PineTS contexts. No Pine source is changed.
 const replace=PineTS.prototype._replaceCandle,append=PineTS.prototype._appendCandle;
 if(typeof replace!=='function'||typeof append!=='function')throw Error('PineTS candle update API changed; review close-time compatibility.');
 PineTS.prototype._replaceCandle=function(index,candle){return replace.call(this,index,normalize(this,candle));};
 PineTS.prototype._appendCandle=function(candle){return append.call(this,normalize(this,candle));};
}
