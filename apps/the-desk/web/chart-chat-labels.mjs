// Imported drawing styles are data, never HTML or attribute syntax.
export function paintLiquidityLabels(overlay,drawings,{priceToY,top,bottom}){
 const placed=[],nodes=[];
 for(const d of drawings){
  if(d.visible===false||d.type!=='hray'||!d.text?.value?.startsWith('Desk AI · '))continue;
  const label=d.text.value.split(' · ').at(-1),rank=Number(label.match(/^#(\d+)/)?.[1]);
  if(!rank||rank>6)continue;
  const price=d.anchors?.[0]?.price,y=priceToY(price);
  if(!Number.isFinite(price)||!Number.isFinite(y)||y<top||y>bottom||placed.some(v=>Math.abs(v-y)<18))continue;
  const node=overlay.ownerDocument.createElement('span');
  node.style.top=y+'px';node.style.color=d.style?.lineColor||'';
  node.textContent=label.replace(/Buy-side|Sell-side/g,'').trim();
  placed.push(y);nodes.push(node);
 }
 overlay.replaceChildren(...nodes);
}
