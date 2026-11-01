// Slow responses must not turn interval ticks into a queue of server requests.
export function singleFlight(task){
 let pending=null;
 return (...args)=>{
  if(!pending)pending=Promise.resolve().then(()=>task(...args)).finally(()=>{pending=null;});
  return pending;
 };
}
