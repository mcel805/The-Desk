// Background evidence uses the identical vendored providers and chart engines.
import fs from 'node:fs';
import vm from 'node:vm';
import {FRAMES,FRAME_MS,cleanBars,analyze} from './web/wave-court-port.mjs';
import {taperEvidence} from './web/quant-wave-court.mjs';
import {marketGeometryEvidence,geometryTape} from './web/jev-market-geometry.mjs';
const input=JSON.parse(fs.readFileSync(0,'utf8'));
const sandbox={fetch,setTimeout,clearTimeout,setInterval,clearInterval,AbortController,URL,Headers,
 console:{log:()=>{},warn:()=>{},error:()=>{}}};
vm.runInNewContext(fs.readFileSync(new URL('./web/vendor/vela.global.min.js',import.meta.url),'utf8'),sandbox);
const cls={coinbase:'CoinbaseProvider',binance:'BinanceProvider',hyperliquid:'HyperliquidProvider'}[input.provider];
if(!cls)throw Error('Unsupported paper provider');
const provider=new sandbox.Vela[cls](),asof=Date.now();
const series=await Promise.all(FRAMES.map(async(timeframe,i)=>({timeframe,
 bars:cleanBars(await provider.getBars(input.symbol,timeframe,{limit:i===6?1200:timeframe==='30m'||timeframe==='15m'?800:400}),FRAME_MS[i],asof)})));
if(series.some(s=>s.bars.length<20))throw Error('Incomplete completed source frames: '+series.map(s=>s.timeframe+'='+s.bars.length).join(', '));
const read=analyze(series,'1m',input.settings),one=read.frames[6];
const source={id:input.provider,market:input.symbol,timeframe:'1m',snapshotAsOf:asof};
const evidence=taperEvidence(read,one.barData,source);evidence.bars=geometryTape(one.barData);
evidence.marketGeometry=marketGeometryEvidence(read,source);
evidence.volumeHistory={method:'taper.volume.v1',source:{provider:input.provider,symbol:input.symbol,completedCutoff:one.cutoff},bars:one.barData};
process.stdout.write(JSON.stringify({source:evidence.source,series,bars:one.barData,raw:read.raw,
 frames:evidence.frames,indicatorSettings:read.settings,method:read.method,evidence}));
