async () => {
 if(location.origin!=='http://127.0.0.1:18890')throw Error('Isolated Desk preview required');
 const assert=(value,message)=>{if(!value)throw Error(message);};
 const wait=async fn=>{for(let i=0;i<240;i++){const value=fn();if(value)return value;await new Promise(r=>setTimeout(r,500));}throw Error('Liquidity model timed out');};
 const {registerStatePersistence}=await import('/vendor/vela.js');
 const contexts=[];
 const dispose=registerStatePersistence({key:'qa.liquidity.inspect',scope:'cell',serialize:ctx=>{contexts.push(ctx);return undefined;},restore:()=>{}});
 try{document.querySelector('#saveWorkspace').click();}finally{dispose();}
 const chart=contexts.find(ctx=>ctx.chart.market.timeframe==='30')?.chart;
 assert(chart,'Open a 30-minute chart in the isolated preview');
 const handle=chart.indicators().find(h=>h.source?.includes('indicator("Agentic - Liquidity"'));
 assert(handle&&!handle.source.includes('int cleanLabelLimit='),'Current unlimited badge source installed');
 const catalog=await (await fetch('/pine-examples/agentic-liquidity.pine',{cache:'no-store'})).text();
 assert(handle.source.replace(/\r\n/g,'\n')===catalog.replace(/\r\n/g,'\n'),'Saved chart uses the exact current catalog source');
 const model=await wait(()=>{
  const entry=chart.orchestrator.registry.get(handle.id);
  return !entry?.loading&&chart.rendererControl.renderer.scene.indicators.get(handle.id);
 });
 const badges=model.labels.filter(l=>/ · \d+\/100$/.test(l.text));
 const main=model.lines.filter(l=>l.style==='solid'&&l.width===2);
 assert(badges.length>8,'Exercise more than eight source groups');
 for(const line of main)assert(badges.some(l=>l.color.slice(0,7)===line.color.slice(0,7)&&line.y1>=l.deskLiquiditySpan[0]-1e-8&&line.y1<=l.deskLiquiditySpan[1]+1e-8),'Every main line has a badge');
 const trace={markers:0,purpleStrokes:0},proto=CanvasRenderingContext2D.prototype,fill=proto.fillText,stroke=proto.stroke;
 try{
  proto.fillText=function(text,...args){if(text==='1×')trace.markers++;return fill.call(this,text,...args);};
  proto.stroke=function(...args){if(String(this.strokeStyle).toLowerCase()==='#b388ff')trace.purpleStrokes++;return stroke.apply(this,args);};
  chart.rendererControl.renderer.scheduler.invalidate(4);
  await new Promise(r=>setTimeout(r,600));
 }finally{proto.fillText=fill;proto.stroke=stroke;}
 assert(trace.markers>0,'Micro shared dots painted on actual canvas');
 assert(trace.purpleStrokes>0,'Purple shared outlines painted on actual canvas');
 return {passed:true,market:chart.market,badges:badges.length,mainLines:main.length,sharedLines:main.filter(l=>l.deskLiquidityShared).length,canvas:trace};
}
