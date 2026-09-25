import {solvePreview} from './domain.mjs';
self.onmessage=({data})=>{try{const result=solvePreview(data.rows,data.settings,data.remoteMap,{seed:data.seed});postMessage({type:'result',revision:data.revision,result});}catch(error){postMessage({type:'error',message:error.message||'本次試排未完成。'});}};
