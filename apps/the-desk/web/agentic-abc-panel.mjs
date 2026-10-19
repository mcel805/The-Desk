import {createAgenticElliotPanel} from './agentic-elliot-panel.mjs';

// Share Elliott's drag, collapse, positioning and table rendering behavior.
export function createAgenticABCPanel(overlay,id){
 return createAgenticElliotPanel(overlay,id,{
  titleText:'Agentic - ABC Reversal',label:'ABC',
  storagePrefix:'desk.agentic-abc.panel.v1.',allTables:true,className:'agentic-abc-float',defaultPosition:'bottom_right'
 });
}
