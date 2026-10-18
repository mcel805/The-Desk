import test from 'node:test';
import assert from 'node:assert/strict';

const noop=()=>{};
globalThis.document={body:{append:noop},createElement:()=>({setAttribute:noop,addEventListener:noop})};
globalThis.window={addEventListener:noop};
const {setupPineEditor,loadPineLibrary}=await import('../web/pine-editor.mjs');
setupPineEditor({saveSettings:async()=>{}});

const source='//@version=6\nindicator("Taper fixture")\nplot(close)';
const response={ok:true,text:async()=>source};

test('startup seeds only Taper and preserves the prior full-library behavior',async()=>{
 const saved=[];let fetched=[];
 globalThis.fetch=async url=>{fetched.push(url);return response;};
 await loadPineLibrary({pineLibrary:[]});
 assert.deepEqual(fetched,['/pine-examples/taper-volume.pine']);

 fetched=[];
 const full=Array.from({length:5},(_,i)=>({name:`Saved ${i}`,source:`source-${i}`}));
 globalThis.fetch=async url=>{fetched.push(url);return response;};
 setupPineEditor({saveSettings:async settings=>saved.push(settings)});
 await loadPineLibrary({pineLibrary:full});
 assert.deepEqual(fetched,['/pine-examples/taper-volume.pine']);
 assert.equal(saved.at(-1).pineLibrary.length,6);
 assert.equal(saved.at(-1).pineLibrary.at(-1).name,"Taper's Volume");
 assert.equal(saved.at(-1).pineLibrary.some(item=>item.name==='Agentic - Elliot Waves'),false);

 fetched=[];saved.length=0;
 await loadPineLibrary({pineLibrary:[...full,{name:'Saved 5',source:'source-5'}]});
 assert.deepEqual(fetched,[]);
 assert.deepEqual(saved,[]);
});
