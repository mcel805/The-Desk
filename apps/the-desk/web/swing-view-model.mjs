// Display ownership is independent of the shared server observation run.
export const swingMarkets=Object.freeze(['hyperliquid:BTC','hyperliquid:ETH']);
export function eligibleSwingCharts(charts){return charts.filter(c=>String(c.timeframe)==='1'&&swingMarkets.includes(c.market));}
export function selectSwingChart(charts,{selected='auto',previous=null,active=null,runningMarket=null}={}){
 const eligible=eligibleSwingCharts(charts).filter(c=>!runningMarket||c.market===runningMarket);
 if(selected!=='auto')return eligible.find(c=>c.id===selected)||null;
 return eligible.find(c=>c.id===previous)||eligible.find(c=>c.id===active)||eligible[0]||null;
}
