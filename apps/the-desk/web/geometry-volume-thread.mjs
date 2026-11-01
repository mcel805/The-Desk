import {GeometryVolumeComputation} from './geometry-volume-compute.mjs';
let state,key;
self.onmessage=({data:m})=>{try{if(m.key!==key){key=m.key;state=new GeometryVolumeComputation(m.config);}const result=state.update(m.sources,m.cutoff);self.postMessage({generation:m.generation,result,checkpoint:state.checkpoint()});}catch(error){self.postMessage({generation:m.generation,error:error.message});}};
