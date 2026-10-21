export const liquiditySharedPurple='#B388FF';
// Lay out every on-screen badge. Displace text, never its actual source price.
// Extremely dense panes compress spacing rather than dropping any badge.
export function layoutLiquidityBadges(labels,yOf,fontOf,height){
 const rows=labels.filter(l=>l.deskLiquidityBadge&&!l.invisible).map(label=>({label,y:yOf(label.y),half:fontOf(label)*.625+4}))
  .filter(r=>Number.isFinite(r.y)&&r.y>=0&&r.y<=height).sort((a,b)=>a.y-b.y);
 const placed=new Map();
 if(!rows.length)return placed;
 const half=Math.max(...rows.map(r=>r.half)),low=Math.min(half,height/2),high=Math.max(low,height-half);
 const gap=rows.length>1?Math.min(2*half+4,(high-low)/(rows.length-1)):0;
 for(let i=0;i<rows.length;i++)rows[i].placed=Math.max(low,rows[i].y,i?rows[i-1].placed+gap:low);
 rows.at(-1).placed=Math.min(high,rows.at(-1).placed);
 for(let i=rows.length-2;i>=0;i--)rows[i].placed=Math.min(rows[i].placed,rows[i+1].placed-gap);
 for(const row of rows)placed.set(row.label,row.placed);
 return placed;
}
export function drawLiquidityConnector(ctx,label,lineEnd,x,from,to,font){
 if(Math.abs(from-to)<.5)return;
 ctx.save();ctx.font=font;
 const textWidth=Math.max(1,...(label.text||'').split('\n').map(t=>ctx.measureText(t).width));
 const left=x-7-12-textWidth;
 ctx.strokeStyle=label.deskLiquidityShared?liquiditySharedPurple:'#8D96A6';ctx.lineWidth=.75;ctx.setLineDash([]);
 ctx.beginPath();ctx.moveTo(lineEnd+(label.deskLiquidityShared?6:0),from);ctx.lineTo(left,to);ctx.stroke();ctx.restore();
}
export function drawLiquiditySharedMarker(ctx,x,y){
 ctx.save();ctx.setLineDash([]);ctx.fillStyle=liquiditySharedPurple;
 ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fill();
 ctx.font='6px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#160F25';ctx.fillText('1×',x,y+.25);ctx.restore();
}
export function drawLiquiditySharedOutline(ctx,label,r){
 if(!label.deskLiquidityShared)return;
 ctx.save();ctx.strokeStyle=liquiditySharedPurple;ctx.lineWidth=1;ctx.setLineDash([]);
 ctx.beginPath();ctx.roundRect(r.x-.5,r.y-.5,r.w+1,r.h+1,4);ctx.stroke();ctx.restore();
}

// CSS-pixel gutter: independent of timeframe, candle pitch and device pixel ratio.
export const liquidityBadgeX=width=>Math.max(0,width-12);
// Reserve the full measured badge column plus a ten-pixel reading gap.
// All live lines share this stop; the gap leaves room for shared-source dots.
export function liquidityLineEnd(ctx,labels,width,fontOf){
 const font=ctx.font;
 let textWidth=0;
 for(const label of labels){
  if(!label.deskLiquidityBadge)continue;
  ctx.font=fontOf(label);
  for(const line of (label.text??'').split('\n'))textWidth=Math.max(textWidth,ctx.measureText(line).width);
 }
 ctx.font=font;
 return Math.max(0,liquidityBadgeX(width)-7-12-textWidth-14);
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
