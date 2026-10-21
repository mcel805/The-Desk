import test from 'node:test';
import assert from 'node:assert/strict';
import {liquidityDisplayModel} from '../web/pine-compat/liquidity-display.mjs';
import {layoutLiquidityBadges,drawLiquiditySharedMarker,drawLiquiditySharedOutline,liquiditySharedPurple} from '../web/pine-compat/liquidity-badge-layout.mjs';

test('all 48 crowded badges get a position; offscreen levels do not consume space',()=>{
 const labels=Array.from({length:48},(_,i)=>({deskLiquidityBadge:true,y:100+i*.01}));
 const outside={deskLiquidityBadge:true,y:-20};
 const result=layoutLiquidityBadges([...labels,outside],v=>v,()=>10,400);
 assert.equal(result.size,48);assert.equal(result.has(outside),false);
 const ys=[...result.values()];assert.ok(ys.every(y=>y>=0&&y<=400));
 assert.ok(ys.every((y,i)=>!i||y>ys[i-1]));
 assert.equal(layoutLiquidityBadges(labels,v=>null,()=>10,400).size,0);
});
test('shared tags mark every matching source line; unrelated sides and single-source lines stay plain',()=>{
 const line=(id,p,color='#66BB6AEB')=>({id,y1:p,y2:p,x1:1,x2:20,color,style:'solid',width:2});
 const badge=(id,y,span,sources,color='#66BB6AA6')=>({id,x:20,y,text:'15 · 20/100',color,tooltip:`Shared sources: ${sources}. Exact source-price span ${span[0]} to ${span[1]}.`});
 const result=liquidityDisplayModel({inputValues:{displayView:'Clean'},lines:[line('a',100),line('b',100.5),line('other-side',100,'#AA2430EB'),line('single',110)],labels:[badge('shared',100.25,[100,100.5],2),badge('single',110,[110,110],1)]});
 assert.equal(result.labels[0].deskLiquidityShared,true);assert.equal(result.labels[1].deskLiquidityShared,false);
 assert.deepEqual(result.lines.filter(l=>l.deskLiquidityShared).map(l=>l.id),['a','b']);
 assert.deepEqual(result.lines.map(l=>l.y1),[100,100.5,100,110]);
});
test('purple micro 1x marker and purple tag outline reach the canvas',()=>{
 const trace=[];
 const ctx=new Proxy({fillText(text,x,y){trace.push({text,x,y,color:this.fillStyle,font:this.font});},stroke(){trace.push({stroke:this.strokeStyle});}}, {get:(o,k)=>k in o?o[k]:()=>{}});
 drawLiquiditySharedMarker(ctx,200,50);
 drawLiquiditySharedOutline(ctx,{deskLiquidityShared:true},{x:210,y:40,w:80,h:20});
 assert.ok(trace.some(t=>t.text==='1×'&&t.font==='6px sans-serif'&&t.x===200));
 assert.ok(trace.some(t=>t.stroke===liquiditySharedPurple));
 const before=trace.length;drawLiquiditySharedOutline(ctx,{},{});assert.equal(trace.length,before);
});
