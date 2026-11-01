// Independent OHLC reference for the supplied default micro setup rules.
// No Pine/PineTS imports; recognition indices are completed chart bars.
export function sweepMicroReference(bars,{tick,micro=1,minTicks=4,minAtr=.25,minBreak=1,sequence=1,expiry=40}={}){
 const atr=[],trueRanges=[],highPivots=[],lowPivots=[],setupSides=[],ledger=[];let hh=0,ll=0;
 for(let i=0;i<bars.length;i++){
  const b=bars[i],prior=bars[i-1];trueRanges.push(Math.max(b.high-b.low,prior?Math.abs(b.high-prior.close):0,prior?Math.abs(b.low-prior.close):0));
  atr.push(i<13?null:i===13?trueRanges.reduce((a,v)=>a+v,0)/14:(atr[i-1]*13+trueRanges[i])/14);
  for(const p of ledger)if(p.side===1?b.high>=p.price:b.low<=p.price)p.taken=true;
  const center=i-micro,c=bars[center],window=bars.slice(center-micro,i+1),ready=center>=micro;
  const ph=ready&&window.every((x,j)=>j===micro||x.high<c.high),pl=ready&&window.every((x,j)=>j===micro||x.low>c.low);
  highPivots.push(+ph);lowPivots.push(+pl);let setup=0;
  const side=ph&&!pl?1:pl&&!ph?-1:0;
  if(side){const p={side,price:side===1?c.high:c.low,index:center,taken:false},last=ledger.at(-1);let accepted=false,extension=false;
   if(!last){ledger.push(p);accepted=true;}
   else if(last.side===side){if(side*(p.price-last.price)>0){ledger[ledger.length-1]=p;accepted=true;extension=true;}}
   else if(side*(p.price-last.price)>=Math.max(minTicks*tick,(atr[center]||0)*minAtr)){ledger.push(p);accepted=true;}
   if(ledger.length>12)ledger.shift();
   if(accepted&&ledger.length>=3){const previous=ledger.at(-3),pool=ledger.at(-2),broke=side*(p.price-previous.price)>=minBreak*tick;
    if(!extension){if(side===1)hh=broke?hh+1:0;else ll=broke?ll+1:0;}
    if(broke&&!extension&&(side===1?hh:ll)>=sequence&&!pool.taken&&i-pool.index<=expiry)setup=side;
   }
  }
  setupSides.push(setup);
 }
 return {highPivots,lowPivots,setupSides,atr};
}
