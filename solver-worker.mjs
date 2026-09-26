import {solvePreview,solvePartialPreview} from './domain.mjs';
self.onmessage=({data})=>{try{
  const started=Date.now(),constrained=Object.keys(data.constraints?.times||{}).length||Object.keys(data.constraints?.intervals||{}).length;
  let result,attempts=0;
  for(let attempt=0;attempt<(constrained?24:1);attempt++){
    if(attempt&&Date.now()-started>42000)break;
    attempts++;postMessage({type:'progress',revision:data.revision,attempt:attempts});
    result=solvePreview(data.rows,data.settings,data.remoteMap,{seed:(data.seed+attempt*7919)>>>0,constraints:data.constraints,deadline:started+42000});
    if(result.ok||result.constraintConflict)break;
  }
  if(!result.ok&&constrained){postMessage({type:'progress',revision:data.revision,attempt:attempts,partial:true});result.partialPreview=solvePartialPreview(data.rows,data.settings,data.remoteMap,{seed:data.seed,constraints:data.constraints,deadline:started+55000});}
  postMessage({type:'result',revision:data.revision,result,attempts});
}catch(error){postMessage({type:'error',message:error.message||'本次試排未完成。'});}};
