export class RecordingLifecycle {
 constructor({postRoll=120000}={}){this.postRoll=postRoll;this.active=false;this.deadline=null;this.traded=false;}
 observe({orders=[],positions=[]},now){
  const working=orders.some(o=>['limit','stop_limit'].includes(o.kind)&&['working','triggered'].includes(o.status));
  const open=positions.length>0;
  if(working||open){this.deadline=null;this.traded ||= open;if(!this.active){this.active=true;return 'start';}}
  else if(this.active){if(this.deadline===null)this.deadline=now+this.postRoll;if(now>=this.deadline){this.active=false;return this.traded?'closed':'cancelled';}}
  return null;
 }
}
