import test from 'node:test';
import assert from 'node:assert/strict';
import {volumePanelHTML} from '../web/swing-volume-panel.mjs';
import {volumeAtEntry} from '../web/swing-evidence.mjs';
const entry=180000,feature={version:'swing-volume.1',status:'READY',source:{symbol:'<script>unsafe</script>',completed_cutoff:120000,processed_bars:100,gap_resets:0},candidate_legs:[],recent:[],latest:{time:60000,known_at:120000,a:{ribbon:'bear',ema:[],width_atr:.5,signals:[]},b:{main:-50,signal:-55,fast:5,flow_proxy:-10,rsi:30,stoch_k:40,stoch_d:35,signals:[]},volume:{raw:10,relative:2,cmf:-.5,mfi:20,body_pressure:-.5},tags:['high_volume_lower_rejection']}};
const row=(at=130000)=>({id:'p',at,state:{market_synth:feature},response:null});
test('missing historical evidence stays unavailable and HTML is escaped',()=>{
 assert.match(volumePanelHTML(null),/not present/);
 const html=volumePanelHTML(feature);assert.ok(!html.includes('<script>'));assert.match(html,/&lt;script&gt;/);
 assert.match(html,/Unavailable for this snapshot/);assert.match(html,/Neither A nor B reads volume/);
});
test('entry features reject future, stale and late-model evidence without requiring Jev on',()=>{
 assert.equal(volumeAtEntry([row()],entry,100000).volume_regime,'HIGH');
 assert.equal(volumeAtEntry([row(entry)],entry,100000),null);
 assert.equal(volumeAtEntry([row(100000)],entry,0),null);
 assert.equal(volumeAtEntry([{...row(),state:{market_synth:{...feature,source:{completed_cutoff:140000}}}}],entry,0),null);
 assert.equal(volumeAtEntry([{...row(),state:{market_synth:{...feature,status:'WARMUP'}}}],entry,0),null);
 const late={...row(),response:{status:'AVAILABLE',received_at:entry+1,answers:{volume_pattern:{choice:'down_swing_exhaustion'}}}};
 assert.equal(volumeAtEntry([late],entry,0).jev_pattern,'UNAVAILABLE');
 late.response.received_at=entry-1;
 assert.equal(volumeAtEntry([late],entry,0).jev_pattern,'down_swing_exhaustion');
});
