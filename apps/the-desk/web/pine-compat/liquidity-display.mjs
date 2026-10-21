// Tag only verified Liquidity presentation objects; source prices and times stay intact.
export function liquidityDisplayModel(model){
 const labels=model.labels?.map(label=>{
  if(!/^\S+ · \d+\/100$/.test(label.text)&&label.text!=='1m structure')return label;
  const span=/Exact source-price span (-?\d+(?:\.\d+)?(?:e[+-]?\d+)?) to (-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/.exec(label.tooltip||'');
  const sources=Number(/Shared sources: (\d+)/.exec(label.tooltip||'')?.[1]||1);
  return {...label,deskLiquidityBadge:true,
   deskLiquidityShared:sources>1||label.text.split(' · ')[0].includes('+'),
   deskLiquiditySpan:span?[Number(span[1]),Number(span[2])]:[label.y,label.y]};
 });
 const ends=new Set(labels?.filter(label=>label.deskLiquidityBadge).map(label=>label.x));
 const clean=model.inputValues?.displayView==='Clean'||labels?.some(label=>/^\S+ · \d+\/100$/.test(label.text));
 const activeEnds=clean?model.lines.filter(line=>line.style==='solid'&&line.width===2).map(line=>line.x2):[];
 const mainEnd=activeEnds.length?Math.max(...activeEnds):null;
 const lines=model.lines.map(line=>({...line,
  ...(line.style==='dashed'&&line.width===1?{deskDashPattern:[5,6]}:{}),
  ...(ends.has(line.x2)?{deskLiquidityRightEdge:true}:{}),
  ...(clean&&line.style==='solid'&&line.width===2&&labels?.some(label=>label.deskLiquidityShared&&label.x===line.x2&&
   label.color?.slice(0,7).toLowerCase()===line.color?.slice(0,7).toLowerCase()&&
   line.y1>=label.deskLiquiditySpan[0]-1e-8&&line.y1<=label.deskLiquiditySpan[1]+1e-8)?{deskLiquidityShared:true}:{})}));
 // Clean main levels are lines only. Keep the short, separate swing pools.
 const boxes=model.boxes?.filter(box=>!clean||box.right!==mainEnd);
 return {...model,...(labels?{labels}:{}),...(boxes?{boxes}:{}),lines};
}
