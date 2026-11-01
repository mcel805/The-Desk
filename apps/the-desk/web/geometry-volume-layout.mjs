// One shared margin lease per native chart, even with multiple study instances.
// Follow the latest price only while the user has not panned into history.
const margins=new WeakMap();
export const geometryMarginWidth=width=>Math.min(210,Math.max(112,width*.23));
export function reserveGeometryMargin(native,owner){
 const coords=native.coords,pitch=coords?.pxPerBar?.(),width=coords?.width;
 if(!(pitch>0&&width>0&&coords.barCount>0))return;
 const viewport=coords.getViewport();let lease=margins.get(native);
 if(!lease){lease={owners:new Set(),before:viewport.rightOffset,last:null,interval:coords.barInterval};margins.set(native,lease);}
 if(lease.interval!==coords.barInterval){lease.interval=coords.barInterval;lease.before=viewport.rightOffset;lease.last=null;}
 lease.owners.add(owner);
 const follows=viewport.rightOffset>=0,ours=lease.last!=null&&Math.abs(viewport.rightOffset-lease.last)<.001;
 if(!follows)return;
 const desired=geometryMarginWidth(width)/pitch;
 if((ours||lease.last===null&&viewport.rightOffset<desired)&&Math.abs(viewport.rightOffset-desired)>.001){if(lease.last===null)lease.before=viewport.rightOffset;native.applyViewport({...viewport,rightOffset:desired});lease.last=coords.getViewport().rightOffset;}
}
export function syncGeometryMargin(native,owner,eligible){
 if(eligible)reserveGeometryMargin(native,owner);else releaseGeometryMargin(native,owner);
}
export function releaseGeometryMargin(native,owner){
 const lease=margins.get(native);if(!lease)return;lease.owners.delete(owner);if(lease.owners.size)return;
 const coords=native.coords,viewport=coords.getViewport();
 if(lease.last!=null&&Math.abs(viewport.rightOffset-lease.last)<.001)native.applyViewport({...viewport,rightOffset:lease.before});
 margins.delete(native);
}
export function geometryCalloutLayout({width,height,priceX,priceY}){
 const left=priceX+18,available=width-left-10;
 // If the user pans away or removes the margin, use the bottom caption. Never
 // fall back to centering a box over the candles.
 if(!Number.isFinite(priceX)||!Number.isFinite(priceY)||priceX<0||available<90||height<240)return null;
 return {left,width:Math.min(192,available),top:Math.max(112,Math.min(height-126,priceY-18))};
}
