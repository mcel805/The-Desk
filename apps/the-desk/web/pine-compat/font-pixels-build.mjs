// Preserve numeric Pine label sizes through the adapter and canvas renderer.
// These build-time host fixes do not modify any supplied Pine source.
import fs from 'node:fs/promises';
export function fontPixelsBuild(){return {name:'desk-pine-font-pixels',setup(build){
 build.onLoad({filter:/[/\\]dist[/\\].*\.js$/},async({path})=>{
  if(!/[/\\](?:vela|vela-pinets)[/\\]/.test(path))return;
  let contents=await fs.readFile(path,'utf8');
  if(path.includes('vela-pinets'))contents=contents.replace('function normLabelSize(raw) {\n  if (typeof raw === "number" && Number.isFinite(raw)) return nearestNamedSize(raw);','function normLabelSize(raw) {\n  if (typeof raw === "number" && Number.isFinite(raw)) return raw;');
  else contents=contents.replace(/function namedFontSize\((\w+)\) \{/g,(_,name)=>`function namedFontSize(${name}) {\n if(typeof ${name} === 'number' && Number.isFinite(${name})) return ${name};`);
  return {contents,loader:'js'};
 });
}};}
