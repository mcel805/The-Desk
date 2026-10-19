// Shared public candle history. A single socket updates every requested interval;
// repeated security tail polls reuse that history instead of redownloading it.
export const candleFrame=tf=>({'1D':'D','1d':'D','1W':'W','1w':'W','1h':'60','4h':'240','1m':'1','5m':'5','15m':'15','30m':'30'}[tf]||String(tf));
const intervals={'1':'1m','3':'3m','5':'5m','15':'15m','30':'30m','60':'1h','120':'2h','240':'4h','480':'8h','720':'12h',D:'1d',W:'1w',M:'1M'};
const millis=tf=>({D:86400000,W:604800000,M:2592000000}[tf]||Number(tf)*60000);
const realDelay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export class PublicHistoryRequests {
 constructor({fetch=(...args)=>globalThis.fetch(...args),now=Date.now,delay=realDelay}={}){this.fetch=fetch;this.now=now;this.delay=delay;this.pending=new Map();this.queue=Promise.resolve();this.tokens=500;this.at=now();this.pause=0;}
 async reserve(weight){
  const previous=this.queue;let release;this.queue=new Promise(resolve=>release=resolve);await previous;
  try{for(;;){const now=this.now();this.tokens=Math.min(500,this.tokens+(now-this.at)*.008);this.at=now;const wait=Math.max(this.pause-now,(weight-this.tokens)/.008);if(wait<=0){this.tokens-=weight;return;}await this.delay(Math.ceil(wait));}}finally{release();}
 }
 request(body){
  const key=JSON.stringify(body);if(this.pending.has(key))return this.pending.get(key);
  const task=this.load(body).finally(()=>this.pending.delete(key));this.pending.set(key,task);return task;
 }
 async load(body){
  const r=body.req,frame=r&&Object.entries(intervals).find(([,v])=>v===r.interval)?.[0],count=frame?Math.min(5000,Math.ceil((r.endTime-r.startTime)/millis(frame))+1):0,weight=20+Math.ceil(count/60);
  for(let attempt=0;attempt<4;attempt++){
   await this.reserve(weight);const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);let response;
   try{
    response=await this.fetch('https://api.hyperliquid.xyz/info',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
    if(response.status===429&&attempt<3){
     const raw=response.headers.get('Retry-After'),retry=raw==null?NaN:Number(raw);
     const wait=Number.isFinite(retry)?Math.max(0,retry*1000):Math.max(0,Date.parse(raw)-this.now())||1000*2**attempt;
     if(wait>30000)throw Error('Hyperliquid history rate limited · retry in '+Math.ceil(wait/1000)+' seconds.');
     this.pause=Math.max(this.pause,this.now()+wait);continue;
    }
    if(!response.ok)throw Error('Hyperliquid history HTTP '+response.status+(response.status===429?' · rate limited; retry shortly.':''));
    return await response.json();
   }finally{clearTimeout(timer);}
  }
 }
}
export class StreamingCandleHistory {
 constructor({load,WebSocket=globalThis.WebSocket,now=Date.now,setTimer=(...args)=>globalThis.setTimeout(...args),clearTimer=id=>globalThis.clearTimeout(id)}={}){this.load=load;this.WebSocket=WebSocket;this.now=now;this.setTimer=setTimer;this.clearTimer=clearTimer;this.entries=new Map();this.socket=null;this.reconnect=null;this.ping=null;this.closed=false;this.postId=0;this.posts=new Map();this.openWaiters=new Set();}
 async postInfo(payload){
  this.connect();if(!this.socket)throw Error('WebSocket unavailable');
  if(this.socket.readyState!==1)await new Promise((resolve,reject)=>{const waiter={resolve:()=>{this.clearTimer(timer);this.openWaiters.delete(waiter);resolve();},reject:()=>{this.clearTimer(timer);this.openWaiters.delete(waiter);reject(Error('WebSocket unavailable'));}};const timer=this.setTimer(()=>waiter.reject(),3000);this.openWaiters.add(waiter);});
  return new Promise((resolve,reject)=>{const id=++this.postId,timer=this.setTimer(()=>{this.posts.delete(id);reject(Error('Hyperliquid WebSocket history request timed out.'));},15000);this.posts.set(id,{resolve,reject,timer});try{this.socket.send(JSON.stringify({method:'post',id,request:{type:'info',payload}}));}catch(error){this.clearTimer(timer);this.posts.delete(id);reject(error);}});
 }
 key(coin,tf){return coin+'|'+candleFrame(tf);}
 entry(coin,tf){const key=this.key(coin,tf);let e=this.entries.get(key);if(!e){e={coin,tf:candleFrame(tf),bars:[],listeners:new Set(),updated:0,fetched:0,seeded:false,to:0,limit:0,pending:new Map()};this.entries.set(key,e);if(this.socket?.readyState===1)this.send(e);}else{this.entries.delete(key);this.entries.set(key,e);}for(const [oldKey,old] of this.entries){if(this.entries.size<=64)break;if(old===e||old.listeners.size||old.pending.size)continue;if(this.socket?.readyState===1&&intervals[old.tf])this.socket.send(JSON.stringify({method:'unsubscribe',subscription:{type:'candle',coin:old.coin,interval:intervals[old.tf]}}));this.entries.delete(oldKey);}this.connect();return e;}
 async getBars(coin,tf,range={}){
  const e=this.entry(coin,tf),to=range.to??this.now(),from=range.from,limit=range.limit??500;
  // Studies ask for different depths of the same interval during startup. Let
  // the running snapshot seed the shared cache before deciding to fetch again.
  if(e.pending.size){await Promise.allSettled([...e.pending.values()]);return this.getBars(coin,tf,range);}
  const selected=e.bars.filter(b=>(from==null||b.time>=from)&&b.time<=to),fresh=this.now()-Math.max(e.updated,e.fetched)<=15000;
  const covered=e.bars.length&&to<=Math.max(e.to,e.updated?this.now()+millis(e.tf):Math.min(this.now(),e.bars.at(-1).time+millis(e.tf)))&&(from==null?(selected.length>=limit||(limit<=e.limit&&to>=e.to)):from>=e.bars[0].time);
  if(e.seeded&&fresh&&covered)return (from==null?selected.slice(-limit):selected).map(b=>({...b}));
  const key=JSON.stringify(range);let task=e.pending.get(key);
  if(!task){const started=this.now(),hasDepth=from==null?(selected.length>=limit||(limit<=e.limit&&to>=e.to)):from>=e.bars[0]?.time;
   // Closed history stays valid when the stream goes quiet. Refresh its newest
   // edge instead of downloading thousands of unchanged candles again.
   const loadRange=e.seeded&&hasDepth&&to>=e.bars.at(-1).time?{from:e.bars.at(-1).time,to:range.to}:range;
   task=this.load(coin,e.tf,loadRange).then(bars=>{if(!bars.length)throw Error('Hyperliquid candle history unavailable: '+coin+' '+e.tf);const streamBars=e.updated>started?new Map(e.bars.map(b=>[b.time,b])):null;this.merge(e,bars);if(streamBars)this.merge(e,[...streamBars.values()]);e.seeded=true;e.fetched=this.now();e.to=Math.max(e.to,to);e.limit=Math.max(e.limit,from==null?limit:0);return bars;}).finally(()=>e.pending.delete(key));e.pending.set(key,task);}
  await task;const current=e.bars.filter(b=>(from==null||b.time>=from)&&b.time<=to);return (from==null?current.slice(-limit):current).map(b=>({...b}));
 }
 merge(e,bars){const map=new Map(e.bars.map(b=>[b.time,b]));for(const b of bars)map.set(b.time,{...b});e.bars=[...map.values()].sort((a,b)=>a.time-b.time).slice(-5000);}
 subscribe(coin,tf,listener){const e=this.entry(coin,tf);e.listeners.add(listener);if(!e.poll)this.poll(e);return ()=>{e.listeners.delete(listener);if(!e.listeners.size){this.clearTimer(e.poll);e.poll=null;}};}
 poll(e){e.poll=this.setTimer(async()=>{e.poll=null;if(this.closed||!e.listeners.size)return;if(e.seeded&&this.now()-e.updated>=15000){try{const bars=await this.getBars(e.coin,e.tf,{limit:2});for(const b of bars)for(const notify of e.listeners)notify({...b});}catch{/* Next scheduled poll retries an unavailable public feed. */}}if(!this.closed&&e.listeners.size)this.poll(e);},15000);}
 send(e){const interval=intervals[e.tf];if(interval&&this.socket?.readyState===1)this.socket.send(JSON.stringify({method:'subscribe',subscription:{type:'candle',coin:e.coin,interval}}));}
 connect(){
  if(this.closed||this.socket||!this.WebSocket)return;
  const socket=new this.WebSocket('wss://api.hyperliquid.xyz/ws');this.socket=socket;
  socket.onopen=()=>{for(const waiter of [...this.openWaiters])waiter.resolve();for(const e of this.entries.values())this.send(e);const ping=()=>{if(this.socket!==socket)return;socket.send(JSON.stringify({method:'ping'}));this.ping=this.setTimer(ping,30000);};this.ping=this.setTimer(ping,30000);};
  socket.onmessage=event=>{let message;try{message=JSON.parse(event.data);}catch{return;}if(message.channel==='post'){const data=message.data,pending=this.posts.get(data?.id);if(!pending)return;this.posts.delete(data.id);this.clearTimer(pending.timer);const response=data.response;if(response?.type==='info')pending.resolve(response.payload?.data??response.payload);else pending.reject(Error(String(response?.payload||'Hyperliquid history response unavailable')));return;}if(message.channel!=='candle'||!message.data)return;const b=message.data,e=[...this.entries.values()].find(e=>e.coin===b.s&&intervals[e.tf]===b.i);if(!e)return;const bar={time:Number(b.t),open:Number(b.o),high:Number(b.h),low:Number(b.l),close:Number(b.c),volume:Number(b.v)};if(!Object.values(bar).every(Number.isFinite))return;this.merge(e,[bar]);e.updated=this.now();if(e.seeded)for(const notify of e.listeners)notify({...bar});};
  socket.onclose=()=>{if(this.socket!==socket)return;this.socket=null;this.clearTimer(this.ping);for(const waiter of [...this.openWaiters])waiter.reject();for(const pending of this.posts.values()){this.clearTimer(pending.timer);pending.reject(Error('Hyperliquid WebSocket closed during history request.'));}this.posts.clear();for(const e of this.entries.values())e.updated=0;if(!this.closed)this.reconnect=this.setTimer(()=>{this.reconnect=null;this.connect();},2000);};
  socket.onerror=()=>socket.close();
 }
 close(){this.closed=true;this.clearTimer(this.ping);this.clearTimer(this.reconnect);for(const e of this.entries.values())this.clearTimer(e.poll);this.socket?.close();this.socket=null;}
}
