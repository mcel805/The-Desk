// Public market data only. Paper execution stays with the server-owned engine.
export function normalizeBook(book) {
  const side=(rows,descending)=>{
    if(!Array.isArray(rows))throw Error('Missing book side');
    const map=new Map();
    for(const r of rows){const price=Number(r.price??r.px??r[0]),qty=Number(r.qty??r.sz??r[1]);
      if(!Number.isFinite(price)||price<=0||!Number.isFinite(qty)||qty<0)throw Error('Invalid book level');
      if(qty>0)map.set(price,{price,qty});
    }
    return [...map.values()].sort((a,b)=>descending?b.price-a.price:a.price-b.price);
  };
  const bids=side(book.bids,true),asks=side(book.asks,false);
  if(!bids.length||!asks.length||bids[0].price>=asks[0].price)throw Error('Incomplete or crossed book');
  return {bids,asks};
}

export function depthRows(book,limit=11,multiplier=1,tick=.01){
  const step=tick*multiplier;
  const build=(rows,kind)=>{
    const grouped=new Map();
    for(const r of rows){
      // Buy buckets round down; sell buckets round up, so aggregation cannot cross.
      const scaled=r.price/step,rounded=kind==='bid'?Math.floor(scaled+1e-8):Math.ceil(scaled-1e-8);
      const price=multiplier===1?r.price:Number((rounded*step).toPrecision(12));
      grouped.set(price,(grouped.get(price)||0)+r.qty);
    }
    let total=0;
    return [...grouped].sort((a,b)=>kind==='bid'?b[0]-a[0]:a[0]-b[0]).slice(0,limit).map(([price,qty],i)=>({price,qty,total:total+=qty,kind,best:i===0,key:kind+':'+price}));
  };
  const bids=build(book.bids,'bid'),asks=build(book.asks,'ask');
  const maximum=Math.max(bids.at(-1)?.total||0,asks.at(-1)?.total||0);
  return {bids,asks,maximum,spread:book.asks[0].price-book.bids[0].price,mid:(book.asks[0].price+book.bids[0].price)/2};
}

function updatePriceIndex(index,price,present,descending){
  let lo=0,hi=index.length;
  while(lo<hi){const mid=(lo+hi)>>>1;if(descending?index[mid]>price:index[mid]<price)lo=mid+1;else hi=mid;}
  if(index[lo]===price){if(!present)index.splice(lo,1);}else if(present)index.splice(lo,0,price);
}

