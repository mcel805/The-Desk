import {GeometryComputation} from './market-geometry-compute.mjs';
let state,key;
self.onmessage=({data:m})=>{try{if(m.key!==key){key=m.key;state=new GeometryComputation(m.config);}const result=state.update(m.sources,m.cutoff);self.postMessage({generation:m.generation,result});}catch(error){self.postMessage({generation:m.generation,error:error.message});}};
