import {checkPineSource} from './pine-validation.mjs';
export function renameSynthSource(source){
 source=source.replace('indicator("Market Cipher A · Desk Reconstruction", shorttitle="Cipher A · Desk"','indicator("Agentic - Market Synth A", shorttitle="Market Synth A"');
 source=source.replace('indicator("Market Cipher B · Desk Reconstruction", shorttitle="Cipher B · Desk"','indicator("Agentic Market Synth B", shorttitle="Market Synth B"');
 return source;
}
export function isSavedPine(h){return Boolean(h.source)&&typeof h.id==='string'&&!h.id.startsWith('pine-test-');}
export function pineState(chart,name=h=>h.title){return chart.indicators().filter(isSavedPine).map(h=>({id:h.id,name:name(h),script:h.source,language:'pine',inputs:h.inputValues(),props:h.propValues(),hidden:!h.visible}));}
export function restorePineState(payload,ctx){
 if(!Array.isArray(payload)||payload.length>6)return;
 const entries=payload.filter(e=>e&&typeof e.id==='string'&&!e.id.startsWith('pine-test-')&&typeof e.name==='string'&&typeof e.script==='string');
 for(const h of ctx.chart.indicators().filter(h=>h.source))h.remove();
 for(const entry of entries){try{const script=renameSynthSource(entry.script);checkPineSource(script);const name=script!==entry.script?script.match(/indicator\("([^"\n]+)"/)[1]:entry.name;ctx.addIndicator({...entry,script,name,language:'pine'});}catch(e){console.warn('Pine restore rejected:',e.message);}}
}
