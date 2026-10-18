import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {liquidityDashesBuild} from '../web/pine-compat/liquidity-dashes-build.mjs';
import {fontPixelsBuild} from '../web/pine-compat/font-pixels-build.mjs';
import {buildChartMenuActions} from '../web/chart-menu-actions.mjs';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'liquidity-reset-'));
await build({stdin:{contents:"export {NativeRenderer,RendererControl} from '../../integrations/vela/dist/index.js';export {ChartCell} from '../../integrations/vela/dist/workspace.js';",resolveDir:process.cwd(),loader:'js'},outfile:path.join(dir,'reset.mjs'),bundle:true,platform:'node',format:'esm',plugins:[liquidityDashesBuild(fontPixelsBuild())]});
const {NativeRenderer,RendererControl,ChartCell}=await import(pathToFileURL(path.join(dir,'reset.mjs')).href);
test.after(()=>fs.rm(dir,{recursive:true,force:true}));
function fixture(width,n=600){
 const renderer=new NativeRenderer();
 renderer.coords.setSize(width,600,1);renderer.coords.setBars(Array.from({length:n},(_,i)=>i*60000));
 renderer.coords.setViewport({barSpacing:2,rightOffset:-50});
 renderer.scene.indicators.set('liq',{labels:[{deskLiquidityBadge:true}]});
 const pane={manualScale:{min:1,max:2}};renderer.scene.panes.set('price',pane);
 const scale={manualScale:{min:1,max:2}};renderer.scene.indicatorScales.set('other',scale);
 renderer.animator={stop(){}};renderer.scheduler={invalidate(){}};renderer.emitViewportChange=()=>{};
 let allCalls=0;
 const chart={renderer:new RendererControl(renderer),setVisibleRangePreset(){allCalls++}};
 const cell=Object.create(ChartCell.prototype);cell.inner=chart;
 const reset=buildChartMenuActions({chart,cell}).find(action=>action.id==='reset').run;
 return {renderer,pane,scale,reset,allCalls:()=>allCalls};
}
test('the real right-click menu resets through the adapted cell and renderer, with a clear label gutter and closer zoom',()=>{
 for(const width of [320,600,1200,1800]){
  const f=fixture(width);f.reset();
  const r=f.renderer,v=r.coords.getViewport(),pitch=r.coords.pxPerBar(),gutter=width-r.coords.logicalToX(r.coords.barCount-1);
  assert.equal(f.allCalls(),0,'reset must not select the ALL range');
  assert.ok(Math.abs(gutter-Math.min(230,width*.42))<1e-8);
  const visible=(width-gutter)/pitch+1;
  assert.ok(visible<=160.000001,'reset magnifies to at most 160 recent candles');
  assert.ok(pitch>=5,'reset candle pitch is readable even on narrow charts');
  assert.equal(f.pane.manualScale,null);assert.equal(f.scale.manualScale,null);
  const first={...v};r.coords.setViewport({barSpacing:1,rightOffset:0});f.reset();
  assert.deepEqual(r.coords.getViewport(),first,'repeated reset is deterministic after pan/zoom');
 }
});
test('short history keeps the latest candle and label column in view',()=>{
 const f=fixture(1200,8);f.reset();const r=f.renderer;
 assert.ok(r.coords.logicalToX(0)>=0);assert.ok(r.coords.logicalToX(7)<1200-200);
});
test('a cell on an unsupported renderer retains its original reset fallback',()=>{
 const calls=[],cell=Object.create(ChartCell.prototype);
 cell.inner={renderer:{set:(...args)=>calls.push(args),supports:()=>false},setVisibleRangePreset:p=>calls.push(p)};
 cell.resetView();assert.deepEqual(calls,[['autoScale',true],'ALL']);
});
