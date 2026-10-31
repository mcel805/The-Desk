const timeframeMs=tf=>/^\d+$/.test(String(tf))?Number(tf)*60000:60000;
const chartForOwner=(cells,owner)=>{
 const matches=(cells||[]).map(cell=>cell?.chart??cell).filter(chart=>chart?.orchestrator?.engines?.get?.('pine')===owner);
 return matches.length===1?matches[0]:null;
};
export function geometryContextForOwner(cells,owner,market,{light=false}={}){
 const chart=chartForOwner(cells,owner);
 if(!chart)return {};
 const replay=chart.replay?.state;
 return {light,replay:!!replay?.active,...(replay?.active&&replay.cursorTime!=null?{cutoff:replay.cursorTime+(replay.nextTime===replay.cursorTime?0:timeframeMs(market?.timeframe))}: {})};
}
