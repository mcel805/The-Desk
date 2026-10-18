import test from 'node:test';
import assert from 'node:assert/strict';

class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.style={};this.dataset={};this.className='';this.hidden=false;this.classList={toggle(){}};}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=children;}
 setAttribute(){}
 remove(){this.removed=true;}
}

globalThis.document={createElement:tag=>new Element(tag)};
globalThis.localStorage={values:new Map(),getItem(key){return this.values.get(key)??null;},setItem(key,value){this.values.set(key,String(value));}};

const {createAgenticElliotPanel}=await import('../web/agentic-elliot-panel.mjs');

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