export class BookStream {
  constructor({onBook,onTrade=()=>{},onStatus=()=>{},socket=url=>new WebSocket(url),now=()=>Date.now()}){
    Object.assign(this,{onBook,onTrade,onStatus,socket,now});this.generation=0;this.instrument='';
  }
  start(instrument,mode='fast'){
    this.stop();this.instrument=instrument;this.mode=mode;this.attempt=0;
    if(!/^(hyperliquid:(BTC|ETH|SOL)|coinbase:(BTC-USD|ETH-USD|SOL-USD))$/.test(instrument)){
      this.onStatus('unsupported');return;
    }
    this.connect(this.generation);
  }
  connect(generation){
    if(generation!==this.generation)return;
    this.onStatus('connecting');this.ready=false;this.lastBook=0;this.connectedAt=this.now();this.bids=new Map();this.asks=new Map();this.bidPrices=[];this.askPrices=[];this.sourceTime=0;
    const hyper=this.instrument.startsWith('hyperliquid:'),symbol=this.instrument.split(':')[1];
    let ws;try{ws=this.socket(hyper?'wss://api.hyperliquid.xyz/ws':'wss://ws-feed.exchange.coinbase.com');}catch{this.retry(generation);return;}
    this.ws=ws;
    const current=()=>generation===this.generation&&this.ws===ws;
    ws.onopen=()=>{
      if(!current())return;
      if(hyper){for(const subscription of [{type:'l2Book',coin:symbol,fast:this.mode==='fast'},{type:'trades',coin:symbol}])ws.send(JSON.stringify({method:'subscribe',subscription}));}
      else ws.send(JSON.stringify({type:'subscribe',product_ids:[symbol],channels:['level2_batch','ticker','heartbeat']}));
    };
    ws.onmessage=e=>{
      if(!current())return;
      try{
        const m=JSON.parse(e.data);
        if(m.type==='error'||m.channel==='error'){ws.close();return;}
        if(hyper&&m.channel==='l2Book'&&m.data?.coin===symbol){
          if(!Number.isFinite(m.data.time)||m.data.time<this.sourceTime)return;
          const book=normalizeBook({bids:m.data.levels[0],asks:m.data.levels[1]});this.sourceTime=m.data.time;this.emit(book,m.data.time);
        }else if(!hyper&&m.product_id===symbol){
          if(m.type==='snapshot'){
            const book=normalizeBook(m);this.bids=new Map(book.bids.map(r=>[r.price,r.qty]));this.asks=new Map(book.asks.map(r=>[r.price,r.qty]));this.bidPrices=book.bids.map(r=>r.price);this.askPrices=book.asks.map(r=>r.price);this.ready=true;this.emit(this.coinbaseBook(),null);
          }else if(m.type==='l2update'&&this.ready){
            const at=Date.parse(m.time);if(!Number.isFinite(at)||at<this.sourceTime)return;
            for(const [side,p,q] of m.changes){
              const price=Number(p),qty=Number(q);if(!['buy','sell'].includes(side)||!Number.isFinite(price)||price<=0||!Number.isFinite(qty)||qty<0)throw Error('Bad delta');
              const map=side==='buy'?this.bids:this.asks;if(qty===0)map.delete(price);else map.set(price,qty);
              updatePriceIndex(side==='buy'?this.bidPrices:this.askPrices,price,qty>0,side==='buy');
            }
            this.sourceTime=at;
            this.emit(this.coinbaseBook(),at);
          }else if(m.type==='ticker')this.trade(m.price,m.side,Date.parse(m.time));
        }
        if(hyper&&m.channel==='trades'&&!m.isSnapshot){for(const t of m.data||[])if(t.coin===symbol)this.trade(t.px,t.side,t.time);}
      }catch{this.ready=false;ws.close();}
    };
    ws.onerror=()=>{if(current())ws.close();};
    ws.onclose=()=>{if(current()){clearInterval(this.health);this.retry(generation);}};
    clearInterval(this.health);
    this.health=setInterval(()=>{
      if(!current())return;
      const age=this.now()-(this.lastBook||this.connectedAt);
      if(age>10000){this.onStatus('stale');ws.close();}
      else if(hyper&&ws.readyState===1)ws.send(JSON.stringify({method:'ping'}));
    },2000);
  }
  coinbaseBook(){
    // Maintain the complete snapshot/delta state; copy only nearby prices for
    // rendering/grouping so a 50 ms update never sorts the entire market book.
    const bids=this.bidPrices.slice(0,2000).map(price=>({price,qty:this.bids.get(price)})),asks=this.askPrices.slice(0,2000).map(price=>({price,qty:this.asks.get(price)}));
    if(!bids.length||!asks.length||bids[0].price>=asks[0].price)throw Error('Incomplete or crossed book');
    return {bids,asks};
  }
  emit(book,sourceTime){
    this.ready=true;this.attempt=0;this.lastBook=this.now();this.onStatus('streaming');
    this.onBook({...book,instrument:this.instrument,receivedAt:this.lastBook,sourceTime,transport:'WebSocket',mode:this.mode});
  }
  trade(price,side,time){if(Number.isFinite(Number(price))&&Number(price)>0&&Number.isFinite(time)&&time>=this.tradeTime){this.tradeTime=time;this.onTrade({price:Number(price),side,time,instrument:this.instrument});}}
  retry(generation){if(generation!==this.generation)return;this.onStatus('reconnecting');clearTimeout(this.retryTimer);this.retryTimer=setTimeout(()=>this.connect(generation),Math.min(15000,500*2**Math.min(this.attempt++,5)));}
  stop(){this.generation++;clearTimeout(this.retryTimer);clearInterval(this.health);this.tradeTime=0;if(this.ws){this.ws.onclose=null;this.ws.close();this.ws=null;}}
}
