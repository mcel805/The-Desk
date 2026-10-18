const STORAGE_PREFIX='desk.agentic-elliot.panel.v1.';
const corners={top_left:{top:12,left:12},top_right:{top:12,right:12},bottom_left:{bottom:12,left:12},bottom_right:{bottom:12,right:12}};

function readState(id){try{return JSON.parse(localStorage.getItem(STORAGE_PREFIX+id)||'{}');}catch{return {};}}
function writeState(id,value){try{localStorage.setItem(STORAGE_PREFIX+id,JSON.stringify(value));}catch{}}

export function createAgenticElliotPanel(overlay,id){
 const saved=readState(id),root=document.createElement('section');root.className='agentic-elliot-float';root.dataset.studyId=id;root.setAttribute('aria-label','Agentic - Elliot Waves summary');
 const bar=document.createElement('header');bar.className='agentic-elliot-float-bar';const title=document.createElement('strong');title.textContent='Agentic - Elliot Waves';const toggle=document.createElement('button');toggle.type='button';toggle.className='agentic-elliot-collapse';toggle.setAttribute('aria-label',saved.collapsed?'Expand Elliott summary':'Collapse Elliott summary');toggle.textContent=saved.collapsed?'＋':'−';bar.append(title,toggle);
 const content=document.createElement('div');content.className='agentic-elliot-float-content';root.append(bar,content);overlay.append(root);
 let collapsed=Boolean(saved.collapsed),position=saved.position??null,requestedPosition=null,drag=null;
 function applyPosition(defaultPosition){if(position){root.style.left=position.left+'px';root.style.top=position.top+'px';root.style.right='auto';root.style.bottom='auto';return;}const p=corners[defaultPosition]||corners.bottom_right;root.style.left=p.left==null?'auto':p.left+'px';root.style.right=p.right==null?'auto':p.right+'px';root.style.top=p.top==null?'auto':p.top+'px';root.style.bottom=p.bottom==null?'auto':p.bottom+'px';}
 function syncPosition(defaultPosition){if(!defaultPosition)return;if(requestedPosition!==null&&requestedPosition!==defaultPosition)position=null;requestedPosition=defaultPosition;applyPosition(defaultPosition);writeState(id,{collapsed,position});}
 function setCollapsed(value){collapsed=value;root.classList.toggle('is-collapsed',collapsed);content.hidden=collapsed;toggle.textContent=collapsed?'＋':'−';toggle.setAttribute('aria-label',collapsed?'Expand Elliott summary':'Collapse Elliott summary');writeState(id,{collapsed,position});}
 toggle.onclick=()=>setCollapsed(!collapsed);
 bar.onpointerdown=e=>{if(e.button!==0||e.target===toggle)return;e.preventDefault();drag={x:e.clientX,y:e.clientY,left:root.offsetLeft,top:root.offsetTop};bar.setPointerCapture(e.pointerId);};
 bar.onpointermove=e=>{if(!drag)return;const bounds=overlay.getBoundingClientRect(),maxLeft=Math.max(0,bounds.width-root.offsetWidth),maxTop=Math.max(0,bounds.height-Math.min(root.offsetHeight,38));const left=Math.max(0,Math.min(maxLeft,drag.left+e.clientX-drag.x)),top=Math.max(0,Math.min(maxTop,drag.top+e.clientY-drag.y));position={left,top};root.style.left=left+'px';root.style.top=top+'px';root.style.right='auto';root.style.bottom='auto';};
 const finishDrag=()=>{if(!drag)return;drag=null;writeState(id,{collapsed,position});};bar.onpointerup=finishDrag;bar.onpointercancel=finishDrag;bar.onlostpointercapture=finishDrag;
 setCollapsed(collapsed);
 function update(model){const table=model?.tables?.[0];if(!table){root.hidden=true;return;}root.hidden=false;syncPosition(table.position);content.replaceChildren();const scroller=document.createElement('div');scroller.className='agentic-elliot-table-wrap';const grid=document.createElement('table');grid.className='agentic-elliot-table';
  for(const [rowIndex,row] of (table.cells||[]).entries()){const tr=document.createElement('tr');for(const cell of row||[]){const td=document.createElement(rowIndex===0?'th':'td');td.textContent=String(cell?.text??'');if(cell?.textColor)td.style.color=cell.textColor;if(cell?.backgroundColor)td.style.backgroundColor=cell.backgroundColor;if(cell?.tooltip)td.title=cell.tooltip;tr.append(td);}grid.append(tr);}scroller.append(grid);content.append(scroller);setCollapsed(collapsed);
 }
 return {root,update,syncPosition,destroy(){root.remove();}};
}
