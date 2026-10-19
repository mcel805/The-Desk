import test from 'node:test';
import assert from 'node:assert/strict';

class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.style={};this.dataset={};this.className='';this.hidden=false;this.attributes={};this.listeners=new Map();this.classList={toggle(){}};}
 append(...children){for(const child of children)child.parentElement=this;this.children.push(...children);}
 replaceChildren(...children){this.children=children;}
 setAttribute(key,value){this.attributes[key]=value;}
 addEventListener(type,handler){const handlers=this.listeners.get(type)||[];handlers.push(handler);this.listeners.set(type,handlers);}
 dispatchEvent(event){event.target??=this;event.stopPropagation??=()=>{event.stopped=true;};this['on'+event.type]?.(event);for(const handler of this.listeners.get(event.type)||[])handler(event);if(!event.stopped)this.parentElement?.dispatchEvent(event);}
 setPointerCapture(pointerId){Element.capture={pointerId,owner:this};}
 remove(){this.removed=true;}
}

globalThis.document={createElement:tag=>new Element(tag)};
globalThis.localStorage={values:new Map(),getItem(key){return this.values.get(key)??null;},setItem(key,value){this.values.set(key,String(value));}};

const {createAgenticElliotPanel}=await import('../web/agentic-elliot-panel.mjs');
const {createAgenticABCPanel}=await import('../web/agentic-abc-panel.mjs');

test('summary panel follows a public position update immediately',()=>{
 const overlay=new Element('div'),panel=createAgenticElliotPanel(overlay,'panel-test');
 panel.update({tables:[{position:'bottom_right',cells:[[{text:'Frame'}]]}]});
 assert.equal(panel.root.style.right,'12px');
 assert.equal(panel.root.style.bottom,'12px');
 panel.syncPosition('top_left');
 assert.equal(panel.root.style.left,'12px');
 assert.equal(panel.root.style.top,'12px');
 assert.equal(panel.root.style.right,'auto');
 assert.equal(panel.root.style.bottom,'auto');
 panel.destroy();
});

test('ABC panel renders both campaign tables, collapses, drags and restores independently of Elliott',()=>{
 const overlay=new Element('div');overlay.getBoundingClientRect=()=>({width:800,height:600});
 const model={tables:[{position:'bottom_right',cells:[[{text:'ABC'},{text:'LONG'}],[{text:'C?'},{text:'100',textColor:'#FFC35C'}]]},{position:'top_right',cells:[[{text:'ABC'},{text:'SHORT'}]]}]};
 const panel=createAgenticABCPanel(overlay,'shared-id');panel.update(model);
 assert.equal(panel.root.attributes['aria-label'],'Agentic - ABC Reversal summary');
 const [bar,content]=panel.root.children,toggle=bar.children[1];assert.equal(content.children[0].children.length,2);
 panel.root.offsetLeft=20;panel.root.offsetTop=30;panel.root.offsetWidth=200;panel.root.offsetHeight=100;
 bar.onpointerdown({button:0,target:bar,clientX:25,clientY:35,pointerId:1,preventDefault(){}});
 bar.onpointermove({clientX:125,clientY:135});bar.onpointerup();
 assert.equal(panel.root.style.left,'120px');assert.equal(panel.root.style.top,'130px');
 toggle.onclick();assert.equal(content.hidden,true);assert.equal(toggle.attributes['aria-label'],'Expand ABC summary');
 const saved=JSON.parse(localStorage.getItem('desk.agentic-abc.panel.v1.shared-id'));assert.deepEqual(saved,{collapsed:true,position:{left:120,top:130}});
 panel.destroy();assert.equal(panel.root.removed,true);
 const restored=createAgenticABCPanel(overlay,'shared-id');restored.update(model);assert.equal(restored.root.style.left,'120px');assert.equal(restored.root.style.top,'130px');assert.equal(restored.root.children[1].hidden,true);
 const elliott=createAgenticElliotPanel(overlay,'shared-id');elliott.update(model);assert.equal(elliott.root.children[1].hidden,false);assert.equal(elliott.root.style.right,'12px');
 restored.root.children[0].children[1].onclick();assert.equal(restored.root.children[1].hidden,false);
 restored.update({tables:[model.tables[1]]});assert.equal(restored.root.style.left,'120px');assert.equal(restored.root.style.top,'130px');
 restored.update({tables:[]});assert.equal(restored.root.hidden,true);restored.update(model);assert.equal(restored.root.hidden,false);assert.equal(restored.root.style.left,'120px');
 restored.destroy();elliott.destroy();
});

// The native plot listens for bubbling pointerdown and captures the pointer itself.
// Calling header handlers directly misses that capture theft.
test('ABC drag keeps pointer ownership and isolates chart gestures for mouse and touch',()=>{
 for(const pointerType of ['mouse','touch']){
  const plot=new Element('plot'),overlay=new Element('overlay');plot.append(overlay);
  overlay.getBoundingClientRect=()=>({width:800,height:600});
  const chartEvents=[];
  for(const type of ['pointerdown','pointermove','pointerup','pointercancel','mousedown','mousemove','mouseup','click','dblclick','contextmenu','wheel'])plot.addEventListener(type,e=>{chartEvents.push(type);if(type==='pointerdown')plot.setPointerCapture(e.pointerId);});
  const panel=createAgenticABCPanel(overlay,'gesture-'+pointerType),model={tables:[{position:'bottom_right',cells:[[{text:'ABC'}]]}]};panel.update(model);
  Object.assign(panel.root,{offsetLeft:300,offsetTop:200,offsetWidth:240,offsetHeight:180});
  const [bar,content]=panel.root.children,[title,toggle]=bar.children;
  const send=(target,type,extra={})=>target.dispatchEvent({type,button:0,pointerId:17,pointerType,clientX:350,clientY:210,preventDefault(){},...extra});
  send(title,'pointerdown');assert.equal(Element.capture.owner,bar,'chart must not steal header capture');
  send(Element.capture.owner,'pointermove',{clientX:170,clientY:110});
  // Live model refresh during the drag must preserve the position and header.
  panel.update(model);
  send(Element.capture.owner,'pointerup');
  assert.equal(panel.root.style.left,'120px');assert.equal(panel.root.style.top,'100px');
  for(const type of ['pointerdown','pointerup','mousedown','mouseup','click'])send(toggle,type);
  assert.equal(content.hidden,true,'collapse click remains functional');
  for(const type of ['pointerdown','pointermove','pointerup','pointercancel','mousedown','mousemove','mouseup','dblclick','contextmenu','wheel'])send(content,type);
  assert.deepEqual(chartEvents,[],'panel gestures must not pan, zoom or draw on the chart');
  panel.destroy();
  const restored=createAgenticABCPanel(overlay,'gesture-'+pointerType);restored.update(model);
  assert.equal(restored.root.style.left,'120px');assert.equal(restored.root.style.top,'100px');assert.equal(restored.root.children[1].hidden,true);restored.destroy();
 }
});
