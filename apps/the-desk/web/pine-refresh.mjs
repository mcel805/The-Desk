// Elliott's source packets and summary use completed candles down to 1m.
// A new quote inside that minute cannot change a completed-source result.
export function elliotRefreshGate(now=Date.now){
 let minute=null,barTime=null;
 const mark=bars=>{minute=Math.floor(now()/60000);barTime=bars?.at(-1)?.time??null;};
 return {
  mark,
  accepts(reason,bars){
   if(reason==='backfill')return false;
   if(reason!=null&&reason!=='tick'){mark(bars);return true;}
   const nextMinute=Math.floor(now()/60000),nextBar=bars?.at(-1)?.time??null;
   if(minute===nextMinute&&barTime===nextBar)return false;
   mark(bars);return true;
  }
 };
}
