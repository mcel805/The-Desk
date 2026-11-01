import {MarketGeometryWorker} from './market-geometry-worker.mjs';
import {geometryCalculationOptions} from './market-geometry-model.mjs';
import {gvCalculationOptions,GV_DEFAULTS} from './geometry-volume-evidence.mjs';
import {geometryVolumeDrawing} from './geometry-volume-drawing.mjs';
export const GV_SOURCE_HASH='e19f1da68fd4bf2b85d174a8bd0de874d8a20e1648c02bbd679ef3385b2126ba';
export const isGeometryVolumeSource=s=>typeof s==='string'&&s.includes('indicator("Agentic - Geometry - Volume",')&&s.includes('// Desk Geometry Volume v1.');
export class GeometryVolumeWorker extends MarketGeometryWorker {
 async prepare(source,id,meta={}){const prepared=await super.prepare(source,id,meta);if(prepared.geometryHosted){const hidden=new Set(['geometryMode','geometryPresentation','microPivot','showChannels','showProjection','showTurnHistory','geometryShown','geometryActiveShown','geometryActiveInk','geometryBrokenInk','geometryShowBroken','geometryShowLabels']);prepared.inputs=prepared.inputs.filter(s=>!hidden.has(s.key));}return prepared;} 
 constructor(options={}){super({...options,threadFactory:options.threadFactory||(()=>new Worker(new URL('./geometry-volume-thread.mjs',import.meta.url),{type:'module'})),profile:{sourceHash:GV_SOURCE_HASH,sourceDepthFor:inputs=>tf=>tf==='1'?1600:geometryCalculationOptions(inputs).geometryHistory,calculationOptions:inputs=>({...geometryCalculationOptions(inputs),...gvCalculationOptions(inputs)}),drawing:geometryVolumeDrawing,events:r=>r.geometryVolume.strategy.events,customKeys:Object.keys(GV_DEFAULTS),scopeWarning:'Edited Geometry Volume source runs its own chart-local Pine; the combined multi-timeframe strategy is inactive. Restore the catalog source for the hosted study.'}});}
}
