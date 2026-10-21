import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const badgeLayout=JSON.stringify(fileURLToPath(new URL('./liquidity-badge-layout.mjs',import.meta.url)));
function adaptGutter(contents){
 const method=/^[\t ]*(?:private )?computeScales\(\)(?:: void)? \{/m;
 if(!method.test(contents))return contents;
 for(const name of ['fitContent','reframeKeepZoom']){
  const marker=new RegExp('(^[\\t ]*(?:private )?'+name+'\\(\\)(?:: void)? \\{)','m');
  if(!marker.test(contents))throw Error('Pinned Vela viewport reset changed: '+name);
  contents=contents.replace(marker,'$1\n resetLiquidityGutter(this);');
 }
 // Expose the renderer's normal reset through a host-only feature so the cell
 // context menu and keyboard use the same framing policy.
 const features=/(features(?:\s*:\s*readonly string\[\])?\s*=\s*\[)/;
 if(!features.test(contents))throw Error('Pinned Vela feature list changed.');
 contents=contents.replace(features,"$1'deskResetView',");
 const apply=/(applyFeature\(key(?:: string)?, value(?:: unknown)?\)(?:: void)? \{)/;
 if(!apply.test(contents))throw Error('Pinned Vela feature dispatch changed.');
 contents=contents.replace(apply,"$1\n if(key==='deskResetView'){this.resetView();return;}");
 const reset=/(resetView\(\)(?:: void)? \{\s*)this\.fitContent\(\);/;
 if(!reset.test(contents))throw Error('Pinned Vela native reset changed.');
 contents=contents.replace(reset,'$1if(!resetLiquidityView(this))this.fitContent();');
 const scroll='this.glideRightOffset(this.scene.style.margins.right);';
 if(!contents.includes(scroll))throw Error('Pinned Vela scroll-to-latest changed.');
 contents=contents.replace(scroll,'this.glideRightOffset(liquidityDefaultRightOffset(this,this.scene.style.margins.right));');
 contents=contents.replace(method,match=>match+'\n syncLiquidityGutter(this);');
 return 'import {syncLiquidityGutter,resetLiquidityGutter,liquidityDefaultRightOffset,resetLiquidityView} from '+badgeLayout+';\n'+contents;
}
function adaptCellReset(contents){
 const reset=/(resetView\(\)(?:: void)? \{\s*this\.inner\?\.renderer\.set\(["']autoScale["'], true\);\s*)this\.inner\?\.setVisibleRangePreset\(["']ALL["']\);/;
 return contents.replace(reset,"$1if(this.inner?.renderer.supports('deskResetView'))this.inner.renderer.set('deskResetView',true);else this.inner?.setVisibleRangePreset('ALL');");
}
function adaptBadges(contents){
 const start=contents.search(/^[\t ]*(?:private )?drawLabels\(/m);
 if(start<0)return contents;
 const font='const fontPx = fontSizePx(lb.size);',at=contents.indexOf(font,start);
 if(at<0)throw Error('Pinned Vela label renderer changed; review the Liquidity badge adapter.');
 const end=at+font.length,body=contents.indexOf('{',start)+1;
 contents=contents.slice(0,end)+'\n if(lb.deskLiquidityBadge){const placed=deskBadgeRows.get(lb);if(placed===undefined)continue;drawLiquidityConnector(ctx,lb,deskLiquidityLabelLineEnd,px,py,placed,this.labelFont(lb,fontPx));py=placed;}'+contents.slice(end);
 contents=contents.slice(0,body)+'\n const deskBadgeRows=layoutLiquidityBadges(this.set.labels,yOf,lb=>fontSizePx(lb.size),H);\n const deskLiquidityLabelLineEnd=liquidityLineEnd(ctx,this.set.labels,W,lb=>this.labelFont(lb,fontSizePx(lb.size)));'+contents.slice(body);
 const labelX='const px = xOf(this.logicalOf(lb.xloc, lb.x));';
 if(!contents.includes(labelX))throw Error('Pinned Vela label X changed.');
 contents=contents.replace(labelX,'const px = lb.deskLiquidityBadge ? liquidityBadgeX(W) : xOf(this.logicalOf(lb.xloc, lb.x));');
 const drawLines=/^[\t ]*(?:private )?drawLines\([^\n]*\{\s*$/m;
 if(!drawLines.test(contents))throw Error('Pinned Vela line renderer changed.');
 contents=contents.replace(drawLines,match=>match+'\n const deskLiquidityLineEnd=liquidityLineEnd(ctx,this.set.labels,W,lb=>this.labelFont(lb,fontSizePx(lb.size)));');
 const lineX='const x2 = xOf(this.logicalOf(ln.xloc, ln.x2));';
 if(!contents.includes(lineX))throw Error('Pinned Vela line endpoint changed.');
 contents=contents.replace(lineX,'const x2 = ln.deskLiquidityRightEdge ? deskLiquidityLineEnd : xOf(this.logicalOf(ln.xloc, ln.x2));\n if(ln.deskLiquidityRightEdge && x1>x2) continue;');
 const afterLine='const p2Right = x2 >= x1;';
 if(!contents.includes(afterLine))throw Error('Pinned Vela line decoration changed.');
 const bubble='const r = this.drawBubble(ctx, lb, px, py, fontPx, color);';
 if(!contents.includes(bubble))throw Error('Pinned Vela bubble renderer changed.');
 contents=contents.replace(bubble,'const r = lb.deskLiquidityBadge ? drawLiquidityBadge(ctx,lb,px,py,this.labelFont(lb,fontPx),fontPx) : this.drawBubble(ctx, lb, px, py, fontPx, color);');
 return 'import {layoutLiquidityBadges,drawLiquidityConnector,drawLiquidityBadge,liquidityBadgeX,liquidityLineEnd} from '+badgeLayout+';\n'+contents;
}
const needle='ctx.setLineDash(dashPattern(ln.style, ln.width));';
const replacement='ctx.setLineDash(ln.deskDashPattern ?? dashPattern(ln.style, ln.width));';
// Compose with the existing font adapter so both transformations reach the
// same pinned renderer module without modifying the upstream checkout.
export function liquidityDashesBuild(base){return {name:'desk-liquidity-dashes',setup(build){
 const adapt=callback=>async args=>{const result=await callback(args);if(result?.contents&&/[/\\]vela[/\\]/.test(args.path))return {...result,contents:adaptCellReset(adaptGutter(adaptBadges(String(result.contents).replace(needle,replacement))))};return result;};
 if(base)base.setup({...build,onLoad:(options,callback)=>build.onLoad(options,adapt(callback))});
 else build.onLoad({filter:/[/\\]vela[/\\]dist[/\\].*\.js$/},adapt(async({path})=>({contents:await fs.readFile(path,'utf8'),loader:'js'})));
 build.onLoad({filter:/[/\\]vela[/\\]src[/\\]renderers[/\\]shared[/\\]DrawingSceneRenderer\.ts$/},adapt(async({path})=>({contents:await fs.readFile(path,'utf8'),loader:'ts'})));
}};}
