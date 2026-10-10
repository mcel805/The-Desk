import test from 'node:test';
import assert from 'node:assert/strict';
import {STORAGE_KEY,DEFAULT_CANDLES,normalizeCandles,loadCandles,saveCandles,candleConfig,applyCandles} from './chart-candle-style.mjs';

test('new browsers receive green/red fills with white borders and wicks', () => {
  const style=loadCandles({getItem:()=>null});
  assert.equal(style.upFill,'#4caf50'); assert.equal(style.downFill,'#f23645');
  for(const k of ['upBorder','downBorder','upWick','downWick']) assert.equal(style[k],'#ffffff');
});
test('colors and hidden candle components survive a saved round trip', () => {
  const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
  const expected=normalizeCandles({...DEFAULT_CANDLES,upFill:'#ABCDEF',wicksVisible:false,bodyVisible:false});
  saveCandles(storage,expected); assert.deepEqual(loadCandles(storage),expected);
  assert.equal(data.size,1); assert.ok(data.has(STORAGE_KEY));
});
test('corrupt, unavailable, and invalid stored settings recover safely', () => {
  assert.deepEqual(loadCandles({getItem:()=>'{bad'}),DEFAULT_CANDLES);
  assert.deepEqual(loadCandles({getItem:()=>{throw Error('storage unavailable');}}),DEFAULT_CANDLES);
  assert.deepEqual(normalizeCandles({upFill:'<script>',bodyVisible:'false'}),DEFAULT_CANDLES);
  assert.deepEqual(normalizeCandles([]),DEFAULT_CANDLES);
});
test('failed persistence is reported to the caller rather than silently accepted', () => {
  assert.throws(()=>saveCandles({setItem:()=>{throw Error('quota');}},DEFAULT_CANDLES),/quota/);
});
test('only candle cosmetics are changed and root and per-type styles agree', () => {
  const config=candleConfig({...DEFAULT_CANDLES,upFill:'#ffffff',bordersVisible:false});
  assert.deepEqual(Object.keys(config),['candles','chartTypes']);
  assert.equal(config.candles.upColor,config.chartTypes.candles.candleUpColor);
  assert.equal(config.candles.borderVisible,false);
  assert.equal(config.chartTypes.candles.candleBorderVisible,false);
});
test('application detects an unavailable or non-applying renderer', () => {
  assert.equal(applyCandles(null,DEFAULT_CANDLES),false);
  assert.equal(applyCandles({renderer:{applyConfig(){},getConfig:()=>({})}},DEFAULT_CANDLES),false);
});
