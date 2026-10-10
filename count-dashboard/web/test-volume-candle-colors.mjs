import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CANDLES,syncVolumeCandles} from './chart-candle-style.mjs';
import {registerTaperVolume,volumeBarColor} from './taper-volume.mjs';

test('volume defaults follow candle direction, including flat candles',()=>{
  assert.equal(volumeBarColor({open:10,close:11}),DEFAULT_CANDLES.upFill);
  assert.equal(volumeBarColor({open:10,close:9}),DEFAULT_CANDLES.downFill);
  assert.equal(volumeBarColor({open:10,close:10}),DEFAULT_CANDLES.upFill);
  assert.equal(volumeBarColor({open:10,close:11},{upColor:'#ffffff'}),'#ffffff');
});
test('the registered indicator emits candle-colored columns without default candle overlays',()=>{
  let definition;
  globalThis.window={Vela:{nativeIndicatorTypes:()=>[],registerNativeIndicator:d=>{definition=d;}}};
  try {
    registerTaperVolume();
    const inputs=definition.defaultInputs();
    assert.equal(inputs.mode,'Volume');assert.equal(inputs.colorMode,'Candles');assert.equal(inputs.outlines,false);
    const end=Math.floor(Date.now()/60000)*60000-60000;
    const bars=[{time:end-120000,open:10,high:12,low:9,close:11,volume:20},{time:end-60000,open:11,high:12,low:9,close:10,volume:30},{time:end,open:10,high:11,low:9,close:10,volume:15}];
    let output;
    const instance=definition.create();
    instance.start({timeframe:'1m',bars:()=>bars,emit:o=>output=o,setStatus(){}},{...inputs,upColor:'#ffffff',downColor:'#ff0000'});
    assert.deepEqual(output.series.find(s=>s.id==='tv-volume').points.map(p=>p.color),['#ffffff','#ff0000','#ffffff']);
    assert.equal(output.series.some(s=>s.kind==='candle'),false);
    instance.setInputs({...inputs,colorMode:'Signals',outlines:true});
    assert.equal(output.series.some(s=>s.id==='tv-outlines'),true);
  } finally {delete globalThis.window;}
});
test('changing candles updates existing volume inputs without resetting the calculation mode',()=>{
  let inputs={mode:'RelativeVolume',colorMode:'Candles',upColor:'#000000',downColor:'#000000'};
  const handle={nativeType:'taper-volume',inputValues:()=>inputs,setInputs:patch=>{inputs={...inputs,...patch};}};
  syncVolumeCandles({indicators:()=>[handle]},{...DEFAULT_CANDLES,upFill:'#ffffff'});
  assert.equal(inputs.upColor,'#ffffff');assert.equal(inputs.downColor,DEFAULT_CANDLES.downFill);assert.equal(inputs.mode,'RelativeVolume');
  inputs.colorMode='Signals';inputs.upColor='#000000';syncVolumeCandles({indicators:()=>[handle]},DEFAULT_CANDLES);
  assert.equal(inputs.upColor,'#000000');
});
