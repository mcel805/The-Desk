import {HyperliquidProvider} from './vendor/vela.js';
import {PublicHistoryRequests,StreamingCandleHistory} from './hyperliquid-history.mjs';
let history;
const requests=new PublicHistoryRequests({fetch:async(url,options)=>{
 try{const data=await history.postInfo(JSON.parse(options.body));return new Response(JSON.stringify(data),{status:200});}
 catch(error){if(error.message==='WebSocket unavailable')return globalThis.fetch(url,options);if(/429|rate.limit|too many/i.test(error.message))return new Response(error.message,{status:429});throw error;}
}});
// The pinned provider's post seam handles only public info requests. Preserve its
// symbol metadata and aggregation while sharing retries and a weighted budget.
class HistoryTransportProvider extends HyperliquidProvider {post(body){return requests.request(body);}}
const rest=new HistoryTransportProvider();
history=new StreamingCandleHistory({load:(coin,tf,range)=>rest.getBars(coin,tf,range)});
export class DeskHyperliquidProvider extends HistoryTransportProvider {
 getBars(coin,tf,range){return history.getBars(coin,tf,range);}
 subscribe(coin,tf,listener){return history.subscribe(coin,tf,listener);}
}
if(typeof window!=='undefined')window.addEventListener('pagehide',()=>history.close());
