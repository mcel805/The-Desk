// Compatibility bridge for an already running collector. No provider calls.
let pending=null,last=null,at=0;
export async function withJevCosts(data){
  if(data.costs)return data;
  try{
    if(!last||Date.now()-at>2000){
      if(!pending)pending=fetch('/data/jev-costs.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Cost observer unavailable');return r.json();}).then(v=>{last=v;at=Date.now();return v;}).finally(()=>{pending=null;});
      await pending;
    }
    const stale=Date.now()-last.as_of>12000;
    return {...data,costs:{...last,stale}};
  }catch{return {...data,costs:last?{...last,stale:true}:null};}
}
