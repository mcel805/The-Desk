// Tag only verified Liquidity presentation objects; source prices and times stay intact.
export function liquidityDisplayModel(model){
 const labels=model.labels?.map(label=>/^\S+ · \d+\/100$/.test(label.text)||label.text==='1m structure'?{...label,deskLiquidityBadge:true}:label);
 const ends=new Set(labels?.filter(label=>label.deskLiquidityBadge).map(label=>label.x));
 const clean=model.inputValues?.displayView==='Clean'||labels?.some(label=>/^\S+ · \d+\/100$/.test(label.text));
 const activeEnds=clean?model.lines.filter(line=>line.style==='solid'&&line.width===2).map(line=>line.x2):[];
 const mainEnd=activeEnds.length?Math.max(...activeEnds):null;
 const lines=model.lines.map(line=>({...line,
  ...(line.style==='dashed'&&line.width===1?{deskDashPattern:[5,6]}:{}),
  ...(ends.has(line.x2)?{deskLiquidityRightEdge:true}:{})}));
 // Clean main levels are lines only. Keep the short, separate swing pools.
 const boxes=model.boxes?.filter(box=>!clean||box.right!==mainEnd);
 return {...model,...(labels?{labels}:{}),...(boxes?{boxes}:{}),lines};
}
