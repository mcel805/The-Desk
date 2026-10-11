import {checkPineSource} from './pine-validation.mjs';
export function isSavedPine(h){return Boolean(h.source)&&typeof h.id==='string'&&!h.id.startsWith('pine-test-');}
export function pineState(chart,name=h=>h.title){return chart.indicators().filter(isSavedPine).map(h=>({id:h.id,name:name(h),script:h.source,language:'pine',inputs:h.inputValues(),props:h.propValues(),hidden:!h.visible}));}
export function restorePineState(payload,ctx){
 if(!Array.isArray(payload)||payload.length>6)return;
 const entries=payload.filter(e=>e&&typeof e.id==='string'&&!e.id.startsWith('pine-test-')&&typeof e.name==='string'&&typeof e.script==='string');
 for(const h of ctx.chart.indicators().filter(h=>h.source))h.remove();
 for(const entry of entries){try{checkPineSource(entry.script);ctx.addIndicator({...entry,language:'pine'});}catch(e){console.warn('Pine restore rejected:',e.message);}}
}
