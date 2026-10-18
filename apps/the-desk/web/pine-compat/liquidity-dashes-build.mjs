import fs from 'node:fs/promises';
const needle='ctx.setLineDash(dashPattern(ln.style, ln.width));';
const replacement='ctx.setLineDash(ln.deskDashPattern ?? dashPattern(ln.style, ln.width));';
// Compose with the existing font adapter so both transformations reach the
// same pinned renderer module without modifying the upstream checkout.
export function liquidityDashesBuild(base){return {name:'desk-liquidity-dashes',setup(build){
 const adapt=callback=>async args=>{const result=await callback(args);if(result?.contents&&/[/\\]vela[/\\]/.test(args.path))return {...result,contents:String(result.contents).replace(needle,replacement)};return result;};
 if(base)base.setup({...build,onLoad:(options,callback)=>build.onLoad(options,adapt(callback))});
 else build.onLoad({filter:/[/\\]vela[/\\]dist[/\\].*\.js$/},adapt(async({path})=>({contents:await fs.readFile(path,'utf8'),loader:'js'})));
 build.onLoad({filter:/[/\\]vela[/\\]src[/\\]renderers[/\\]shared[/\\]DrawingSceneRenderer\.ts$/},adapt(async({path})=>({contents:await fs.readFile(path,'utf8'),loader:'ts'})));
}};}
