import test from 'node:test';
import assert from 'node:assert/strict';
import {liquidityDisplayModel} from '../web/pine-compat/liquidity-display.mjs';
import {layoutLiquidityBadges,drawLiquidityBadge,liquidityLineEnd} from '../web/pine-compat/liquidity-badge-layout.mjs';

test('all 48 crowded badges get a position; offscreen levels do not consume space',()=>{
 const labels=Array.from({length:48},(_,i)=>({deskLiquidityBadge:true,y:100+i*.01}));
 const outside={deskLiquidityBadge:true,y:-20};
 const result=layoutLiquidityBadges([...labels,outside],v=>v,()=>10,400);
 assert.equal(result.size,48);assert.equal(result.has(outside),false);
 const ys=[...result.values()];assert.ok(ys.every(y=>y>=0&&y<=400));
 assert.ok(ys.every((y,i)=>!i||y>ys[i-1]));
 assert.equal(layoutLiquidityBadges(labels,v=>null,()=>10,400).size,0);
});
test('score-only tags identify every line in their exact source span without shared highlighting',()=>{
 const line=(id,p,color='#66BB6AEB')=>({id,y1:p,y2:p,x1:1,x2:20,color,style:'solid',width:2});
 const badge=(id,y,span)=>({id,x:20,y,text:'71/100',color:'#66BB6AA6',tooltip:`Exact source-price span ${span[0]} to ${span[1]}.`});
 const result=liquidityDisplayModel({inputValues:{displayView:'Clean'},lines:[line('a',100),line('b',100.5),line('other-side',100,'#AA2430EB'),line('single',110)],labels:[badge('shared',100.25,[100,100.5]),badge('single',110,[110,110])]});
 assert.deepEqual(result.labels.map(l=>l.text),['71/100','71/100']);
 assert.deepEqual(result.labels.map(l=>l.deskLiquidityBadge),[true,true]);
 assert.ok(result.labels.every(l=>!('deskLiquidityShared' in l)));
 assert.ok(result.lines.every(l=>!('deskLiquidityShared' in l)));
 assert.deepEqual(result.lines.map(l=>l.y1),[100,100.5,100,110]);
});
test('tags paint as white-bordered rectangles with no purple shared decoration',()=>{
 const trace=[];
 const ctx=new Proxy({measureText:text=>({width:text.length*6}),fillRect(...rect){trace.push({fill:this.fillStyle,rect});},strokeRect(...rect){trace.push({stroke:this.strokeStyle,width:this.lineWidth,rect});},fillText(text,x,y){trace.push({text,x,y,color:this.fillStyle});}}, {get:(o,k)=>k in o?o[k]:()=>{}});
 const rect=drawLiquidityBadge(ctx,{text:'71/100',color:'#243040',textColor:'#FFFFFF'},288,50,'10px sans-serif',10);
 assert.deepEqual(trace[0].rect,[rect.x,rect.y,rect.w,rect.h]);
 assert.equal(trace[1].stroke,'#FFFFFF');assert.equal(trace[1].width,1);
 assert.equal(trace[2].text,'71/100');assert.equal(trace[2].x,288-7-rect.w/2);
 const lineEnd=liquidityLineEnd({font:'10px sans-serif',measureText:text=>({width:text.length*6})},[{deskLiquidityBadge:true,text:'71/100'}],300,()=> '10px sans-serif');
 assert.equal(rect.x-lineEnd,8,'line connector ends eight pixels before the tag');
});
