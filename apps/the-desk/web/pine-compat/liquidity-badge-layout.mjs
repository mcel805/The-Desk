// Reserve one compact Liquidity badge at its real pane Y coordinate. Price
// coordinates never move; zooming simply changes which badges fit on screen.
export function reserveLiquidityBadge(rows,y,fontPx,height){
 if(!Number.isFinite(y)||!Number.isFinite(fontPx))return false;
 const half=fontPx*0.625+4,top=y-half,bottom=y+half;
 if(top<0||bottom>height)return false;
 if(rows.some(r=>top<r.bottom+4&&bottom>r.top-4))return false;
 rows.push({top,bottom});return true;
}

// CSS-pixel gutter: independent of timeframe, candle pitch and device pixel ratio.
export const liquidityBadgeX=width=>Math.max(0,width-12);
// Reserve the full measured badge column plus a ten-pixel reading gap.
// All live lines share this stop, including levels whose badges were culled.
export function liquidityLineEnd(ctx,labels,width,fontOf){
 const font=ctx.font;
 let textWidth=0;
 for(const label of labels){
  if(!label.deskLiquidityBadge)continue;
  ctx.font=fontOf(label);
  for(const line of (label.text??'').split('\n'))textWidth=Math.max(textWidth,ctx.measureText(line).width);
 }
 ctx.font=font;
 return Math.max(0,liquidityBadgeX(width)-7-12-textWidth-10);
}
export const liquidityGutterPixels=width=>Math.min(230,Math.max(0,width)*.42);
const gutters=new WeakMap();
const hasBadges=renderer=>Array.from(renderer.scene.indicators.values()).some(model=>model.labels?.some(label=>label.deskLiquidityBadge));
export function resetLiquidityGutter(renderer){gutters.delete(renderer);}
export function liquidityDefaultRightOffset(renderer,offset){
 const pitch=renderer.coords.pxPerBar();
 return hasBadges(renderer)&&pitch>0?Math.max(offset,liquidityGutterPixels(renderer.coords.width)/pitch):offset;
}
export function syncLiquidityGutter(renderer){
 const coords=renderer.coords,viewport=coords.getViewport(),width=coords.width,pitch=coords.pxPerBar();
 const enabled=hasBadges(renderer),previous=gutters.get(renderer);
 let offset=viewport.rightOffset;
 if(enabled&&pitch>0&&coords.barCount>0){
  const gutter=liquidityGutterPixels(width);
  const pinned=previous?.enabled&&Math.abs(previous.offset*previous.pitch-liquidityGutterPixels(previous.width))<2;
  const geometryChanged=previous&&(previous.width!==width||previous.pitch!==pitch);
  if((!previous?.enabled&&offset>=0)||(pinned&&geometryChanged)){
   offset=(!previous?.enabled?Math.max(offset*pitch,gutter):gutter)/pitch;
   coords.setViewport({...viewport,rightOffset:offset});
   // Keep a zoom animation anchored on the latest candle at the gutter boundary.
   // A drag/pan at constant pitch never enters this branch.
   if(pinned&&previous.pitch!==pitch){
    renderer.zoomAnchorLogical=coords.barCount-1;
    renderer.zoomAnchorX=width-gutter;
   }
  }
 }
 gutters.set(renderer,{enabled,width,pitch,offset});
 return offset;
}

// A reset frames recent candles with a readable pitch, rather than fitting ALL
// loaded history. Leave ordinary charts on their renderer's standard reset.
export function resetLiquidityView(renderer){
 const coords=renderer.coords,width=coords.width,n=coords.barCount;
 if(!hasBadges(renderer)||n<1||width<=0)return false;
 renderer.animator?.stop();
 renderer.panVelocity=0;
 renderer.scrollTargetRO=null;
 for(const pane of renderer.scene.panes.values())pane.manualScale=null;
 for(const scale of renderer.scene.indicatorScales.values())scale.manualScale=null;
 const gutter=liquidityGutterPixels(width),available=width-gutter;
 const candles=Math.min(n,160,Math.max(30,Math.floor(available/5)));
 const pitch=available/Math.max(1,candles-1);
 const viewport=renderer.clampViewport(pitch/coords.spacingScale,gutter/pitch);
 coords.setViewport(viewport);
 renderer.targetBarSpacing=viewport.barSpacing;
 resetLiquidityGutter(renderer);
 return true;
}
