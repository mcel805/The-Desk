import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChartMenuActions } from '../web/chart-menu-actions.mjs';

function fixture({empty=false,cursorTime=1_800_000_000_000}={}){
 const calls=[];
 const drawingRows=empty?[]:[{id:'d1'},{id:'d2'}];
 const handles=empty?[]:[{remove:()=>calls.push(['indicator:remove','i1'])},{remove:()=>calls.push(['indicator:remove','i2'])}];
 const chart={drawings:{all:()=>drawingRows,paste:()=>calls.push(['paste']),add:(type,init)=>{calls.push(['add',type,init]);return{id:'marker'};},lock:(id,on)=>calls.push(['lock',id,on]),removeMany:ids=>calls.push(['removeMany',ids])},indicators:()=>handles,renderer:{openSettings:section=>calls.push(['settings',section])}};
 const cell={chart,resetView:()=>calls.push(['reset'])};
 const workspace={context:()=>({togglePanel:(id,on)=>calls.push(['panel',id,on])})};
 const actions=buildChartMenuActions({chart,cell,price:51902,priceLabel:'51,902',cursorTime,workspace,copyPrice:value=>calls.push(['copy',value]),openAlert:value=>calls.push(['alert',value]),stageTrade:(...args)=>calls.push(['trade',...args]),side:'buy',openTemplates:()=>calls.push(['templates']),toast:value=>calls.push(['toast',value])});
 return {actions,calls};
}

test('placement labels describe direct and reviewed chart actions',()=>{
 const direct=fixture().actions;
 assert.equal(direct.find(x=>x.id==='buy').label,'Buy limit at 51,902 · Review & place · PAPER');
 const oneClick=buildChartMenuActions({price:51902,priceLabel:'51,902',placementLabel:'Place now · PAPER'});
 assert.equal(oneClick.find(x=>x.id==='buy').label,'Buy limit at 51,902 · Place now · PAPER');
});

test('right-click chart actions carry out their expected chart and paper-ticket effects',async()=>{
 const {actions,calls}=fixture();
 assert.deepEqual(actions.map(x=>x.id),['reset','copy','paste','alert','buy','sell','order','lock-time','table','objects','template','remove-drawings','remove-indicators','settings']);
 for(const item of actions)await item.run();
 assert.deepEqual(calls,[
  ['reset'],['copy',51902],['paste'],['alert',51902],['trade','buy','limit',51902],['trade','sell','limit',51902],['trade','buy','limit',51902],
  ['add','vline',{anchors:[{time:1_800_000_000_000,price:51902}]}],['lock','marker',true],['toast','Vertical time marker added and locked.'],
  ['panel','dataWindow',true],['panel','objects',true],['templates'],['removeMany',['d1','d2']],['indicator:remove','i1'],['indicator:remove','i2'],['settings','Canvas'],
 ]);
});

test('empty cleanup actions are disabled and a missing time disables the locked marker',()=>{
 const {actions}=fixture({empty:true,cursorTime:null});
 for(const id of ['remove-drawings','remove-indicators','lock-time'])assert.equal(actions.find(x=>x.id===id)?.disabled,true,id);
 for(const id of ['reset','copy','paste','alert','buy','sell','order','table','objects','template','settings'])assert.equal(actions.find(x=>x.id===id)?.disabled,undefined,id);
});
